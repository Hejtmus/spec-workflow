---
type: workflow
version: 3.0.0
---

# Spec Workflow

A development workflow for projects built mostly by coding agents. **People review
specifications. Agents write code. Tests connect the two.**

This file is the canonical definition. A project keeps a verbatim copy at `docs/WORKFLOW.md`, and
that copy governs the project. The tools in `docs/tools/` enforce what can be checked mechanically
(§9).

The key words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT** and **MAY** are to be interpreted as
described in RFC 2119 and RFC 8174 when, and only when, they appear in capitals.

## 1. Principles

1. **The pipeline is one-directional.** Every change in behavior goes reality → architecture
   documents → RFCs → code. It is never reversed or skipped. A change that alters no behavior goes
   straight to code (§8.1).
2. **Reproducibility.** The Specification parts of a project's architecture documents MUST be enough
   for a competent agent or human, **with no access to the code**, to rebuild the system
   functionally. Everything observable from outside a component belongs there: contracts and the
   types that cross them, data formats and persisted layouts, protocols and the external APIs used,
   error codes and messages, security invariants, configuration surfaces and defaults, and the
   reasons behind non-obvious choices. Internal structure that does not change behavior does not.
3. **Review the specification, verify with tests.** The author does not need to read code. The
   author reviews the Specification diff and the RFC's description of what each test asserts.
   Every link between that text and the code is checked either mechanically or by an agent that did
   not write the code (§6.3).
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
| RFC | collaborative; the author reviews its test descriptions | elaborate in full technical detail under the author's guidance |
| Tests | — | written from the Specification and the RFC, SHOULD be by an agent that has not seen the implementation (§8.2) |
| Code | — | implement RFCs exactly as written |
| Falsification audits | — | an agent that did not write the code (§6.3) |

## 3. Repository layout

```
docs/
  README.md                  index: documents, ID prefixes, coverage, workflow version
  WORKFLOW.md                verbatim copy of this file
  templates/                 skeletons for every document type
  tools/check-docs.mjs       the documentation checker
  tools/check-results.mjs    the test results checker
  tools/check-release.mjs    the release checker
  tools/record.mjs           writes the verification record
  architecture/
    <subject>.md             a subject small enough for one file
    <subject>/README.md      or a directory: an index document …
    <subject>/<component>.md … and one document per component
  rfcs/
    README.md                the list of RFCs, in implementation order
    NNNN-<slug>.md           one RFC per file
```

`docs/` is at the repository root. The documentation checker runs from the repository root with
`node docs/tools/check-docs.mjs docs`, before every commit that touches `docs/`, and in CI. The
results checker runs in CI after the tests (§9).

## 4. Front matter

Every document starts with front matter: `---` lines around `key: value` pairs. Lists are written
`[a, b]`; an item containing a comma is quoted, `["a, b", c]`. Unknown keys are errors.

| `type` | Keys |
| :-- | :-- |
| `docs-index` | `workflow`: the version of this file that the project follows; `levels`: the test levels of the project, such as `[unit, integration, e2e]` (§6.2); `sources`: the directories, from the repository root, whose files are checked for references (§6.4) |
| `architecture` | `title`; `prefix`: the ID prefix, unique in the project; `codes`: statement codes, unique in the project; `verified`: the commit at which the *current* text was last checked against the code; `conforms`: `false` only for a document written before the project adopted the workflow |
| `architecture-index` | the same keys as `architecture`. The directory's documents share its `prefix` and its register. |
| `rfc-index` | none: the list of RFCs, `rfcs/README.md` |
| `rfc` | `number`; `title`; `status`: `draft`, `implemented` or `withdrawn`; `commits`: the implementing commits, required when `implemented`; `depends`: RFC numbers; `architecture`: the documents it changes; `commit-subject`: the commit message subject; `sections`: `legacy` only for an RFC written before the project adopted the workflow; `changes`: the kind of each statement change it makes, `[SEC-4 breaking, SEC-2 editorial]` (§11.3) |

A document in a directory (`architecture/<subject>/<component>.md`) takes `prefix` from its index
and declares only `title`, `codes` and `verified`.

## 5. Architecture documents

