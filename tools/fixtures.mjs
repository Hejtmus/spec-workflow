/** A minimal conforming project, for the checkers' tests. Not vendored into projects. */
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'

const roots = []

export function removeProjects () {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true })
}

export const WORKFLOW = '---\ntype: workflow\nversion: 1.0.0\n---\n\n# Spec Workflow\n\nExamples such as GD1 and SEC-4 are not checked here.\n'

export const COMPONENT = `---
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

- Test: \`src/secrets.test.ts\`

#### SEC-2 · Planned cleanup

Old versions are destroyed.

- Test: none yet
- State: new (RFC-0001)
`

export const INDEX = `---
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
`

export const RFC = `---
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

export const TESTS = "test('SEC-1: reads a missing secret', () => {})\n"

/** Writes the project to a temporary directory, with `overrides` by path; `null` leaves a file out. */
export function project (overrides = {}) {
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
    'src/secrets.test.ts': TESTS,
    ...overrides
  }
  for (const [path, content] of Object.entries(files)) {
    if (content === null) continue
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  return root
}

/** `content` with `from` replaced by `to`; fails when the fixture lacks `from`. */
export function edit (content, from, to) {
  assert.ok(content.includes(from), `fixture lacks ${from}`)
  return content.replace(from, to)
}
