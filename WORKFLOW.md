---
type: workflow
version: 1.0.0
---

# Spec Workflow

A development workflow for projects built mostly by coding agents. **People review
specifications. Agents write code. Tests connect the two.**

This file is the canonical definition. A project keeps a verbatim copy at `docs/WORKFLOW.md`, and
that copy governs the project. `docs/tools/check-docs.mjs` enforces what can be checked mechanically.

The key words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT** and **MAY** are to be interpreted as
described in RFC 2119 and RFC 8174 when, and only when, they appear in capitals.

## 1. Principles

1. **The pipeline is one-directional.** Reality → architecture documents → RFCs → code. It is never
   reversed or skipped.
2. **Reproducibility.** The Specification parts of a project's architecture documents MUST be enough
   for a competent agent or human, **with no access to the code**, to rebuild the system
   functionally. Everything observable from outside a component belongs there: contracts and the
   types that cross them, data formats and persisted layouts, protocols and the external APIs used,
   error codes and messages, security invariants, configuration surfaces and defaults, and the
   reasons behind non-obvious choices. Internal structure that does not change behavior does not.
3. **Review the specification, verify with tests.** The author does not review code. Every
   Specification statement names the test that checks it. Reviewing an agent's work means reviewing
   the Specification diff and confirming that the named tests pass.
4. **Architecture documents hold the current state. RFCs are history.** An RFC is a planned change.
   Once implemented, it is frozen, and every behavior-relevant detail it introduced lives in a
   Specification.
5. **Discovery rule.** When implementation meets a reality the documents did not foresee, the agent
   stops. The architecture document and the RFC are corrected first. The agent never writes an ad-hoc
   workaround.
6. **Drift audits.** Periodically, and before a component is changed, an agent compares the code
   against its Specification and records every mismatch as a finding. Neither side is silently
   corrected toward the other: each mismatch is the author's decision.

## 2. Roles

| Part | Owner | Agents |
| :-- | :-- | :-- |
| Architecture document, **Design** | the author: decisions, rationale | challenge assumptions, find gaps and edge cases, check against reality, draft for review |
| Architecture document, **Specification** | the author reviews | write and maintain |
| RFC | collaborative | elaborate in full technical detail under the author's guidance |
| Code and tests | — | implement RFCs exactly as written |

## 3. Repository layout

```
docs/
  README.md                  index: documents, ID prefixes, coverage, workflow version
  WORKFLOW.md                verbatim copy of this file
  templates/                 skeletons for every document type
  tools/check-docs.mjs       the checker
  architecture/
    <subject>.md             a subject small enough for one file
    <subject>/README.md      or a directory: an index document …
    <subject>/<component>.md … and one document per component
  rfcs/
    README.md                the list of RFCs, in implementation order
    NNNN-<slug>.md           one RFC per file
```

The checker runs from the repository root with `node docs/tools/check-docs.mjs docs`, before every
commit that touches `docs/`, and in CI.

## 4. Front matter

Every document starts with front matter: `---` lines around `key: value` pairs. Lists are written
`[a, b]`. Unknown keys are errors.

| `type` | Keys |
| :-- | :-- |
| `docs-index` | `workflow`: the version of this file that the project follows |
| `architecture` | `title`; `prefix`: the ID prefix, unique in the project; `codes`: statement codes, unique in the project; `verified`: the commit at which the *current* text was last checked against the code; `conforms`: `false` only for a document written before the project adopted the workflow |
| `architecture-index` | the same keys as `architecture`. The directory's documents share its `prefix` and its register. |
| `rfc-index` | none: the list of RFCs, `rfcs/README.md` |
| `rfc` | `number`; `title`; `status`: `draft`, `implemented` or `withdrawn`; `commits`: the implementing commits, required when `implemented`; `depends`: RFC numbers; `architecture`: the documents it changes; `commit-subject`: the commit message subject; `sections`: `legacy` only for an RFC written before the project adopted the workflow |

A document in a directory (`architecture/<subject>/<component>.md`) takes `prefix` from its index
and declares only `title`, `codes` and `verified`.

## 5. Architecture documents

### 5.1 Structure

A conforming architecture document has exactly one `#` title and three `##` parts, in this order:
`## Design`, `## Specification`, `## Critique`.

**Design** has `###` sections. The required ones appear in this order, and other sections MAY stand
between them:

| Document type | Required Design sections |
| :-- | :-- |
| `architecture` | `Role`, `Decisions`, `Findings`, `History`, `Verification` |
| `architecture-index` | `Overview`, `Documents`, `Decisions`, `History`, `Register` |

A required section with nothing to say contains `None.`

**Specification** has `###` groups of `####` statements (§6). An index document without shared
statements contains `None.`

**Critique** has one `###` section per decision or change critiqued. Each contains the three
paragraphs `**Pros**`, `**Cons & trade-offs**` and `**Blindspots & missed edge cases**`, as lists.
Every change to an architecture document or RFC adds or updates a critique.

### 5.2 Markers

| Marker | Meaning |
| :-- | :-- |
| none | current: implemented and true at the `verified` commit |
| **New** | decided, not yet implemented. Names its RFC, or says `no RFC yet`. Removed when the RFC lands. |
| *History.* | a previous state, kept short: what it was, why it changed, and when |

