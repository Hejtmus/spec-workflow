#!/usr/bin/env node
/**
 * Spec Workflow release checker (WORKFLOW.md §11.3, §11.4). No dependencies: Node ≥ 20.
 *
 *   node docs/tools/check-release.mjs <docsDir> [--plan release.json]
 *
 * Finds the packages whose manifest version has no release tag, and checks that each new version is
 * high enough for the statement changes since its baseline. Prints `path:line: level: rule: message`
 * for every error and warning, and exits 1 when there is an error.
 */
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve, relative, basename, posix } from 'node:path'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { analyze, createReport, printReport, sectionLines, CHANGE } from './check-docs.mjs'

const KIND_LEVEL = { editorial: 0, compatible: 1, added: 2, breaking: 3 }
const FIRST_CHECKED_WORKFLOW = '3.0.0'
const MANIFESTS = new Set(['package.json', 'Cargo.toml', 'VERSION'])
const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/

// ─── Git ────────────────────────────────────────────────────────────────────

function git (root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 28 })
}

function gitSucceeds (root, args) {
  try { git(root, args); return true } catch { return false }
}

const trackedFiles = (root) => git(root, ['ls-files', '-z']).split('\0').filter(file => file !== '')
const listTags = (root) => git(root, ['tag', '--list']).split('\n').filter(tag => tag !== '')
const isAncestor = (root, commit, of) => gitSucceeds(root, ['merge-base', '--is-ancestor', String(commit), of])

// ─── Versions ───────────────────────────────────────────────────────────────

function parseVersion (text) {
  const match = SEMVER.exec(String(text).trim())
  if (match === null) return null
  const [, major, minor, patch, pre] = match
  return { text: String(text).trim(), core: [Number(major), Number(minor), Number(patch)], pre: pre === undefined ? [] : pre.split('.') }
}

const isPrerelease = (version) => version.pre.length > 0

/** Semantic versioning precedence of two prerelease identifiers. */
function compareIdentifiers (a, b) {
  const numeric = [/^\d+$/.test(a), /^\d+$/.test(b)]
  if (numeric[0] && numeric[1]) return Number(a) - Number(b)
  if (numeric[0] !== numeric[1]) return numeric[0] ? -1 : 1
  return a < b ? -1 : a > b ? 1 : 0
}

function comparePrereleases (a, b) {
  if (a.length === 0 || b.length === 0) return b.length - a.length
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const order = compareIdentifiers(a[i], b[i])
    if (order !== 0) return order
  }
  return a.length - b.length
}

/** Compares the first `depth` numbers of two versions. */
function compareCore (a, b, depth = 3) {
  for (let i = 0; i < depth; i++) if (a.core[i] !== b.core[i]) return a.core[i] - b.core[i]
  return 0
}

const compareVersions = (a, b) => compareCore(a, b) || comparePrereleases(a.pre, b.pre)

/** How many leading numbers must rise for a change of `kind` after `baseline` (WORKFLOW §11.3). */
function requiredDepth (baseline, kind) {
  if (baseline.core[0] === 0) return kind === 'breaking' ? 2 : 3
  return { breaking: 1, added: 2 }[kind] ?? 3
}

const isExempt = (baseline, next) => isPrerelease(next) || (baseline.core[0] === 0 && baseline.core[1] === 0)

function allows (baseline, next, kind) {
  return isExempt(baseline, next) || compareCore(next, baseline, requiredDepth(baseline, kind)) > 0
}

const largerKind = (a, b) => (a === null || KIND_LEVEL[b] > KIND_LEVEL[a] ? b : a)

// ─── Packages ───────────────────────────────────────────────────────────────

function cargoPackage (text) {
  const section = text.split(/^\[/m).find(part => part.startsWith('package]')) ?? ''
  const field = (key) => new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, 'm').exec(section)?.[1]
  return { name: field('name'), version: field('version'), private: /^publish\s*=\s*false/m.test(section) }
}

