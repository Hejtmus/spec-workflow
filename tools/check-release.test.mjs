import { test, describe, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { execFileSync } from 'node:child_process'
import { checkRelease, parseVersion, compareVersions, allows } from './check-release.mjs'
import { COMPONENT, RFC, WORKFLOW, edit, project, removeProjects } from './fixtures.mjs'

afterEach(removeProjects)

const git = (root, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: root, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
const write = (root, path, content) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), content) }
const manifest = (version) => `${JSON.stringify({ name: '@x/secrets', version })}\n`
const index = (workflow) => `---\ntype: docs-index\nworkflow: ${workflow}\nlevels: [unit, e2e]\n---\n\n# Docs\n\n[store](architecture/store/README.md), [rfcs](rfcs/README.md)\n`
const CHANGED = edit(COMPONENT, '`getSecret` returns `undefined` only on NOT_FOUND.', '`getSecret` returns `undefined` on NOT_FOUND and PERMISSION_DENIED.')
const ADDED = `${COMPONENT}\n#### SEC-3 · Reads are cached\n\nA read is cached for a minute.\n\n- Test: unverified\n- Level: unit\n`

function commitAll (root, message) {
  git(root, 'add', '-A')
  git(root, 'commit', '-q', '-m', message)
  return git(root, 'rev-parse', '--short', 'HEAD')
}

/** A monorepo whose `@x/secrets` package is released at 1.2.0, under workflow `workflow`. */
function releasedProject (workflow = '3.0.0') {
  const root = project({
    'docs/WORKFLOW.md': WORKFLOW.replace('1.0.0', workflow),
    'docs/README.md': index(workflow),
    'packages/secrets/package.json': manifest('1.2.0'),
    'packages/secrets/src/index.ts': 'export {}\n',
    'packages/demo/package.json': `${JSON.stringify({ name: '@x/demo', version: '0.0.1', private: true })}\n`
  })
  git(root, 'init', '-q')
  commitAll(root, 'one')
  git(root, 'tag', '@x/secrets@1.2.0')
  return root
}

function rfcFor (commit, changes, summary) {
  const implemented = edit(edit(RFC, 'number: 1', 'number: 2'), 'status: draft\ncommits: []', `status: implemented\ncommits: [${commit}]\nchanges: [${changes}]`)
  return edit(edit(implemented, 'Implements SEC-2 (XD1).', summary), '## Files\n\nNone.', '## Files\n\n| File | Change |\n| :-- | :-- |\n| `packages/secrets/src/index.ts` | change |')
}

/** Changes the Specification to `component` in the secrets package, through an RFC unless `rfc` is false. */
function change (root, { component, changes = '', summary = 'Changes the secrets.', rfc = true }) {
  write(root, 'docs/architecture/store/secrets.md', component)
  write(root, 'packages/secrets/src/index.ts', 'export const changed = 1\n')
  const commit = commitAll(root, 'feat: change the secrets')
  if (!rfc) return
  write(root, 'docs/rfcs/0002-change.md', rfcFor(commit, changes, summary))
  commitAll(root, 'docs: implemented')
}

function release (root, version) {
  write(root, 'packages/secrets/package.json', manifest(version))
  const { report, plan, packages } = checkRelease(join(root, 'docs'))
  return { entries: report.entries.map(e => `${e.level}: ${e.message}`), plan, packages }
}

const v = parseVersion

describe('check-release', () => {
  test('versions compare by semantic versioning precedence', () => {
    const order = ['1.0.0-alpha.2', '1.0.0-alpha.10', '1.0.0-alpha.beta', '1.0.0-beta', '1.0.0', '1.0.1', '1.1.0', '2.0.0']
    assert.deepEqual([...order].reverse().map(v).sort(compareVersions).map(x => x.text), order)
    assert.equal(v('1.2'), null)
  })

  test('a stable version needs a major for breaking and a minor for added changes', () => {
    assert.equal(allows(v('1.2.0'), v('2.0.0'), 'breaking'), true)
    assert.equal(allows(v('1.2.0'), v('1.3.0'), 'breaking'), false)
    assert.equal(allows(v('1.2.0'), v('1.3.0'), 'added'), true)
    assert.equal(allows(v('1.2.0'), v('1.2.1'), 'added'), false)
    assert.equal(allows(v('1.2.0'), v('1.2.1'), 'compatible'), true)
  })

  test('0.y.z needs a minor for breaking changes; 0.0.z and prereleases are exempt', () => {
    assert.equal(allows(v('0.6.2'), v('0.7.0'), 'breaking'), true)
    assert.equal(allows(v('0.6.2'), v('0.6.3'), 'breaking'), false)
    assert.equal(allows(v('0.6.2'), v('0.6.3'), 'added'), true)
    assert.equal(allows(v('0.0.26'), v('0.0.27'), 'breaking'), true)
    assert.equal(allows(v('1.0.0'), v('1.0.1-alpha.21'), 'breaking'), true)
  })

  test('a classified breaking change needs a new major, and names its RFC in the plan', () => {
    const root = releasedProject()
    change(root, { component: CHANGED, changes: 'SEC-1 breaking' })
    assert.deepEqual(release(root, '1.3.0').entries, ['error: @x/secrets 1.3.0 is too low for the statement changes since @x/secrets@1.2.0, the largest of them breaking'])
    const { entries, plan } = release(root, '2.0.0')
    assert.deepEqual(entries, [])
    assert.deepEqual(plan, [{ name: '@x/secrets', manifest: 'packages/secrets/package.json', version: '2.0.0', baseline: '@x/secrets@1.2.0', required: 'breaking', rfcs: [{ number: 2, title: 'Cleanup', summary: 'Changes the secrets.' }] }])
  })

  test('a prerelease may carry a breaking change', () => {
    const root = releasedProject()
    change(root, { component: CHANGED, changes: 'SEC-1 breaking' })
    assert.deepEqual(release(root, '1.3.0-alpha.0').entries, [])
  })

  test('a changed statement that no RFC classifies is an error', () => {
    const root = releasedProject()
    change(root, { component: CHANGED, rfc: false })
    assert.deepEqual(release(root, '2.0.0').entries, ['error: SEC-1 is changed since @x/secrets@1.2.0, and no RFC implemented since classifies it in changes'])
  })

  test('an added statement needs a minor when an RFC names it, and none when it documents existing behavior', () => {
    const named = releasedProject()
    change(named, { component: ADDED, summary: 'Adds SEC-3.' })
    assert.deepEqual(release(named, '1.2.1').entries, ['error: @x/secrets 1.2.1 is too low for the statement changes since @x/secrets@1.2.0, the largest of them added'])
    assert.deepEqual(release(named, '1.3.0').entries, [])
    const documented = releasedProject()
    change(documented, { component: ADDED, rfc: false })
    assert.deepEqual(release(documented, '1.2.1').entries, [])
  })

  test('a released version plans nothing, a lower one is an error, and private packages are left out', () => {
    const root = releasedProject()
    const unchanged = release(root, '1.2.0')
    assert.deepEqual(unchanged.plan, [])
    assert.deepEqual(unchanged.packages, [{ name: '@x/secrets', version: '1.2.0', released: true }])
    assert.deepEqual(release(root, '1.1.0').entries, ['error: @x/secrets 1.1.0 is lower than the released 1.2.0'])
  })

  test('a baseline from before workflow 3.0.0 is not checked', () => {
    const root = releasedProject('2.2.0')
    change(root, { component: CHANGED, rfc: false })
    assert.deepEqual(release(root, '1.2.1').entries, ['warning: @x/secrets@1.2.0 predates workflow 3.0.0: release impact not checked'])
  })
})
