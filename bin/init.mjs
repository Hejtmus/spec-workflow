#!/usr/bin/env node
/**
 * Sets up the Spec Workflow in a project (WORKFLOW.md §10).
 *
 *   node bin/init.mjs <project>            create docs/; never overwrites a document
 *   node bin/init.mjs <project> --update   replace only the vendored files: WORKFLOW.md, templates/, tools/
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HOME = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const VENDORED = [
  ['WORKFLOW.md', 'WORKFLOW.md'],
  ['tools/check-docs.mjs', 'tools/check-docs.mjs'],
  ...readdirSync(join(HOME, 'templates')).map(name => [`templates/${name}`, `templates/${name}`])
]
const SCAFFOLDED = [
  ['templates/docs-README.md', 'README.md'],
  ['templates/rfcs-README.md', 'rfcs/README.md']
]

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
    writeFileSync(target, readFileSync(join(HOME, from), 'utf-8').replaceAll('<Project>', project))
    log(`created  docs/${to}`)
  }
  mkdirSync(join(docs, 'architecture'), { recursive: true })
}

function workflowVersion () {
  return /^version: (.+)$/m.exec(readFileSync(join(HOME, 'WORKFLOW.md'), 'utf-8'))[1]
}

function nextSteps (update) {
  return update
    ? [`Set \`workflow: ${workflowVersion()}\` in docs/README.md, then run the checker.`]
    : [
        'Add to package.json scripts: "docs:check": "node docs/tools/check-docs.mjs docs"',
        'Run it in CI, and before every commit that touches docs/.',
        'Give existing documents front matter; mark old ones `conforms: false` or `sections: legacy`.',
        'Point the project\'s agent instructions (CLAUDE.md, AGENTS.md) at docs/WORKFLOW.md: see AGENTS.md in the Spec Workflow repository.'
      ]
}

function main () {
  const [projectArg, flag] = process.argv.slice(2)
  if (projectArg === undefined) { console.error('usage: init.mjs <project> [--update]'); process.exit(2) }
  const project = resolve(projectArg)
  const docs = join(project, 'docs')
  const update = flag === '--update'
  copyVendored(docs, update, console.log)
  if (!update) scaffold(docs, basename(project), console.log)
  console.log('\nNext:')
  for (const step of nextSteps(update)) console.log(`- ${step}`)
}

main()
