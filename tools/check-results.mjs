#!/usr/bin/env node
/**
 * Spec Workflow test results checker (WORKFLOW.md §6.2, §9). No dependencies: Node ≥ 20.
 *
 *   node docs/tools/check-results.mjs <docsDir> <level>=<report.xml> … [--defer <level>] …
 *
 * Reads the JUnit XML reports of a test run, each labeled with its test level. Prints `path:line: level: rule: message` for every error
 * and warning, and exits 1 when there is an error.
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { analyze, createReport, printReport } from './check-docs.mjs'

// ─── Reading JUnit XML ──────────────────────────────────────────────────────

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const TESTCASE = /<testcase\b((?:[^>"']|"[^"]*"|'[^']*')*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g

function decodeXml (text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name) => {
    if (name.startsWith('#x') || name.startsWith('#X')) return String.fromCodePoint(parseInt(name.slice(2), 16))
    if (name.startsWith('#')) return String.fromCodePoint(Number(name.slice(1)))
    return ENTITIES[name] ?? whole
  })
}

function attributes (text) {
  return Object.fromEntries([...text.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(([, key, double, single]) => [key, decodeXml(double ?? single)]))
}

function outcome (body) {
  if (/<(failure|error)\b/.test(body)) return 'failed'
  if (/<skipped\b/.test(body)) return 'skipped'
  return 'passed'
}

const lineAt = (text, index) => text.slice(0, index).split('\n').length

/** Every `<testcase>` of a report as `{ name, outcome, level, file, line }`. */
function readTestCases (path, level) {
  const xml = readFileSync(path, 'utf-8')
  return [...xml.matchAll(TESTCASE)].map(match => ({
    name: attributes(match[1]).name ?? '',
    outcome: outcome(match[2] ?? ''),
    level,
    file: path,
    line: lineAt(xml, match.index)
  }))
}

// ─── Matching tests to statements ───────────────────────────────────────────

/** The statement IDs a test title carries, for any declared code. */
function carriedIds (name, codes) {
  if (codes.length === 0) return []
  const pattern = new RegExp(`(?<![A-Za-z0-9-])((?:${codes.join('|')})-\\d+)(?![0-9])`, 'g')
  return [...new Set([...name.matchAll(pattern)].map(m => m[1]))]
}

/** Test cases by the IDs of conforming statements they carry; reports IDs that resolve to nothing current. */
function indexTestCases (cases, statements, codes, report) {
  const byId = new Map()
  const allCodes = [...codes.conforming, ...codes.other]
  for (const testCase of cases) {
    for (const id of carriedIds(testCase.name, allCodes)) {
      if (!codes.conforming.has(id.split('-')[0])) continue
      checkCarriedId(testCase, id, statements.get(id), report)
      byId.set(id, [...(byId.get(id) ?? []), testCase])
    }
  }
  return byId
}

function checkCarriedId (testCase, id, statement, report) {
  if (statement === undefined) report.error(testCase.file, testCase.line, 'result', `test '${testCase.name}' carries ${id}, which is not defined`)
  else if (statement.state === 'removed') report.error(testCase.file, testCase.line, 'result', `test '${testCase.name}' carries ${id}, which is removed`)
  else if (statement.test?.kind === 'unverified') report.warning(statement.doc.path, statement.line + 1, 'result', `${id} says unverified, but test '${testCase.name}' carries its ID`)
}

const passesAt = (cases, level) => cases.some(c => c.level === level && c.outcome === 'passed')

/** A current statement that names test files has, for each of its levels, a passing test carrying its ID, and no failing one. */
function checkStatement (statement, cases, deferred, report) {
  const at = [statement.doc.path, statement.line + 1, 'result']
  for (const failed of cases.filter(c => c.outcome === 'failed')) report.error(...at, `${statement.id}: ${failed.level} test '${failed.name}' failed`)
  for (const level of statement.levels.filter(l => !passesAt(cases, l))) {
    if (deferred.includes(level)) report.warning(...at, `${statement.id}: its ${level} tests are deferred`)
    else report.error(...at, `${statement.id} has no passing ${level} test carrying its ID`)
  }
}

/** Every report, and every deferred level, names a level that docs/README.md declares. */
function checkReportLevels (docsDir, reports, deferred, levels, report) {
  for (const { level, path } of reports) if (!levels.includes(level)) report.error(path, 1, 'result', `level ${level} is not declared in docs/README.md levels`)
  for (const level of deferred.filter(l => !levels.includes(l))) report.error(docsDir, 1, 'result', `deferred level ${level} is not declared in docs/README.md levels`)
}

const isChecked = (statement) => statement.state === 'current' && statement.test?.kind === 'files'
const isVerified = (statement, cases) => statement.levels.every(level => passesAt(cases, level)) && !cases.some(c => c.outcome === 'failed')

/** Checks the `{ level, path }` reports of a run against the statements; `deferred` lists the levels the run did not run. */
function checkResults (docsDir, reports, deferred = []) {
  const { statements, codes, levels } = analyze(docsDir)
  const report = createReport()
  checkReportLevels(docsDir, reports, deferred, levels, report)
  const cases = reports.flatMap(({ level, path }) => readTestCases(path, level))
  const byId = indexTestCases(cases, statements, codes, report)
  const checked = [...statements.values()].filter(isChecked)
  for (const statement of checked) checkStatement(statement, byId.get(statement.id) ?? [], deferred, report)
  const verified = new Set(checked.filter(s => isVerified(s, byId.get(s.id) ?? [])).map(s => s.id))
  return { report, checked: checked.length, cases, verified, carrying: new Set([...byId.values()].flat()).size }
}

/** `<level>=<path>` as `{ level, path }`; `null` without a level. */
function parseReport (arg) {
  const match = /^([a-z][a-z0-9-]*)=(.+)$/.exec(arg ?? '')
  return match === null ? null : { level: match[1], path: match[2] }
}

function main () {
  const usage = 'usage: check-results.mjs <docsDir> <level>=<report.xml> … [--defer <level>] …'
  const [docsArg, ...args] = process.argv.slice(2)
  const deferred = args.flatMap((arg, i) => (args[i - 1] === '--defer' ? [arg] : []))
  const reports = args.filter((arg, i) => arg !== '--defer' && args[i - 1] !== '--defer').map(parseReport)
  if (docsArg === undefined || reports.length === 0 || reports.includes(null)) { console.error(usage); process.exit(2) }
  const missing = [docsArg, ...reports.map(r => r.path)].filter(path => !existsSync(path))
  if (missing.length > 0) { console.error(`${missing.join(', ')} does not exist`); process.exit(2) }
  const { report, checked, cases } = checkResults(resolve(docsArg), reports.map(r => ({ ...r, path: resolve(r.path) })), deferred)
  console.log(`${checked} statement(s) checked against ${cases.length} test case(s)`)
  const errors = printReport(report, process.cwd())
  process.exit(errors > 0 ? 1 : 0)
}

export { checkResults, readTestCases, parseReport }

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
