#!/usr/bin/env node
/**
 * Spec Workflow verification record (WORKFLOW.md §11.2). No dependencies: Node ≥ 20.
 *
 *   node docs/tools/record.mjs <docsDir> --junit <level>=<report.xml> … [--defer <level>] … --build passed|failed [--out verification.json]
 *
 * Runs the documentation, results and release checkers, reads the test counts from the JUnit XML, and
 * writes the record. Prints what each checker found, and exits 1 unless every check passed.
 */
import { writeFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { analyze, printReport } from './check-docs.mjs'
import { checkResults, parseReport } from './check-results.mjs'
import { checkRelease } from './check-release.mjs'

const SCHEMA = 1
const STATUSES = ['passed', 'failed']
const USAGE = 'usage: record.mjs <docsDir> --junit <level>=<report.xml> … [--defer <level>] … --build passed|failed [--out verification.json]'

const status = (ok) => (ok ? 'passed' : 'failed')
const hasNoErrors = (report) => !report.entries.some(e => e.level === 'error')
const byId = (a, b) => a.localeCompare(b, 'en', { numeric: true })

function headCommit (root) {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch { return null }
}

function outcomeCounts (cases) {
  const count = (outcome) => cases.filter(c => c.outcome === outcome).length
  return { total: cases.length, passed: count('passed'), failed: count('failed'), skipped: count('skipped') }
}

function testCounts (cases, carrying, reports) {
  const levels = [...new Set(reports.map(r => r.level))]
  return { ...outcomeCounts(cases), carrying_ids: carrying, levels: Object.fromEntries(levels.map(level => [level, outcomeCounts(cases.filter(c => c.level === level))])) }
}

function statementSummary (statements, verified) {
  const all = [...statements.values()]
  const current = all.filter(s => s.state === 'current')
  return {
    total: current.length,
    verified: current.filter(s => verified.has(s.id)).length,
    unverified: current.filter(s => !verified.has(s.id)).map(s => s.id).sort(byId),
    new: all.filter(s => s.state === 'new').map(s => s.id).sort(byId)
  }
}

const workflowOf = (docs) => String(docs.find(d => d.front?.type === 'docs-index')?.front.workflow ?? '')

/** The verification record of the working tree, and the reports of the checkers behind it. */
function record ({ docsDir, junit, deferred = [], build }) {
  const docs = analyze(docsDir)
  const results = checkResults(docsDir, junit, deferred)
  const release = checkRelease(docsDir)
  const tests = testCounts(results.cases, results.carrying, junit)
  const checks = {
    spec_check: status(hasNoErrors(docs.report)),
    build,
    tests: status(tests.total > 0 && tests.failed === 0),
    test_traceability: status(hasNoErrors(results.report)),
    release_impact: status(hasNoErrors(release.report))
  }
  return {
    record: {
      schema: SCHEMA,
      workflow: workflowOf(docs.docs),
      commit: headCommit(dirname(resolve(docsDir))),
      created: new Date().toISOString(),
      checks,
      statements: statementSummary(docs.statements, results.verified),
      tests,
      packages: release.packages,
      deferred,
      releasable: Object.values(checks).every(check => check === 'passed') && deferred.length === 0
    },
    reports: { spec_check: docs.report, test_traceability: results.report, release_impact: release.report }
  }
}

const passed = (verification) => Object.values(verification.checks).every(check => check === 'passed')

function parseArguments (args) {
  const options = { docsDir: undefined, junit: [], deferred: [], build: undefined, out: 'verification.json' }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--junit') options.junit.push(parseReport(args[++i]))
    else if (args[i] === '--defer') options.deferred.push(args[++i])
    else if (args[i] === '--build') options.build = args[++i]
    else if (args[i] === '--out') options.out = args[++i]
    else if (options.docsDir === undefined) options.docsDir = args[i]
    else return null
  }
  const complete = options.docsDir !== undefined && options.junit.length > 0 && !options.junit.includes(null) && !options.deferred.includes(undefined) && STATUSES.includes(options.build) && options.out !== undefined
  return complete ? options : null
}

function main () {
  const options = parseArguments(process.argv.slice(2))
  if (options === null) { console.error(USAGE); process.exit(2) }
  const missing = [options.docsDir, ...options.junit.map(r => r.path)].filter(path => !existsSync(path))
  if (missing.length > 0) { console.error(`${missing.join(', ')} does not exist`); process.exit(2) }
  const { record: verification, reports } = record({ ...options, docsDir: resolve(options.docsDir), junit: options.junit.map(r => ({ ...r, path: resolve(r.path) })) })
  for (const [check, report] of Object.entries(reports)) { console.log(`── ${check}`); printReport(report, process.cwd()) }
  writeFileSync(options.out, `${JSON.stringify(verification, null, 2)}\n`)
  console.log(`\n${options.out}: ${Object.entries(verification.checks).map(([check, result]) => `${check} ${result}`).join(', ')}; ${verification.releasable ? 'releasable' : 'not releasable'}`)
  process.exit(passed(verification) ? 0 : 1)
}

export { record, passed }

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