### 5.1 Structure

A conforming architecture document has exactly one `#` title and two `##` parts, in this order:
`## Design` and `## Specification`.

**Design** has `###` sections. The required ones appear in this order, and other sections MAY stand
between them:

| Document type | Required Design sections |
| :-- | :-- |
| `architecture` | `Role`, `Decisions`, `Findings`, `History`, `Verification` |
| `architecture-index` | `Overview`, `Documents`, `Decisions`, `History`, `Register` |

A required section with nothing to say contains `None.`

**Specification** has `###` groups of `####` statements (§6). An index document without shared
statements contains `None.`

An architecture document holds no critique. A design decision states its trade-off in its
*Why:* and *Cost:* lines (§5.3). The critique of a change lives in its RFC (§8.1). A change to an
architecture document without an RFC, such as a new decision, finding or open question, is presented
to the author with its critique (**Pros**, **Cons & trade-offs**, **Blindspots & missed edge
cases**) in the review, not in the document.

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
- **Verifications** (`S`) start with `**GS1, …**`, as a paragraph or a list item, or are rows of a table: `| GS1a | … |`. A falsification audit (§6.3) is recorded as one.
- **Open questions** (`Q`) are rows of an `Open questions` table: `| GQ1 | question | recommendation |`.

## 6. Specification statements and their tests

### 6.1 Statements

```
#### SEC-4 · Absence is only NOT_FOUND

`getSecret` returns `undefined` when, and only when, the call fails with gRPC `NOT_FOUND` (5).
Every other failure propagates unchanged.

- Test: `packages/secrets/src/runtime.test.ts`, `e2e/secrets.e2e.ts`
- Level: unit, e2e
```

- The heading is `#### <CODE>-<n> · <short title>`. `CODE` is one of the document's `codes`.
- **The text is normative.** Plain present tense means MUST. Capitalized **SHOULD** and **MAY** mark weaker requirements.
- **`- Test:`** is required, in one of these forms (§6.2):
  - `` - Test: `path/a.test.ts`, `path/b.test.ts` ``: the files whose tests check the statement;
  - `` - Test: `path/a.test.ts` (unverified: the retry delay) ``: partly checked, naming the part that is not;
  - `- Test: unverified`, optionally followed by ` (reason)`;
  - `- Test: none yet`, only for a **New** statement.
- **`- Level:`** is required, except for a removed statement. It lists the test levels at which the statement MUST be verified, from the project's `levels`, separated by commas (§6.2). The author decides them when reviewing the statement.
- **`- State:`** is present only for a statement that is not current: `new (RFC-NNNN)`, `new (no RFC yet)`, or `removed (RFC-NNNN)`. A removed statement keeps its block, with its title struck through: `#### ~~SEC-9 · …~~`.
- **Numbers are never reused.** Gaps are allowed.
- **The boundary test:** *would a different but correct implementation have to match this?* If yes, it is a statement. If not, like a file path or an internal helper name, it belongs only in an RFC.
- **Code and pseudo-code** MAY express a statement, or a Design entry, more precisely than prose, in a fenced block. A block in the language of the code, such as a signature, a type, a data format or an example call, is normative as written. A block tagged `pseudo` is normative only for the behavior it makes observable. Its structure, names and steps are not normative, so a different implementation with the same observable behavior conforms.

  ````
  #### SEC-5 · Reads retry only transient failures

  ```pseudo
  for attempt in 1..3:
    result = call()
    if result is not UNAVAILABLE: return result
    wait 100 ms × 2^(attempt − 1)
  return result
  ```

  - Test: `packages/secrets/src/runtime.test.ts`
  - Level: unit
  ````

### 6.2 Tests

