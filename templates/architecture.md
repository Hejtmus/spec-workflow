---
type: architecture
title: <Subject>
prefix: <P>
codes: [<CODE>]
verified: <commit>
---

# <Subject>

<!-- In a directory, drop `prefix` from the front matter: the index declares it. -->

## Design

### Role

What this component is for, who uses it, and where its boundaries are.

### Decisions

| # | Decision | Where |
| :-- | :-- | :-- |
| <P>U1 | A decision the author made. | <CODE>-1 |

**<P>D1. A design decision, in one sentence.** The statements it produces: <CODE>-1.
*Why:* the reason, and what it rules out.
*Cost:* what it makes harder.

### Findings

| # | Finding | State |
| :-- | :-- | :-- |
| <P>F1 | A fact about reality, usually a defect or a constraint, with where it was found. | open |

### History

*History.* Previous states, kept short: what, why, when.

### Verification

What the tests cover, how to run checks that need real services, spikes and falsification audits
(`**<P>S1, …**`).

## Specification

### <Group>

#### <CODE>-1 · <Short title>

The normative behavior. Plain present tense means MUST; **SHOULD** and **MAY** in capitals mark
weaker requirements.

- Test: `<test file, from the repository root>`
- Level: <levels from docs/README.md, such as unit, e2e>

<!-- Each test that checks this statement carries `<CODE>-1` in its title. -->

