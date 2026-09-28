import { test, describe, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { check, slug, parseFrontMatter } from './check-docs.mjs'
import { COMPONENT, INDEX, RFC, WORKFLOW, edit, project, removeProjects } from './fixtures.mjs'

afterEach(removeProjects)

const run = (root) => check(join(root, 'docs')).entries
const errors = (root) => run(root).filter(e => e.level === 'error')
const rules = (root) => errors(root).map(e => `${e.rule}: ${e.message}`)
const withTest = (line) => ({ 'docs/architecture/store/secrets.md': edit(COMPONENT, '- Test: `src/secrets.test.ts`', line) })

/** Makes `root` a git repository; returns a commit in the history of HEAD and one outside it. */
function gitRepository (root) {
  const git = (...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: root, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  git('init', '-q')
  git('commit', '-q', '--allow-empty', '-m', 'one')
  return { ancestor: git('rev-parse', '--short', 'HEAD'), outside: git('commit-tree', 'HEAD^{tree}', '-m', 'squashed').slice(0, 7) }
}

describe('check-docs', () => {
  test('a conforming project has no errors', () => {
    assert.deepEqual(rules(project()), [])
  })

  test('slugs follow GitHub', () => {
    assert.equal(slug('SEC-1 · Absence is only NOT_FOUND'), 'sec-1--absence-is-only-not_found')
  })

  test('a statement needs a Test line', () => {
    assert.deepEqual(rules(project(withTest(''))), ["statement: SEC-1 has no '- Test:' line"])
  })

  test('the Test line has one of the forms', () => {
    assert.deepEqual(rules(project(withTest('- Test: `src/secrets.test.ts` › reads a missing secret'))), ["statement: SEC-1: '- Test: `src/secrets.test.ts` › reads a missing secret' is none of the forms in WORKFLOW §6.1"])
    assert.deepEqual(rules(project(withTest('- Test: unverified (needs a real server)'))), [])
    assert.deepEqual(rules(project(withTest('- Test: `src/secrets.test.ts` (unverified: the retry delay)'))), [])
  })

  test('named test files exist and carry the statement ID', () => {
    assert.deepEqual(rules(project(withTest('- Test: `src/secrets.test.ts`, `src/gone.test.ts`'))), ['test: src/gone.test.ts does not exist'])
    const other = project({ 'src/secrets.test.ts': "test('SEC-12: something else', () => {})\n" })
    assert.deepEqual(rules(other), ['test: src/secrets.test.ts has no test carrying SEC-1'])
  })

  test("'none yet' is only for new statements", () => {
    const root = project({ 'docs/architecture/store/secrets.md': edit(COMPONENT, '- State: new (RFC-0001)\n', '') })
    assert.deepEqual(rules(root), ["statement: 'none yet' is only for a statement with State new"])
  })

  test('statement codes must be declared, and statements unique', () => {
    const root = project({ 'docs/architecture/store/secrets.md': edit(COMPONENT, '#### SEC-2 · Planned cleanup', '#### SEC-1 · Planned cleanup') })
    assert.ok(rules(root).some(r => r.startsWith('statement: SEC-1 is already defined')))
  })

  test('every mentioned ID and statement is defined', () => {
    const root = project({ 'docs/rfcs/0001-cleanup.md': edit(RFC, 'Implements SEC-2 (XD1).', 'Implements SEC-9 (XD7).') })
    assert.deepEqual(rules(root).sort(), ['id: XD7 is not defined', 'statement: SEC-9 is not defined'])
  })

  test('the register lists every ID and nothing else', () => {
    const root = project({ 'docs/architecture/store/README.md': edit(INDEX, '| XS1 | a spike | not run | secrets |\n', '| XQ9 | stale | open | secrets |\n') })
    assert.deepEqual(rules(root).sort(), ['register: XQ9 is in the register but not defined', 'register: XS1 is defined but not in the register'])
  })

  test('an ID is defined once', () => {
    const root = project({ 'docs/architecture/store/secrets.md': edit(COMPONENT, '**XS1, a spike.**', '**XD1, again.**') })
    assert.ok(rules(root).some(r => r.startsWith('id: XD1 is already defined')))
  })

  test('design sections are required, in order', () => {
    const swapped = edit(edit(COMPONENT, '### History\n', '### TMP\n'), '### Findings\n', '### History\n').replace('### TMP\n', '### Findings\n')
    const root = project({ 'docs/architecture/store/secrets.md': swapped })
    assert.ok(rules(root).some(r => r.includes("Design: 'History' is out of order") || r.includes("Design: 'Findings' is out of order")))
  })

  test('an architecture document holds no Critique', () => {
    const root = project({ 'docs/architecture/store/secrets.md': `${COMPONENT}\n## Critique\n\n### XD1\n\n**Pros**\n- one\n` })
    assert.deepEqual(rules(root), ['structure: an architecture document holds no ## Critique: critiques live in RFCs (WORKFLOW §5.1)'])
  })

  test('RFC critique paragraphs are required unless legacy', () => {
    const lacking = edit(RFC, '**Cons & trade-offs**\n- b\n', '')
    assert.deepEqual(rules(project({ 'docs/rfcs/0001-cleanup.md': lacking })), ['critique: the Critique lacks **Cons & trade-offs**'])
    assert.deepEqual(rules(project({ 'docs/rfcs/0001-cleanup.md': edit(lacking, 'commit-subject: feat: clean up', 'commit-subject: feat: clean up\nsections: legacy') })), [])
  })

  test('links resolve to files and anchors', () => {
    const root = project({ 'docs/architecture/store/secrets.md': edit(COMPONENT, 'README.md#overview', 'README.md#nowhere') })
    assert.deepEqual(rules(root), ['link: README.md#nowhere: no heading with anchor #nowhere'])
  })

  test('the workflow version matches the vendored WORKFLOW.md', () => {
    const root = project({ 'docs/WORKFLOW.md': WORKFLOW.replace('1.0.0', '2.0.0') })
    assert.deepEqual(rules(root), ['front-matter: workflow 1.0.0 does not match WORKFLOW.md 2.0.0'])
  })

  test('an implemented RFC names commits in the history of HEAD', () => {
    const root = project()
    const { ancestor, outside } = gitRepository(root)
    const implement = (commits) => writeFileSync(join(root, 'docs/rfcs/0001-cleanup.md'), edit(RFC, 'status: draft\ncommits: []', `status: implemented\ncommits: [${commits}]`))
    implement(ancestor)
    assert.deepEqual(rules(root), [])
    implement(`deadbee, ${outside}`)
    assert.deepEqual(rules(root), ['rfc: commit deadbee is not known to git', `rfc: commit ${outside} is not in the history of HEAD: squashed or rebased? (WORKFLOW §8.3)`])
  })

  test('RFC sections are required unless legacy, and every RFC is listed', () => {
    const noSteps = edit(RFC, '## Steps\n\n1. Do it.\n\n', '')
    assert.ok(rules(project({ 'docs/rfcs/0001-cleanup.md': noSteps })).some(r => r.startsWith('structure: ## sections must be exactly')))
    assert.deepEqual(rules(project({ 'docs/rfcs/0001-cleanup.md': edit(noSteps, 'commit-subject: feat: clean up', 'commit-subject: feat: clean up\nsections: legacy') })), [])
    const unlisted = project({ 'docs/rfcs/README.md': '---\ntype: rfc-index\n---\n\n# RFCs\n' })
    assert.deepEqual(rules(unlisted), ['rfc: 0001-cleanup.md is not listed'])
  })

  test('a document that does not conform yet is only a warning', () => {
    const legacy = '---\ntype: architecture\ntitle: Old\nconforms: false\n---\n\n# Old\n\nFree-form text with D1 and F2.\n'
    const entries = run(project({ 'docs/architecture/old.md': legacy }))
    assert.deepEqual(entries.map(e => `${e.level}: ${e.rule}`), ['warning: conforms'])
  })

  test('front matter is required and its keys are checked', () => {
    const root = project({ 'docs/architecture/store/secrets.md': edit(COMPONENT, 'verified: abc1234', 'verified: abc1234\nowner: me') })
    assert.deepEqual(rules(root), ["front-matter: unknown key 'owner' for type architecture"])
    const bare = project({ 'docs/architecture/store/secrets.md': '# Bare\n' })
    assert.ok(rules(bare).includes('front-matter: missing front matter'))
  })

  test('a fence closes only with the same marker, at least as long', () => {
    const nested = '\n````\n#### SEC-9 · Inside an example\n\n```pseudo\nreturn XD7\n```\n````\n'
    const root = project({ 'docs/architecture/store/secrets.md': edit(COMPONENT, 'Old versions are destroyed.\n', `Old versions are destroyed.\n${nested}`) })
    assert.deepEqual(rules(root), [])
  })

  test('quoted list items may contain commas', () => {
    assert.deepEqual(parseFrontMatter(['---', 'architecture: ["a, b", c]', '---']).data.architecture, ['a, b', 'c'])
  })
})