- A test that checks a statement carries the statement's ID in its own title, for example `it('SEC-4: reads a missing secret as undefined', …)`. A test that checks several statements carries each ID.
- `- Test:` names the files that hold those tests, by path from the repository root. The documentation checker confirms that each file exists and contains the ID. A new statement keeps `none yet` until its RFC is implemented, even when its tests are written first.
- **A statement is tested at the boundary it describes.** A mock of what the statement is about proves nothing about it. The level follows from the statement:
  - a statement about the contract of a function or module: a **unit** test through its public interface;
  - a statement about components working together, or about storage, a network or a file system: an **integration** test with the real collaborators;
  - a statement about the system as its users meet it, such as a CLI, an HTTP API, a deployment or a UI flow: an **end-to-end** test against a running system;
  - a statement about an external service: a **contract** test against the real service, or `unverified`.

  Listing several levels verifies a statement from several sides. A unit test covers its edge cases cheaply, and an end-to-end test shows that it holds in the running system.
- `docs/README.md` declares the project's `levels`, lowercase names such as `[unit, integration, e2e, contract]`. A project MAY add its own, such as `conformance`.
- Each test run writes a JUnit XML report labeled with its level: `unit=reports/unit.xml`. The results checker confirms that every current statement that names test files has, for each of its levels, a passing test carrying its ID in a report of that level, and no failing test anywhere. It also confirms that every statement ID in a test title is defined and not removed.
- A run MAY **defer** a level that it cannot run, such as a contract test that needs credentials a pull request does not have. A missing test of a deferred level is a warning, and the verification record of that run is not releasable (§11.2).

### 6.3 Trust

The author reads the Specification and the RFC. Every link from that text to running code is checked
by something other than the agent that wrote the code:

| Link | Checked by |
| :-- | :-- |
| The statement says what the author wants | the author, reviewing the Specification diff |
| The test asserts what the statement says | the author, reviewing the RFC's description of each test (§8.1); a falsification audit |
| The test was not shaped to fit the code | tests written before the code, by an agent that has not seen it (§8.2) |
| The test exercises the statement at the boundary it describes | the author, declaring its `Level`; `check-results.mjs`, per level |
| The test exists and carries the statement's ID | `check-docs.mjs` |
| The test passes | `check-results.mjs` |

**Falsification audit.** An agent that did not write the code is given a statement, its tests and
the code. It tries to change the code so that the code violates the statement while every test still
passes. A counterexample it finds is a Finding, stated in terms of behavior, and the tests are
strengthened through an RFC. The audit also reports a statement too vague to falsify. Each audit is
recorded as a Verification entry with its commit and the statements it covered. An audit SHOULD run
for every statement an RFC adds or changes, and during drift audits.

The remaining trust is in the auditor. It is reduced by running the audit in a separate session,
preferably on a different model. The author's occasional reading of code is a sample that shows how
far the auditor can be trusted. It is not a step of the workflow.

### 6.4 References from code

The code explains itself through names and small functions. The reason behind it lives in the
architecture document, which must hold it anyway (principle 2), not in a comment.

- A comment SHOULD consist only of references to IDs, for example `// SEC-4, GD5`. A reader
  follows them to the statement or the decision.
- A comment that explains is a missing name or a missing document entry. The fix is a better name, a
  smaller function, or a Design entry, which the comment then references.
- Comments that tools read, such as a license header, a type annotation or a linter directive, are
  not explanations.
- A doc comment on an exported API is exempt. Editors and generated references show it to the
  API's users, who do not read the architecture documents. It MAY explain, and MAY reference IDs.
- Every reference resolves. When `docs/README.md` lists `sources`, the documentation checker reads
  every file that git tracks under them, outside `docs/`, and skips binary files. Each token with a
  declared prefix or statement code, whether in a comment, a string or a test title, MUST be
  defined. A statement it names MUST NOT be removed. The check needs a git repository.

### 6.5 Testing techniques

Some statements hide their defects from tests written by example. For them, the tests SHOULD use:

| A statement that … | is tested by … | because … |
| :-- | :-- | :-- |
| holds for every input of a kind ("any name", "every request") | a **property-based** test, with generated inputs | edge cases come from the generator, not from what someone thought of |
| handles untrusted input, or is a security invariant | **fuzzing** | parsers and validators break on inputs nobody writes by hand |
| handles failures ("every other failure propagates") | **fault injection**: the dependency is made to fail | the failure path is where untested code hides |
| holds for several implementations of one contract | a **conformance suite**: one set of tests run against each implementation | a new implementation cannot drop part of the contract unnoticed |
| describes an external service | a **contract test** against the real service, also run on a schedule | a mock records the assumption, not the service, and services change |

