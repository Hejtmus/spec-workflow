# Spec Workflow: instructions for coding agents

Paste this block into the agent instructions of a user or a project (`CLAUDE.md`, `AGENTS.md`, or
your tool's equivalent). It points at the full definition, `docs/WORKFLOW.md`.

---

## Spec Workflow

This project follows the Spec Workflow. `docs/WORKFLOW.md` is its full definition and governs every
document in `docs/`. Read it before writing any architecture document or RFC. The essentials:

1. **Pipeline:** reality → architecture documents → RFCs → code, for every change in behavior. Never reverse or skip it. A change that alters no statement and no observable behavior (a refactor, a dependency update) goes straight to code, and changes no assertion of a test carrying a statement ID; when unsure, treat it as observable.
2. **Discovery rule:** when implementation meets a reality the documents did not foresee, stop. Correct the architecture document and the RFC first. Never write an ad-hoc workaround.
3. **Architecture documents** (`docs/architecture/`) hold the current state:
   - **Design** is the author's: decisions, reasons, findings, history. Challenge assumptions, find gaps and edge cases, and propose. Do not decide on the author's behalf; ask when a decision is theirs.
   - **Specification** is the contract the code must match. It must be complete enough to rebuild the system without its code. Every statement names the test files that check it, or says `unverified`. Each of those tests carries the statement ID in its title: `it('SEC-4: …')`.
4. **RFCs** (`docs/rfcs/`) are deltas against a Specification plus a change plan: exact files, signatures, error messages, test titles with each test's assertion as given / when / then, verification commands, non-goals. An implemented RFC is frozen.
5. **Order of work:** the architecture change, then the RFC, then the tests, then the code, then the architecture document updated to current (markers removed, test files named, `verified` updated). Commit documents and code separately. The tests SHOULD be written before the code by an agent session that has not seen the implementation, marked as expected failures; the implementer removes the markers and changes no assertion.
6. **Critique:** every RFC ends with one: Pros, Cons & trade-offs, Blindspots & missed edge cases. A change to an architecture document without an RFC is presented to the author with its critique; architecture documents hold none.
7. **Before committing anything in `docs/`, run `node docs/tools/check-docs.mjs docs`.** It must report no errors. After the tests, `node docs/tools/check-results.mjs docs <JUnit XML>` must too.
8. **Code refers to the documents:** names and small functions explain the code; the reason lives in the architecture document. A comment holds only ID references (`// SEC-4, GD5`), never an explanation; the checker verifies they resolve when `docs/README.md` lists `sources`. Statements MAY use code, normative as written, or `pseudo` blocks, normative only for observable behavior.
9. **Drift and falsification audits:** before changing a component, compare its code against its Specification. Record each mismatch as a finding and ask; do not silently fix either side. For each statement an RFC adds or changes, an agent that did not write the code tries to break the statement while its tests still pass, and records any counterexample as a finding.
10. **Merges:** never squash or rebase commits into the main branch; the RFCs name their hashes.

**New project:** set it up with `node <spec-workflow>/bin/init.mjs <project>`, where `<spec-workflow>`
is where the Spec Workflow repository is checked out.
