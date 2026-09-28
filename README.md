# Spec Workflow

A documentation-driven workflow for software built mostly by coding agents.

**People review specifications. Agents write code. Tests connect the two.**

Reading an agent's code change by change does not scale on a large project. This workflow moves
review to a level people can keep up with. Every component has an architecture document whose
**Specification** states exactly what the component does, statement by statement, and each statement
names the tests that check it, and each of those tests carries the statement’s ID in its title. People
review changes to the Specification. Agents implement them
through **RFCs**, precise change plans written so that even a less capable agent follows them
exactly. A **checker** keeps every document in the same shape, whichever agent wrote it.

The goal is strong: the Specifications alone should be enough to rebuild the system without its code.

## What is in here

| Path | What |
| :-- | :-- |
| [`WORKFLOW.md`](WORKFLOW.md) | the workflow: principles, roles, document formats, lifecycle, the checker's rules |
| [`AGENTS.md`](AGENTS.md) | the block to put in your agents' instructions |
| [`templates/`](templates/) | skeletons for the docs index, an architecture document, a directory index, the RFC list and an RFC |
| [`tools/check-docs.mjs`](tools/check-docs.mjs) | the documentation checker, plain Node.js ≥ 20, no dependencies, with its tests |
| [`tools/check-results.mjs`](tools/check-results.mjs) | the test results checker: reads JUnit XML and ties each statement to passing tests |
| [`bin/init.mjs`](bin/init.mjs) | sets up `docs/` in a project, or updates its vendored copy |

## Getting started

```bash
node path/to/spec-workflow/bin/init.mjs path/to/your-project
```

It creates `docs/` with a copy of `WORKFLOW.md`, the templates, the checkers, a docs index and an RFC
list. Nothing existing is overwritten. Then:

1. Add `"docs:check": "node docs/tools/check-docs.mjs docs"` to your scripts, and run it in CI with
   the full history (`fetch-depth: 0` on GitHub Actions).
2. Make the tests write JUnit XML in CI (for example `node --test --test-reporter=junit`, or Vitest's
   `junit` reporter), and run `node docs/tools/check-results.mjs docs <report.xml>` after them.
3. Allow only merge commits or fast-forwards into the main branch: no squash or rebase merges.
4. Add the block from [`AGENTS.md`](AGENTS.md) to your agents' instructions.
5. Write your first architecture document from `docs/templates/architecture.md`.

An existing project can adopt it gradually. Documents that are not restructured yet get
`conforms: false`, and old RFCs get `sections: legacy`. The checker then reports them as warnings, not
errors.

## Updating

```bash
node path/to/spec-workflow/bin/init.mjs path/to/your-project --update
```

This replaces only the vendored files and sets `workflow:` in `docs/README.md`. `WORKFLOW.md` follows
semantic versioning: a major version can make a conforming project fail a checker, and §10 of
`WORKFLOW.md` says how to migrate.

## Development

```bash
node --test tools/*.test.mjs
```

## Prior art

The workflow borrows from projects that maintain large codebases over years:
- **Rust RFCs, Python PEPs and IETF RFCs:** frozen change proposals, next to living reference documents (the Rust Reference, the Python language reference, WHATWG living standards);
- **Kubernetes KEPs:** a fixed template plus machine-checked metadata;
- **arc42 and Architecture Decision Records:** a fixed architecture outline, and decisions with context and consequences;
- **RFC 2119 / RFC 8174:** normative key words;
- **spec-driven agent tooling** such as GitHub Spec Kit and AWS Kiro.