function nodePackage (text) {
  const json = JSON.parse(text)
  return { name: json.name, version: json.version, private: json.private === true }
}

/** A version manifest (WORKFLOW §11.4) as `{ name, version, private, manifest, dir }`, or `null`. */
function readManifest (root, file) {
  const text = readFileSync(join(root, file), 'utf-8')
  const dir = posix.dirname(file)
  const fields = {
    'package.json': () => nodePackage(text),
    'Cargo.toml': () => cargoPackage(text),
    VERSION: () => ({ name: dir === '.' ? basename(root) : posix.basename(dir), version: text.trim(), private: false })
  }[posix.basename(file)]()
  if (fields.name === undefined || fields.version === undefined) return null
  return { ...fields, manifest: file, dir }
}

/** The package that owns `file`: the one whose manifest is nearest above it. */
function packageOf (file, packages) {
  const owners = packages.filter(p => p.dir === '.' || file === p.dir || file.startsWith(`${p.dir}/`))
  return owners.sort((a, b) => b.dir.length - a.dir.length)[0]
}

function tagPrefix (pkg, publishable) {
  return publishable.length === 1 && pkg.dir === '.' ? 'v' : `${pkg.name}@`
}

/** The released versions of a package, from its release tags, as `{ version, tag }`. */
function releasedVersions (pkg, context) {
  const prefix = tagPrefix(pkg, context.publishable)
  return context.tags
    .filter(tag => tag.startsWith(prefix))
    .map(tag => ({ version: parseVersion(tag.slice(prefix.length)), tag }))
    .filter(released => released.version !== null)
}

const highest = (released) => released.sort((a, b) => compareVersions(b.version, a.version))[0] ?? null

// ─── RFCs ───────────────────────────────────────────────────────────────────

function sectionText (doc, name) {
  const heading = doc.headings.find(h => h.level === 2 && h.text === name)
  return heading === undefined ? [] : sectionLines(doc, heading).lines
}

