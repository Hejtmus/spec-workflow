#!/usr/bin/env node
/**
 * Sets up the Spec Workflow in a project (WORKFLOW.md §10).
 *
 *   node bin/init.mjs <project>            create docs/; never overwrites a document
 *   node bin/init.mjs <project> --update   replace only the vendored files: WORKFLOW.md, templates/, tools/;
 *                                          then set `workflow` in docs/README.md
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HOME = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const VENDORED = [
  ['WORKFLOW.md', 'WORKFLOW.md'],
  ['tools/check-docs.mjs', 'tools/check-docs.mjs'],
  ['tools/check-results.mjs', 'tools/check-results.mjs'],
  ['tools/check-release.mjs', 'tools/check-release.mjs'],
  ['tools/record.mjs', 'tools/record.mjs'],
  ...readdirSync(join(HOME, 'templates')).map(name => [`templates/${name}`, `templates/${name}`])
]
const SCAFFOLDED = [
  ['templates/docs-README.md', 'README.md'],
  ['templates/rfcs-README.md', 'rfcs/README.md']
]
const WORKFLOW_KEY = /^workflow: (.+)$/m

function workflowVersion () {
  return /^version: (.+)$/m.exec(readFileSync(join(HOME, 'WORKFLOW.md'), 'utf-8'))[1]
}

const majorOf = (version) => String(version).split('.')[0]

function copyVendored (docs, overwrite, log) {
  for (const [from, to] of VENDORED) {
    const target = join(docs, to)
    if (existsSync(target) && !overwrite) { log(`kept     docs/${to}`); continue }
    mkdirSync(dirname(target), { recursive: true })
    copyFileSync(join(HOME, from), target)
    log(`${overwrite ? 'updated ' : 'created '} docs/${to}`)
  }
}

function scaffold (docs, project, log) {
  for (const [from, to] of SCAFFOLDED) {
    const target = join(docs, to)
    if (existsSync(target)) { log(`kept     docs/${to}`); continue }
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, readFileSync(join(HOME, from), 'utf-8').replaceAll('<Project>', project).replaceAll('<version>', workflowVersion()))
    log(`created  docs/${to}`)
  }
  mkdirSync(join(docs, 'architecture'), { recursive: true })
}

/** Sets `workflow` in docs/README.md to the vendored version; returns the previous one. */
function setWorkflowVersion (docs, log) {
  const index = join(docs, 'README.md')
  if (!existsSync(index)) { log('missing  docs/README.md: run without --update to create it'); return undefined }
  const text = readFileSync(index, 'utf-8')
  const previous = WORKFLOW_KEY.exec(text)?.[1]
  writeFileSync(index, text.replace(WORKFLOW_KEY, `workflow: ${workflowVersion()}`))
  log(`updated  docs/README.md: workflow ${previous} → ${workflowVersion()}`)
  return previous
}

function nextSteps (update, previous) {
  if (update) {
    return majorOf(previous) === majorOf(workflowVersion())
      ? ['Run the checker: node docs/tools/check-docs.mjs docs']
      : [`This is a major version (${previous} → ${workflowVersion()}): the checkers may now report errors.`, 'Follow "From … to …" in docs/WORKFLOW.md §10, then run the checker.']
  }
  return [
    'Add to package.json scripts: "docs:check": "node docs/tools/check-docs.mjs docs"',
    'Run it in CI, and before every commit that touches docs/. CI checks out the full history (fetch-depth: 0).',
    'In CI, after the build and the tests (JUnit XML), run: node docs/tools/record.mjs docs --junit <level>=<report.xml> … --build passed|failed, and keep verification.json (WORKFLOW §11.1).',
    'Release on every push to main: every package version with no release tag, only when verification.json passed (WORKFLOW §11.4).',
    'Run CI only on pushes to main and pull requests into it; require its checks before a pull request merges; pin third-party CI steps to commit hashes; give each job the least permissions.',
    'Allow only merge commits or fast-forwards into the main branch: no squash or rebase merges (WORKFLOW §8.3).',
    'List the source directories in docs/README.md, for example `sources: [src]`, so references from code are checked (WORKFLOW §6.4).',
    'Declare the test levels in docs/README.md (`levels: [unit, integration, e2e]`), and give every statement a `- Level:` line (WORKFLOW §6.2).',
    'Give existing documents front matter; mark old ones `conforms: false` or `sections: legacy`.',
    'Point the project\'s agent instructions (CLAUDE.md, AGENTS.md) at docs/WORKFLOW.md: see AGENTS.md in the Spec Workflow repository.'
  ]
}

function parseArguments (args) {
  const [projectArg, ...flags] = args
  const unknown = flags.filter(flag => flag !== '--update')
  if (projectArg === undefined || projectArg.startsWith('--') || unknown.length > 0) {
    console.error('usage: init.mjs <project> [--update]')
    process.exit(2)
  }
  return { project: resolve(projectArg), update: flags.includes('--update') }
}

function main () {
  const { project, update } = parseArguments(process.argv.slice(2))
  const docs = join(project, 'docs')
  copyVendored(docs, update, console.log)
  const previous = update ? setWorkflowVersion(docs, console.log) : undefined
  if (!update) scaffold(docs, basename(project), console.log)
  console.log('\nNext:')
  for (const step of nextSteps(update, previous)) console.log(`- ${step}`)
}

main()
