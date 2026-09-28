import { test, describe, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { execFileSync } from 'node:child_process'
import { check, slug } from './check-docs.mjs'

const roots = []
afterEach(() => { while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true }) })

const WORKFLOW = '---\ntype: workflow\nversion: 1.0.0\n---\n\n# Spec Workflow\n\nExamples such as GD1 and SEC-4 are not checked here.\n'

const COMPONENT = `---
type: architecture
title: Secrets
codes: [SEC]
verified: abc1234
---

# Secrets

## Design

### Role

Stores secrets. See [the index](README.md#overview).

### Decisions

**XD1. Absence is narrow.** SEC-1.
*Why:* a reason.
*Cost:* a cost.

### Findings

| # | Finding | State |
| :-- | :-- | :-- |
| XF1 | A finding about SEC-1. | open |

### History

None.

### Verification

- **XS1, a spike.** Not run.

## Specification

### Runtime

#### SEC-1 · Absence is only NOT_FOUND

\`getSecret\` returns \`undefined\` only on NOT_FOUND.

- Test: \`secrets.test.ts\` › reads a missing secret

#### SEC-2 · Planned cleanup

Old versions are destroyed.

- Test: none yet
- State: new (RFC-0001)

## Critique

### XD1

**Pros**
- one

**Cons & trade-offs**
- two

**Blindspots & missed edge cases**
- three
`

const INDEX = `---
type: architecture-index
title: Store
prefix: X
codes: []
verified: abc1234
---

# Store

## Design

### Overview

The store. Documents: [secrets](secrets.md#sec-1--absence-is-only-not_found).

### Documents

| Document | Codes | Covers |
| :-- | :-- | :-- |
| [\`secrets.md\`](secrets.md) | SEC | secrets |

### Decisions

| # | Decision | Where |
| :-- | :-- | :-- |
| XU1 | Use the store. | XD1 |

### History

None.

### Register

| ID | Summary | State | Document |
| :-- | :-- | :-- | :-- |
| XU1 | use the store | decided | README |
| XD1 | absence | current | secrets |
| XF1 | a finding | open | secrets |
| XS1 | a spike | not run | secrets |

## Specification

None.

## Critique

### The set

**Pros**
- a

**Cons & trade-offs**
- b

**Blindspots & missed edge cases**
- c
`

const RFC = `---
type: rfc
number: 1
title: Cleanup
status: draft
commits: []
depends: []
architecture: [store/secrets.md]
commit-subject: feat: clean up
---

# RFC-0001: Cleanup

## Summary

Implements SEC-2 (XD1).

## Files

None.

## Specification

SEC-2 becomes current.

## Non-goals

None.

## Tests

None.

## Steps

1. Do it.

## Verification

Run the tests.

## Critique

**Pros**
- a

**Cons & trade-offs**
- b

**Blindspots & missed edge cases**
- c
`

function project (overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'check-docs-'))
  roots.push(root)
  const files = {
    'docs/WORKFLOW.md': WORKFLOW,
    'docs/README.md': '---\ntype: docs-index\nworkflow: 1.0.0\n---\n\n# Docs\n\n[store](architecture/store/README.md), [rfcs](rfcs/README.md)\n',
    'docs/architecture/store/README.md': INDEX,
    'docs/architecture/store/secrets.md': COMPONENT,
    'docs/rfcs/README.md': '---\ntype: rfc-index\n---\n\n# RFCs\n\n| RFC | Title |\n| :-- | :-- |\n| [0001](0001-cleanup.md) | Cleanup |\n',
    'docs/rfcs/0001-cleanup.md': RFC,
    'docs/templates/architecture.md': '# <Subject>\n\nNot checked: <P>D1, [broken](nowhere.md)\n',
    ...overrides
  }
  for (const [path, content] of Object.entries(files)) {
    if (content === null) continue
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  return root
}

const run = (root) => check(join(root, 'docs')).entries
const errors = (root) => run(root).filter(e => e.level === 'error')
const rules = (root) => errors(root).map(e => `${e.rule}: ${e.message}`)
const edit = (content, from, to) => { assert.ok(content.includes(from), `fixture lacks ${from}`); return content.replace(from, to) }

describe('check-docs', () => {
  test('a conforming project has no errors', () => {
    assert.deepEqual(rules(project()), [])
  })

  test('slugs follow GitHub', () => {
    assert.equal(slug('SEC-1 · Absence is only NOT_FOUND'), 'sec-1--absence-is-only-not_found')
  })

  test('a statement needs a Test line', () => {
    const root = project({ 'docs/architecture/store/secrets.md': edit(COMPONENT, '- Test: `secrets.test.ts` › reads a missing secret\n', '') })
    assert.deepEqual(rules(root), ["statement: SEC-1 has no '- Test:' line"])
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

  test('critique paragraphs are required', () => {
    const root = project({ 'docs/architecture/store/secrets.md': edit(COMPONENT, '**Cons & trade-offs**\n- two\n', '') })
    assert.deepEqual(rules(root), ["critique: 'XD1' lacks **Cons & trade-offs**"])
  })

  test('links resolve to files and anchors', () => {
    const root = project({ 'docs/architecture/store/secrets.md': edit(COMPONENT, 'README.md#overview', 'README.md#nowhere') })
    assert.deepEqual(rules(root), ['link: README.md#nowhere: no heading with anchor #nowhere'])
  })

  test('the workflow version matches the vendored WORKFLOW.md', () => {
    const root = project({ 'docs/WORKFLOW.md': WORKFLOW.replace('1.0.0', '2.0.0') })
    assert.deepEqual(rules(root), ['front-matter: workflow 1.0.0 does not match WORKFLOW.md 2.0.0'])
  })

  test('an implemented RFC names commits known to git', () => {
    const root = project({ 'docs/rfcs/0001-cleanup.md': edit(RFC, 'status: draft\ncommits: []', 'status: implemented\ncommits: [deadbee]') })
    execFileSync('git', ['init', '-q'], { cwd: root })
    assert.deepEqual(rules(root), ['rfc: commit deadbee is not known to git'])
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
    const bare = project({ 'docs/architecture/store/secrets.md': readFileSync(new URL(import.meta.url)).toString().slice(0, 0) + '# Bare\n' })
    assert.ok(rules(bare).includes('front-matter: missing front matter'))
  })
})
