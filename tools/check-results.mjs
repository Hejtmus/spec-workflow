#!/usr/bin/env node
/**
 * Spec Workflow test results checker (WORKFLOW.md §6.2, §9). No dependencies: Node ≥ 20.
 *
 *   node docs/tools/check-results.mjs <docsDir> <report.xml> …
 *
 * Reads the JUnit XML reports of a test run. Prints `path:line: level: rule: message` for every error
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

/** Every `<testcase>` of a report as `{ name, outcome, file, line }`. */
function readTestCases (path) {
  const xml = readFileSync(path, 'utf-8')
  return [...xml.matchAll(TESTCASE)].map(match => ({
    name: attributes(match[1]).name ?? '',
    outcome: outcome(match[2] ?? ''),
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

/** A current statement that names test files has a passing test carrying its ID, and no failing one. */
function checkStatement (statement, cases, report) {
  const at = [statement.doc.path, statement.line + 1, 'result']
  for (const failed of cases.filter(c => c.outcome === 'failed')) report.error(...at, `${statement.id}: test '${failed.name}' failed`)
  if (!cases.some(c => c.outcome === 'passed')) report.error(...at, `${statement.id} has no passing test carrying its ID`)
}

const isChecked = (statement) => statement.state === 'current' && statement.test?.kind === 'files'

function checkResults (docsDir, reportPaths) {
  const { statements, codes } = analyze(docsDir)
  const report = createReport()
  const cases = reportPaths.flatMap(readTestCases)
  const byId = indexTestCases(cases, statements, codes, report)
  const checked = [...statements.values()].filter(isChecked)
  for (const statement of checked) checkStatement(statement, byId.get(statement.id) ?? [], report)
  return { report, checked: checked.length, cases: cases.length }
}

function main () {
  const [docsArg, ...reportArgs] = process.argv.slice(2)
  if (docsArg === undefined || reportArgs.length === 0) { console.error('usage: check-results.mjs <docsDir> <report.xml> …'); process.exit(2) }
  const missing = [docsArg, ...reportArgs].filter(path => !existsSync(path))
  if (missing.length > 0) { console.error(`${missing.join(', ')} does not exist`); process.exit(2) }
  const { report, checked, cases } = checkResults(resolve(docsArg), reportArgs.map(p => resolve(p)))
  console.log(`${checked} statement(s) checked against ${cases} test case(s)`)
  const errors = printReport(report, process.cwd())
  process.exit(errors > 0 ? 1 : 0)
}

export { checkResults, readTestCases }

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
