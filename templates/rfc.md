---
type: rfc
number: <N>
title: <Title>
status: draft
commits: []
depends: []
architecture: [<document>]
commit-subject: <type(scope): subject>
---

# RFC-<NNNN>: <Title>

## Summary

The problem, with the findings it fixes, and the change in a few numbered points.

## Files

**Modify or create only:**

| File | Change |
| :-- | :-- |

## Specification

The target state, by statement: which statements are added, changed or removed, and their exact
new text. Then everything the implementer needs: signatures, types, error messages, defaults.

## Non-goals

- What is explicitly out of scope, so the implementer does not touch it.

## Tests

Each test by file and exact title, the title carrying the statement IDs it checks, and its assertion
as *given / when / then*, in terms of behavior. The author reviews these descriptions, not the test
code.

- `<test file>` › `<CODE>-1: <title>`: given …, when …, then ….

## Steps

1. Baseline: the current test counts and check results.
2. Tests: written from the Specification and this RFC, marked as expected failures, and committed
   before the code, SHOULD be by an agent session that has not seen the implementation.
3. …: the implementation removes the expected-failure markers and changes no assertion.
4. Run §Verification.

## Verification

```bash
# commands, each with its expected output below
```

A falsification audit of each statement this RFC adds or changes (WORKFLOW §6.3), by an agent that
did not write the code, recorded as a Verification entry.

## Critique

**Pros**
- …

**Cons & trade-offs**
- …

**Blindspots & missed edge cases**
- …