**Regression per finding.** A Finding that records a defect, once fixed, leaves a test carrying the ID
of the statement the defect violated. A defect that no statement covers first gets its statement,
through an RFC.

## 7. IDs

- Each architecture document or directory has a `prefix` of capital letters. IDs are the prefix, a category letter (`U`, `D`, `F`, `S`, `Q`) and a number, for example `GD4`. A lowercase letter MAY follow for sub-items, as in `GS1a`.
- An ID is defined exactly once. Its number is never reused, and it keeps its number when its text moves between files.
- A directory's index keeps a `### Register` table, `| ID | summary | state | document |`, listing every ID defined in the directory, without sub-items.
- Every mention of a prefixed ID, or of a statement such as `SEC-4`, anywhere in `docs/`, resolves to a definition.

## 8. RFCs

### 8.1 When an RFC is needed, and its content

A change that alters no Specification statement and no observable behavior skips the architecture
document and the RFC. Examples are a refactor, a dependency update, a build or tooling change, or a
performance change that no statement constrains. Such a change:
- is committed on its own and passes the checker, the build and the tests;
- MUST NOT change what a test carrying a statement ID asserts;
- becomes an ordinary change, through the whole pipeline, as soon as it turns out to need a
  different behavior (discovery rule).

An agent that cannot tell whether a change is observable treats it as observable.

Any other change needs an RFC. An RFC is a **delta against a Specification**, from state X to state
Y, plus a **change plan**: files, steps, baselines and verification. It is written to be followed by
an agent less capable than its author: exact paths, signatures, data types, error codes, test titles
and commands.

Its `##` sections, in order: `Summary`, `Files`, `Specification`, `Non-goals`, `Tests`, `Steps`,
`Verification`, `Critique`.

- **Specification** gives the exact new text of each statement the RFC adds, changes or removes.
  The `changes` key classifies each change and removal (§11.3).
- **Tests** gives each test by file, level and exact title, the title carrying the statement IDs it checks.
  It gives the test's assertion as *given / when / then*, in terms of behavior. The author reviews
  these descriptions instead of the test code.
- **Critique** has the three paragraphs `**Pros**`, `**Cons & trade-offs**` and
  `**Blindspots & missed edge cases**`, as lists.

### 8.2 Lifecycle

1. **Draft.** The architecture document marks the target statements **New** with `State: new (RFC-NNNN)`, and the RFC specifies the change.
2. **Tests.** An agent session that has not seen the implementation SHOULD write the RFC's tests from the Specification and the RFC, before the code. They are marked as expected failures (for example `it.fails`), so the test suite still passes.
3. **Implementation.** The agent follows the RFC. It removes the expected-failure markers and does not change what a test asserts. A contradiction with reality, including a test that turns out to be wrong, is corrected in the RFC, and in the architecture document if needed, **before** the code is committed (discovery rule).
4. **Implemented.** `status: implemented` with `commits`. The architecture document drops the markers, names the test files, and updates `verified`. From now on the RFC is **frozen**: its content is never edited again.
5. A later change is a new RFC that references the old one.

### 8.3 Commits

Documents and code are committed separately, in this order: the architecture change, the RFC, the
tests when they are written first, the code, and then the architecture document's update to current.
Each commit passes the checker, the build and the tests.

Commits reach the main branch unchanged, by a merge commit or a fast-forward. Squash merges and
rebase merges are forbidden, because they replace the hashes that `commits` and `verified` name. CI
checks out the full history.

## 9. The checkers

`check-docs.mjs` checks, and exits non-zero on any error:

1. front matter: types, required keys, enums, unique prefixes and codes, the workflow version against `docs/WORKFLOW.md`;
2. structure: the `#` title, the `##` parts and required `###` sections in order;
3. statements: heading format, a code the document declares, no duplicates, the form of the `Test:` line, a `Level:` line naming declared levels, each named test file existing and containing the ID, valid `State:` values, `none yet` only for **New** statements;
4. IDs: defined once, every mention defined, registers complete and not stale;
5. RFCs: file name against `number`, required sections and critique paragraphs unless `sections: legacy`, each item of `changes` naming a defined statement and a kind, `commits` present and in the history of `HEAD` when `implemented`, every RFC listed in `rfcs/README.md`;
6. links: every relative link resolves to a file, and every `#anchor` to a heading;
7. references from code: when `sources` is set, every ID and statement named in a tracked source file is defined, and no named statement is removed (§6.4).