const rfcFiles = (doc) => sectionText(doc, 'Files').flatMap(line => /^\|\s*`([^`]+)`/.exec(line)?.slice(1) ?? [])

function rfcSummary (doc) {
  const paragraph = sectionText(doc, 'Summary').join('\n').trim().split(/\n\s*\n/)[0] ?? ''
  return paragraph.replace(/\s+/g, ' ')
}

function rfcKinds (doc) {
  const items = Array.isArray(doc.front.changes) ? doc.front.changes : []
  return new Map(items.map(item => CHANGE.exec(String(item))).filter(Boolean).map(([, id, kind]) => [id, kind]))
}

/** An implemented RFC with what the release checks need: the statements it names, their kinds, its packages. */
function describeRfc (doc, statementIds, context) {
  const kinds = rfcKinds(doc)
  const text = doc.lines.join('\n')
  const named = new Set([...kinds.keys(), ...statementIds.filter(id => new RegExp(`(?<![A-Za-z0-9-])${id}(?![0-9])`).test(text))])
  const owners = rfcFiles(doc).map(file => packageOf(file, context.packages)).filter(Boolean)
  return { doc, number: doc.front.number, title: doc.front.title, summary: rfcSummary(doc), kinds, named, packages: owners.length > 0 ? new Set(owners) : 'all' }
}

function implementedRfcs (context) {
  const ids = [...context.head.statements.keys()]
  return context.head.docs
    .filter(d => d.front?.type === 'rfc' && d.front.status === 'implemented' && Array.isArray(d.front.commits))
    .map(d => describeRfc(d, ids, context))
}

const since = (rfcs, tag, root) => rfcs.filter(rfc => rfc.doc.front.commits.some(commit => !isAncestor(root, commit, tag)))
const affects = (rfc, pkg) => rfc.packages === 'all' || rfc.packages.has(pkg)

// ─── Statement changes ──────────────────────────────────────────────────────

/** The documentation at `tag`, analyzed in a temporary directory; `null` when it has none. */
function analyzeAt (tag, context) {
  const listed = git(context.root, ['ls-tree', '-r', '--name-only', '-z', tag, '--', context.docsPath])
  const files = listed.split('\0').filter(file => file.endsWith('.md'))
  if (files.length === 0) return null
  const dir = mkdtempSync(join(tmpdir(), 'spec-baseline-'))
  try {
    for (const file of files) {
      mkdirSync(dirname(join(dir, file)), { recursive: true })
      writeFileSync(join(dir, file), git(context.root, ['show', `${tag}:${file}`]))
    }
    return analyze(join(dir, context.docsPath))
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

function baselineAt (tag, context) {
  if (!context.baselines.has(tag)) context.baselines.set(tag, analyzeAt(tag, context))
  return context.baselines.get(tag)
}

function workflowOf (analysis) {
  const index = analysis?.docs.find(d => d.front?.type === 'docs-index')
  return index === undefined ? null : parseVersion(index.front.workflow)
}

/** Statements added, changed or removed between two analyses (WORKFLOW §11.3). */
function statementChanges (baseline, head) {
  const wasCurrent = (id) => baseline.statements.get(id)?.state === 'current'
  const comparable = (id) => !baseline.codes.other.has(id.split('-')[0])
  const changes = []
  for (const s of head.statements.values()) {
    if (!comparable(s.id)) continue
    if (s.state === 'current' && !wasCurrent(s.id)) changes.push({ statement: s, change: 'added' })
    else if (s.state === 'current' && s.text !== baseline.statements.get(s.id).text) changes.push({ statement: s, change: 'changed' })
    else if (s.state === 'removed' && wasCurrent(s.id)) changes.push({ statement: s, change: 'removed' })
  }
  for (const s of baseline.statements.values()) if (s.state === 'current' && !head.statements.has(s.id)) changes.push({ statement: s, change: 'removed' })
  return changes
}

/** The kind of a change, from the RFCs that name it; `null` when a changed or removed statement is unclassified. */
function kindOf (change, naming) {
  const declared = naming.map(rfc => rfc.kinds.get(change.statement.id)).filter(Boolean)
  if (declared.length > 0) return declared.reduce(largerKind, null)
  return change.change === 'added' ? 'added' : null
}

function reportUnclassified (change, baselineTag, context) {
  const key = `${change.statement.id}@${baselineTag}`
  if (context.unclassified.has(key)) return
  context.unclassified.add(key)
  const where = context.head.statements.has(change.statement.id) ? change.statement : { doc: { path: context.docsDir }, line: 0 }
  context.report.error(where.doc.path, where.line + 1, 'release', `${change.statement.id} is ${change.change} since ${baselineTag}, and no RFC implemented since classifies it in changes`)
}

/** The largest kind among the statement changes since `baseline` that affect `pkg`. */
function requiredKind (pkg, baseline, context) {
  const rfcs = since(context.rfcs, baseline.tag, context.root)
  let required = null
  for (const change of statementChanges(baselineAt(baseline.tag, context), context.head)) {
    const naming = rfcs.filter(rfc => rfc.named.has(change.statement.id))
    const kind = kindOf(change, naming)
    if (kind === null) reportUnclassified(change, baseline.tag, context)
    else if (naming.some(rfc => affects(rfc, pkg))) required = largerKind(required, kind)
  }
  return required
}

// ─── Planning ───────────────────────────────────────────────────────────────

/** The released version a stable release is checked against: the highest stable one. */
const stableBaseline = (released) => highest(released.filter(r => !isPrerelease(r.version)))

function isCheckable (baseline, context) {
  const workflow = workflowOf(baselineAt(baseline.tag, context))
  if (workflow !== null && compareVersions(workflow, parseVersion(FIRST_CHECKED_WORKFLOW)) >= 0) return true
  context.report.warning(context.docsDir, 1, 'release', `${baseline.tag} predates workflow ${FIRST_CHECKED_WORKFLOW}: release impact not checked`)
  return false
}

function checkImpact (pkg, version, baseline, context) {
  if (baseline === null || isExempt(baseline.version, version) || !isCheckable(baseline, context)) return null
  const required = requiredKind(pkg, baseline, context)
  if (required !== null && !allows(baseline.version, version, required)) {
    context.report.error(join(context.root, pkg.manifest), 1, 'release', `${pkg.name} ${version.text} is too low for the statement changes since ${baseline.tag}, the largest of them ${required}`)
  }
  return required
}

function releaseNotes (pkg, from, context) {
  const rfcs = from === null ? context.rfcs : since(context.rfcs, from.tag, context.root)
  return rfcs.filter(rfc => affects(rfc, pkg)).sort((a, b) => a.number - b.number).map(({ number, title, summary }) => ({ number, title, summary }))
}

/** The release of one package, or `null` when its version is already released. */
function planPackage (pkg, context) {
  const version = parseVersion(pkg.version)
  if (version === null) return context.report.error(join(context.root, pkg.manifest), 1, 'release', `version '${pkg.version}' is not semantic versioning`)
  const released = releasedVersions(pkg, context)
  if (released.some(r => compareVersions(r.version, version) === 0)) return null
  const latest = highest([...released])
  if (latest !== null && compareVersions(version, latest.version) < 0) context.report.error(join(context.root, pkg.manifest), 1, 'release', `${pkg.name} ${version.text} is lower than the released ${latest.version.text}`)
  const baseline = isPrerelease(version) ? latest : stableBaseline(released)
  const required = checkImpact(pkg, version, isPrerelease(version) ? null : baseline, context)
  return { name: pkg.name, manifest: pkg.manifest, version: version.text, baseline: baseline?.tag ?? null, required, rfcs: releaseNotes(pkg, baseline, context) }
}

function readPackages (root) {
  return trackedFiles(root).filter(file => MANIFESTS.has(posix.basename(file))).map(file => readManifest(root, file)).filter(Boolean)
}

/** The packages to release, and every publishable package with whether its version is released. */
function checkRelease (docsDir) {
  const report = createReport()
  const root = dirname(resolve(docsDir))
  if (!gitSucceeds(root, ['rev-parse', '--git-dir'])) {
    report.error(docsDir, 1, 'release', `releases are read with git, and ${root} is not a git repository`)
    return { report, plan: [], packages: [] }
  }
  const packages = readPackages(root)
  const context = { root, docsDir, docsPath: relative(root, resolve(docsDir)), head: analyze(docsDir), packages, publishable: packages.filter(p => !p.private), tags: listTags(root), baselines: new Map(), unclassified: new Set(), report }
  context.rfcs = implementedRfcs(context)
  const plan = context.publishable.map(pkg => planPackage(pkg, context)).filter(Boolean)
  const pending = new Set(plan.map(entry => entry.name))
  return { report, plan, packages: context.publishable.map(p => ({ name: p.name, version: p.version, released: !pending.has(p.name) })) }
}

function main () {
  const [docsArg, flag, planPath] = process.argv.slice(2)
  if (docsArg === undefined || (flag !== undefined && (flag !== '--plan' || planPath === undefined))) {
    console.error('usage: check-release.mjs <docsDir> [--plan release.json]')
    process.exit(2)
  }
  if (!existsSync(docsArg)) { console.error(`${docsArg} does not exist`); process.exit(2) }
  const { report, plan } = checkRelease(resolve(docsArg))
  if (planPath !== undefined) writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`)
  console.log(`${plan.length} package(s) to release${plan.map(p => `\n  ${p.name} ${p.version}${p.required ? ` (${p.required})` : ''}`).join('')}`)
  const errors = printReport(report, process.cwd())
  process.exit(errors > 0 ? 1 : 0)
}

export { checkRelease, parseVersion, compareVersions, allows }

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
