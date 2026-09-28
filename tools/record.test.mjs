import { test, describe, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { record, passed } from './record.mjs'
import { COMPONENT, edit, project, removeProjects } from './fixtures.mjs'

afterEach(removeProjects)

const git = (root, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: root, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
const junit = (...cases) => `<testsuites><testsuite name="s">${cases.join('')}</testsuite></testsuites>\n`
const UNVERIFIED = `${COMPONENT}\n#### SEC-3 · Reads are cached\n\nA read is cached for a minute.\n\n- Test: unverified\n- Level: unit\n`

/** A committed project with one package, and a JUnit report holding `cases`. */
function recordedProject (cases, overrides = {}) {
  const root = project({ 'package.json': '{ "name": "secrets", "version": "1.0.0" }\n', ...overrides })
  writeFileSync(join(root, 'report.xml'), junit(...cases))
  git(root, 'init', '-q')
  git(root, 'add', '-A')
  git(root, 'commit', '-q', '-m', 'one')
  return root
}

const recordOf = (root, build = 'passed', deferred = []) => record({ docsDir: join(root, 'docs'), junit: [{ level: 'unit', path: join(root, 'report.xml') }], deferred, build }).record

describe('record', () => {
  test('the record states the commit, the checks, the statements, the tests and the packages', () => {
    const root = recordedProject(['<testcase name="SEC-1: reads"/>', '<testcase name="unrelated"/>', '<testcase name="later"><skipped/></testcase>'], { 'docs/architecture/store/secrets.md': UNVERIFIED })
    const verification = recordOf(root)
    assert.equal(verification.commit, git(root, 'rev-parse', 'HEAD'))
    assert.deepEqual({ ...verification, commit: undefined, created: undefined }, {
      schema: 1,
      workflow: '1.0.0',
      commit: undefined,
      created: undefined,
      checks: { spec_check: 'passed', build: 'passed', tests: 'passed', test_traceability: 'passed', release_impact: 'passed' },
      statements: { total: 2, verified: 1, unverified: ['SEC-3'], new: ['SEC-2'] },
      tests: { total: 3, passed: 2, failed: 0, skipped: 1, carrying_ids: 1, levels: { unit: { total: 3, passed: 2, failed: 0, skipped: 1 } } },
      packages: [{ name: 'secrets', version: '1.0.0', released: false }],
      deferred: [],
      releasable: true
    })
    assert.equal(passed(verification), true)
  })

  test('a failed build, a failing test or a traceability error fails the record', () => {
    assert.equal(recordOf(recordedProject(['<testcase name="SEC-1: reads"/>']), 'failed').checks.build, 'failed')
    const failing = recordOf(recordedProject(['<testcase name="SEC-1: reads"><failure/></testcase>']))
    assert.deepEqual([failing.checks.tests, failing.checks.test_traceability, passed(failing)], ['failed', 'failed', false])
    assert.equal(recordOf(recordedProject([])).checks.tests, 'failed', 'a run without tests verifies nothing')
  })

  test('a run that deferred a level is not releasable, even when every check passed', () => {
    const verification = recordOf(recordedProject(['<testcase name="SEC-1: reads"/>']), 'passed', ['e2e'])
    assert.deepEqual([passed(verification), verification.deferred, verification.releasable], [true, ['e2e'], false])
  })

  test('a documentation error fails the spec check', () => {
    const broken = edit(COMPONENT, 'README.md#overview', 'README.md#nowhere')
    assert.equal(recordOf(recordedProject(['<testcase name="SEC-1: reads"/>'], { 'docs/architecture/store/secrets.md': broken })).checks.spec_check, 'failed')
  })
})