A document with `conforms: false` is checked only for front matter and links, and is reported as a
warning until it is restructured.

`check-results.mjs` runs as `node docs/tools/check-results.mjs docs <level>=<report.xml> … [--defer <level>]`
after the tests, with the JUnit XML reports they produced. It checks, and exits non-zero on any error:

1. every current statement that names test files has, for each of its levels, a passing test whose title carries its ID in a report of that level, and no failing one;
2. every statement ID in a test title is defined and not removed;
3. every report is labeled with a declared level.

It warns about a test that carries the ID of an `unverified` statement. It ignores the statements of a
document with `conforms: false`.

`check-release.mjs` runs as `node docs/tools/check-release.mjs docs [--plan release.json]`. It finds
the packages to release (§11.4) and checks, for each, that its new version is high enough for the
statement changes since its baseline (§11.3). With `--plan`, it writes those packages as JSON: name,
manifest, version, baseline, required kind, and the RFCs for the release notes.

`record.mjs` runs as `node docs/tools/record.mjs docs --junit <level>=<report.xml> … [--defer <level>]
--build passed|failed [--out verification.json]`. It runs the other three checkers itself, reads the test counts from the
JUnit XML, writes the verification record (§11.2), and exits non-zero unless every check passed.


## 10. Adoption and updates

- **New or existing project:** `node <spec-workflow>/bin/init.mjs <project>` creates `docs/` with this file, the templates, the checkers, `docs/README.md` and `docs/rfcs/README.md`. It never overwrites a document.
- **Update:** `node <spec-workflow>/bin/init.mjs <project> --update` replaces only the vendored files (`WORKFLOW.md`, `templates/`, `tools/`) and sets `workflow` in `docs/README.md`.
- **Existing documents:** give each a front matter. A document not yet restructured gets `conforms: false`, and an old RFC gets `sections: legacy`.
- **From 1.x to 2.0:** remove the `## Critique` part of each architecture document, keeping any trade-off still relevant in its decision's *Cost:* line. Rewrite each `- Test:` line in the forms of §6.1, and add the statement IDs to the titles of the tests it names.
- **From 2.x to 3.0:** declare the project's `levels` in `docs/README.md`, give every statement that is not removed a `- Level:` line, and label each JUnit report with its level. Release impact is checked from the first release whose baseline follows 3.0.0 (§11.5).
- **Versioning:** this file follows semantic versioning. A change that makes a conforming project fail a checker is a major version.

## 11. Integration and release

### 11.1 Integration

CI runs on every push to the main branch and on every pull request into it. A push to any other
branch runs nothing. CI runs, in order: the documentation checker, the build, the tests (writing
a JUnit XML report per level), and `record.mjs`, which runs the results and release checkers and writes the
verification record. CI keeps the record as an artifact of the run. A push to the main branch runs
every level. A pull request MAY defer the levels it cannot run (§6.2).

- CI checks out the full history.
- A pull request merges only when its checks passed on the exact result of the merge (required
  status checks, or a merge queue).
- A commit pushed straight to the main branch is checked after it lands. Its verification record
  still gates the release (§11.4), so a failed check stops the release, not the push.
- CI pins every third-party step to an immutable version, such as a commit hash, not a movable tag.
- Each CI job has only the permissions it needs.

### 11.2 The verification record

`verification.json` states what was verified at one commit:

```json
{
  "schema": 1,
  "workflow": "3.0.0",
  "commit": "<full commit hash>",
  "created": "2026-09-28T17:30:00.000Z",
  "checks": { "spec_check": "passed", "build": "passed", "tests": "passed", "test_traceability": "passed", "release_impact": "passed" },
  "statements": { "total": 41, "verified": 37, "unverified": ["DEP-3", "SEC-7"], "new": ["STO-9"] },
  "tests": {
    "total": 124, "passed": 124, "failed": 0, "skipped": 0, "carrying_ids": 98,
    "levels": { "unit": { "total": 101, "passed": 101, "failed": 0, "skipped": 0 }, "e2e": { "total": 23, "passed": 23, "failed": 0, "skipped": 0 } }
  },
  "deferred": [],
  "releasable": true,
  "packages": [{ "name": "@genoacms/core", "version": "0.7.0", "released": false }]
}
```

- A check is `passed` or `failed`. `tests` fails when a test failed, or when the reports hold no test.
- `statements.total` counts the current statements of conforming documents. `verified` counts those
  with a passing test carrying their ID and no failing one. `unverified` lists the rest. `new` lists
  the statements not yet implemented.
- `carrying_ids` counts the tests whose title carries at least one statement ID. `levels` counts the
  tests of each level.
- `deferred` lists the levels the run deferred. `releasable` is true when every check passed and no
  level was deferred.
- `packages` lists every publishable package (§11.4). `released` says whether its version has a tag.

### 11.3 Release impact

Every statement change has a kind, which sets the smallest version increase that may carry it:

| Kind | Meaning | At 1.0.0 or later | At 0.y.z, y ≥ 1 |
| :-- | :-- | :-- | :-- |
| `breaking` | a user relying on the old statement can fail | major | minor |
| `added` | a new current statement | minor | patch |
| `compatible` | changed or removed, and every user of the old statement still works | patch | patch |
| `editorial` | the wording changed, the meaning did not | patch | patch |

Two kinds of version are exempt, and need only be higher than the previous one:
- a prerelease version, such as `1.0.0-alpha.21`;
- a version whose baseline is `0.0.z`.

`^0.0.z` accepts no other version, and prereleases promise no stability.

- A statement is **added** when it is current now and was not current at the baseline. It is
  **changed** when its text, without its `Test:`, `State:` and `Level:` lines, differs from the baseline. It
  is **removed** when it is struck through or gone now, and was current at the baseline.
- The RFCs **since the baseline** are the implemented RFCs with a commit outside the history of the
  baseline tag. An RFC **names** a statement when its `changes` or its text mention the statement.
- A changed or removed statement MUST be classified in the `changes` of an RFC since the baseline.
  An added statement has the kind `added` unless one classifies it otherwise. An added statement
  that no RFC since the baseline names documents existing behavior, and has no impact.
- A change affects the packages of the RFCs since the baseline that name it. An RFC affects the
  packages that own the files in its `Files` table, and a file belongs to the package of the
  nearest version manifest above it (§11.4). An RFC whose files belong to no package affects every
  package.
- The **baseline** of a stable version is the highest stable version of the same package that has a
  release tag. A package without one has no baseline, and its first stable release is not checked.
- The required increase for a package is the largest kind among the changes that affect it.

### 11.4 Release

- A **version manifest** declares a package's name and version: `package.json`, `Cargo.toml`
  (`[package]`), or a `VERSION` file holding only the version, named after its directory. A package
  marked private (`"private": true`, `publish = false`) is not released.
- A package version is **released** when its release tag exists: `<name>@<version>`, or
  `v<version>` for a repository whose only package is at its root.
- A release runs on every push to the main branch. It releases every package whose manifest
  version has no release tag, and only when the verification record of that commit is `releasable`. It then creates the release tags. A push that changes no version releases nothing.
- A release tag is never moved or deleted. A bad release is followed by a new version.
- The verification record is attached to the release. The published packages and the record SHOULD
  carry signed build provenance, such as npm provenance or an artifact attestation.
- The release notes of a package are the titles and summaries of the RFCs implemented since its
  baseline that affect it.

### 11.5 Adoption

Before the first release under the workflow, every version already published gets its release tag,
on the commit it was published from, or on the adopting commit when that commit is unknown. Only new
versions are then released. `check-release.mjs` lists the untagged versions.

Release impact is checked only against a baseline whose `docs/README.md` declares workflow 3.0.0 or
later. An earlier baseline is reported as a warning: its RFCs carry no `changes`.
