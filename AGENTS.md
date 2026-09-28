# Spec Workflow: instructions for coding agents

Paste this block into the agent instructions of a user or a project (`CLAUDE.md`, `AGENTS.md`, or
your tool's equivalent). It points at the full definition, `docs/WORKFLOW.md`.

---

## Spec Workflow

This project follows the Spec Workflow. `docs/WORKFLOW.md` is its full definition and governs every
document in `docs/`. Read it before writing any architecture document or RFC. The essentials:

1. **Pipeline:** reality → architecture documents → RFCs → code. Never reverse or skip it.
2. **Discovery rule:** when implementation meets a reality the documents did not foresee, stop. Correct the architecture document and the RFC first. Never write an ad-hoc workaround.
3. **Architecture documents** (`docs/architecture/`) hold the current state:
   - **Design** is the author's: decisions, reasons, findings, history. Challenge assumptions, find gaps and edge cases, and propose. Do not decide on the author's behalf; ask when a decision is theirs.
   - **Specification** is the contract the code must match. It must be complete enough to rebuild the system without its code. Every statement names the test that checks it, or says `unverified`.
4. **RFCs** (`docs/rfcs/`) are deltas against a Specification plus a change plan: exact files, signatures, error messages, test titles, verification commands, non-goals. An implemented RFC is frozen.
5. **Order of work:** the architecture change, then the RFC, then the code, then the architecture document updated to current (markers removed, tests cited, `verified` updated). Commit documents and code separately.
6. **Every change to an architecture document or RFC ends with a critique:** Pros, Cons & trade-offs, Blindspots & missed edge cases.
7. **Before committing anything in `docs/`, run `node docs/tools/check-docs.mjs docs`.** It must report no errors.
8. **Drift audit:** before changing a component, compare its code against its Specification. Record each mismatch as a finding and ask; do not silently fix either side.

**New project:** set it up with `node <spec-workflow>/bin/init.mjs <project>`, where `<spec-workflow>`
is where the Spec Workflow repository is checked out.
