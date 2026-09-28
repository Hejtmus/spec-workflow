import { test, describe, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { checkResults, readTestCases } from './check-results.mjs'
import { COMPONENT, edit, project, removeProjects } from './fixtures.mjs'

afterEach(removeProjects)

const junit = (...cases) => `<?xml version="1.0" encoding="utf-8"?>\n<testsuites>\n<testsuite name="secrets">\n${cases.join('\n')}\n</testsuite>\n</testsuites>\n`
const passed = (name) => `<testcase name="${name}" classname="secrets" time="0.001"/>`
const failed = (name) => `<testcase name="${name}" classname="secrets"><failure message="boom">stack</failure></testcase>`
const skipped = (name) => `<testcase name="${name}" classname="secrets"><skipped type="skipped"/></testcase>`

/** The checker's entries for `root`, given one report with `xml`. */
function results (root, xml) {
  const path = join(root, 'report.xml')
  writeFileSync(path, xml)
  return checkResults(join(root, 'docs'), [path]).report.entries.map(e => `${e.level}: ${e.message}`)
}

const REMOVED = '#### ~~SEC-3 · Old~~\n\nGone.\n\n- Test: unverified\n- State: removed (RFC-0001)\n\n#### SEC-2 · Planned cleanup'

describe('check-results', () => {
  test('a current statement passes with a passing test carrying its ID', () => {
    assert.deepEqual(results(project(), junit(passed('SEC-1: reads a missing secret'))), [])
  })

  test('a failing test, or no passing test, is an error', () => {
    assert.deepEqual(results(project(), junit(passed('SEC-1: reads'), failed('SEC-1: propagates'))), ["error: SEC-1: test 'SEC-1: propagates' failed"])
    assert.deepEqual(results(project(), junit(passed('unrelated'))), ['error: SEC-1 has no passing test carrying its ID'])
  })

  test('a skipped test does not count as passing', () => {
    assert.deepEqual(results(project(), junit(skipped('SEC-1: reads'))), ['error: SEC-1 has no passing test carrying its ID'])
  })

  test('a test carrying an undefined or removed ID is an error', () => {
    const root = project({ 'docs/architecture/store/secrets.md': edit(COMPONENT, '#### SEC-2 · Planned cleanup', REMOVED) })
    const entries = results(root, junit(passed('SEC-1: reads'), passed('SEC-9: ghost'), passed('SEC-3: old')))
    assert.deepEqual(entries, ["error: test 'SEC-9: ghost' carries SEC-9, which is not defined", "error: test 'SEC-3: old' carries SEC-3, which is removed"])
  })

  test('a new statement need not pass, and an unverified one warns when a test carries it', () => {
    const unverified = project({ 'docs/architecture/store/secrets.md': edit(COMPONENT, '- Test: `src/secrets.test.ts`', '- Test: unverified') })
    assert.deepEqual(results(unverified, junit(failed('SEC-2: destroys old versions'), passed('SEC-1: reads'))), ["warning: SEC-1 says unverified, but test 'SEC-1: reads' carries its ID"])
  })

  test('only declared codes of conforming documents count as IDs', () => {
    const legacy = '---\ntype: architecture\ntitle: Old\ncodes: [OLD]\nconforms: false\n---\n\n# Old\n'
    const root = project({ 'docs/architecture/old.md': legacy })
    assert.deepEqual(results(root, junit(passed('SEC-1: reads'), passed('OLD-4: legacy'), passed('parses ISO-8601 dates'))), [])
  })

  test('JUnit names are decoded, and quoted > does not end a test case', () => {
    const root = project()
    const path = join(root, 'report.xml')
    writeFileSync(path, junit('<testcase name="SEC-1: a &amp; b &gt; c" file=\'x > y\'></testcase>', '<testcase name="SEC-1: &#x41;&#66;"/>'))
    assert.deepEqual(readTestCases(path).map(c => `${c.outcome}: ${c.name}`), ['passed: SEC-1: a & b > c', 'passed: SEC-1: AB'])
  })
})