Facts are labeled by how they are known: by experiment (a spike, with its date and setup), from
external documentation (named), or not yet verified.

### 5.3 Design entries

- **Author decisions** (`U`) are rows of the Decisions table: `| GU1 | … | … |`.
- **Design decisions** (`D`) are paragraphs that start with `**GD1. Title.**`, followed by `*Why:*` and `*Cost:*`.
- **Findings** (`F`) are rows of the Findings table: `| GF1 | finding | state |`. A fixed finding keeps its row, marked *History.*
- **Verifications** (`S`) start with `**GS1, …**`, as a paragraph or a list item, or are rows of a table: `| GS1a | … |`.
- **Open questions** (`Q`) are rows of an `Open questions` table: `| GQ1 | question | recommendation |`.

## 6. Specification statements

```
#### SEC-4 · Absence is only NOT_FOUND

`getSecret` returns `undefined` when, and only when, the call fails with gRPC `NOT_FOUND` (5).
Every other failure propagates unchanged.

- Test: `secrets/runtime.test.ts` › reads a missing secret as undefined, and propagates every other failure
```

- The heading is `#### <CODE>-<n> · <short title>`. `CODE` is one of the document's `codes`.
- **The text is normative.** Plain present tense means MUST. Capitalized **SHOULD** and **MAY** mark weaker requirements.
- **`- Test:`** is required. It names the test that checks the statement, by file and title. Or it says `unverified`, optionally with the reason, or `none yet` for a **New** statement. A partly checked statement names its test and says which part is unverified.
- **`- State:`** is present only for a statement that is not current: `new (RFC-NNNN)`, `new (no RFC yet)`, or `removed (RFC-NNNN)`. A removed statement keeps its block, with its title struck through: `#### ~~SEC-9 · …~~`.
- **Numbers are never reused.** Gaps are allowed.
- **The boundary test:** *would a different but correct implementation have to match this?* If yes, it is a statement. If not, like a file path or an internal helper name, it belongs only in an RFC.

## 7. IDs

- Each architecture document or directory has a `prefix` of capital letters. IDs are the prefix, a category letter (`U`, `D`, `F`, `S`, `Q`) and a number, for example `GD4`. A lowercase letter MAY follow for sub-items, as in `GS1a`.
- An ID is defined exactly once. Its number is never reused, and it keeps its number when its text moves between files.
- A directory's index keeps a `### Register` table, `| ID | summary | state | document |`, listing every ID defined in the directory, without sub-items.
- Every mention of a prefixed ID, or of a statement such as `SEC-4`, anywhere in `docs/`, resolves to a definition.

## 8. RFCs

### 8.1 Content

An RFC is a **delta against a Specification**, from state X to state Y, plus a **change plan**:
files, steps, baselines and verification. It is written to be followed by an agent less capable
than its author: exact paths, signatures, data types, error codes, test titles and commands.

Its `##` sections, in order: `Summary`, `Files`, `Specification`, `Non-goals`, `Tests`, `Steps`,
`Verification`, `Critique`.

### 8.2 Lifecycle

1. **Draft.** The architecture document marks the target statements **New** with `State: new (RFC-NNNN)`, and the RFC specifies the change.
2. **Implementation.** The agent follows the RFC. A contradiction with reality is corrected in the RFC, and in the architecture document if needed, **before** the code is committed (discovery rule).
3. **Implemented.** `status: implemented` with `commits`. The architecture document drops the markers, cites the new tests and updates `verified`. From now on the RFC is **frozen**: its content is never edited again.
4. A later change is a new RFC that references the old one.

### 8.3 Commits

Documents and code are committed separately, in this order: the architecture change, then the RFC,
then the code, then the architecture document's update to current. Each commit passes the checker,
the build and the tests.

## 9. The checker

`check-docs.mjs` checks, and exits non-zero on any error:

1. front matter: types, required keys, enums, unique prefixes and codes, the workflow version against `docs/WORKFLOW.md`;
2. structure: the `#` title, the `##` parts and required `###` sections in order, critique paragraphs;
3. statements: heading format, a code the document declares, no duplicates, a `Test:` line, valid `State:` values, `none yet` only for **New** statements;
4. IDs: defined once, every mention defined, registers complete and not stale;
5. RFCs: file name against `number`, required sections unless `sections: legacy`, `commits` present and known to git when `implemented`, every RFC listed in `rfcs/README.md`;
6. links: every relative link resolves to a file, and every `#anchor` to a heading.

A document with `conforms: false` is checked only for front matter and links, and is reported as a
warning until it is restructured.

## 10. Adoption and updates

- **New or existing project:** `node <spec-workflow>/bin/init.mjs <project>` creates `docs/` with this file, the templates, the checker, `docs/README.md` and `docs/rfcs/README.md`. It never overwrites a document.
- **Update:** `node <spec-workflow>/bin/init.mjs <project> --update` replaces only the vendored files (`WORKFLOW.md`, `templates/`, `tools/`), then raise `workflow` in `docs/README.md`.
- **Existing documents:** give each a front matter. A document not yet restructured gets `conforms: false`, and an old RFC gets `sections: legacy`.
- **Versioning:** this file follows semantic versioning. A change that makes a conforming project fail the checker is a major version.
