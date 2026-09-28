#!/usr/bin/env node
/**
 * Spec Workflow documentation checker (WORKFLOW.md §9). No dependencies: Node ≥ 20.
 * `analyze` also returns the statements, for check-results.mjs.
 *
 *   node docs/tools/check-docs.mjs [docsDir]
 *
 * Prints `path:line: rule: message` for every error and warning, and exits 1 when there is an error.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, relative, dirname, resolve, basename } from 'node:path'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const SKIPPED_DIRS = new Set(['templates', 'tools'])
const CATEGORIES = 'UDFSQ'
const RFC_SECTIONS = ['Summary', 'Files', 'Specification', 'Non-goals', 'Tests', 'Steps', 'Verification', 'Critique']
const PARTS = ['Design', 'Specification']
const DESIGN_SECTIONS = {
  architecture: ['Role', 'Decisions', 'Findings', 'History', 'Verification'],
  'architecture-index': ['Overview', 'Documents', 'Decisions', 'History', 'Register']
}
const CRITIQUE_PARAGRAPHS = ['**Pros**', '**Cons & trade-offs**', '**Blindspots & missed edge cases**']
const KEYS = {
  workflow: { required: ['version'], optional: [] },
  'docs-index': { required: ['workflow'], optional: [] },
  architecture: { required: ['title', 'codes', 'verified'], optional: ['prefix', 'conforms'] },
  'architecture-index': { required: ['title', 'prefix', 'codes', 'verified'], optional: ['conforms'] },
  'rfc-index': { required: [], optional: [] },
  rfc: { required: ['number', 'title', 'status', 'commit-subject'], optional: ['commits', 'depends', 'architecture', 'sections'] }
}
const RFC_STATUSES = ['draft', 'implemented', 'withdrawn']
const STATEMENT_HEADING = /^(~~)?([A-Z]+)-(\d+) · (.+?)(~~)?$/
const STATE_VALUE = /^(new \((RFC-\d{4}|no RFC yet)\)|removed \(RFC-\d{4}\))$/
const TEST_FILES = /^`[^`]+`(, `[^`]+`)*$/
const TEST_UNVERIFIED = /^unverified( \(.+\))?$/
const TEST_PARTIAL = / \(unverified: .+\)$/

// ─── Reporting ──────────────────────────────────────────────────────────────

function createReport () {
  const entries = []
  const add = (level) => (file, line, rule, message) => { entries.push({ level, file, line, rule, message }) }
  return { entries, error: add('error'), warning: add('warning') }
}

function printReport (report, root) {
  for (const e of report.entries) console.log(`${relative(root, e.file) || e.file}:${e.line}: ${e.level}: ${e.rule}: ${e.message}`)
  const errors = report.entries.filter(e => e.level === 'error').length
  const warnings = report.entries.length - errors
  console.log(`${errors} error(s), ${warnings} warning(s)`)
  return errors
}

// ─── Reading ────────────────────────────────────────────────────────────────

function listMarkdown (dir, top = dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return dir === top && SKIPPED_DIRS.has(name) ? [] : listMarkdown(path, top)
    return name.endsWith('.md') ? [path] : []
  }).sort()
}

/** Splits `a, "b, c", d` at the commas outside quotes. */
function splitList (inner) {
  const items = ['']
  let quote = null
  for (const char of inner) {
    if (quote === null && char === ',') { items.push(''); continue }
    if (quote === null && (char === '"' || char === "'")) quote = char
    else if (char === quote) quote = null
    items[items.length - 1] += char
  }
  return items
}

function parseValue (raw) {
  const value = raw.trim()
  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim()
    return inner === '' ? [] : splitList(inner).map(item => parseValue(item))
  }
  if (value === 'true' || value === 'false') return value === 'true'
  if (/^-?\d+$/.test(value)) return Number(value)
  return value.replace(/^(['"])(.*)\1$/, '$2')
}

/** `---` front matter of `key: value` lines; `null` when absent. */
function parseFrontMatter (lines) {
  if (lines[0] !== '---') return null
  const end = lines.indexOf('---', 1)
  if (end < 0) return null
  const data = {}
  for (const line of lines.slice(1, end)) {
    const at = line.indexOf(':')
    if (at > 0) data[line.slice(0, at).trim()] = parseValue(line.slice(at + 1))
  }
  return { data, bodyStart: end + 1 }
}

/** Lines with fenced code blocks blanked, so nothing inside them counts as structure. */
function withoutFences (lines) {
  let open = null
  return lines.map(line => {
    const fence = /^\s*(`{3,}|~{3,})(.*)$/.exec(line)
    if (open === null && fence !== null) { open = fence[1]; return '' }
    if (open !== null && fence !== null && closes(open, fence)) { open = null; return '' }
    return open === null ? line : ''
  })
}

/** CommonMark: a fence closes with the same character, at least as long, and nothing after it. */
const closes = (open, [, marker, rest]) => marker[0] === open[0] && marker.length >= open.length && rest.trim() === ''

function parseHeadings (lines) {
  return lines.flatMap((line, index) => {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line)
    return match ? [{ level: match[1].length, text: match[2], line: index }] : []
  })
}

function readDocument (path) {
  const raw = readFileSync(path, 'utf-8').split('\n')
  const front = parseFrontMatter(raw)
  const lines = withoutFences(raw).map((line, i) => (front !== null && i < front.bodyStart ? '' : line))
  return { path, raw, lines, front: front?.data ?? null, headings: parseHeadings(lines) }
}

// ─── Front matter ───────────────────────────────────────────────────────────

function checkKeys (doc, report) {
  const spec = KEYS[doc.front.type]
  if (spec === undefined) return report.error(doc.path, 1, 'front-matter', `unknown type '${doc.front.type}'`)
  const allowed = new Set(['type', ...spec.required, ...spec.optional])
  for (const key of Object.keys(doc.front)) if (!allowed.has(key)) report.error(doc.path, 1, 'front-matter', `unknown key '${key}' for type ${doc.front.type}`)
  const relaxed = doc.front.conforms === false ? ['title'] : spec.required
  for (const key of relaxed) if (doc.front[key] === undefined) report.error(doc.path, 1, 'front-matter', `missing key '${key}'`)
}

function checkArchitectureKeys (doc, report) {
  const inDirectory = doc.index !== undefined
  if (inDirectory && doc.front.prefix !== undefined) report.error(doc.path, 1, 'front-matter', 'a document in a directory takes its prefix from the index; remove `prefix`')
  if (!inDirectory && doc.front.type === 'architecture' && doc.front.conforms !== false && doc.front.prefix === undefined) report.error(doc.path, 1, 'front-matter', "missing key 'prefix'")
  if (doc.front.prefix !== undefined && !/^[A-Z]+$/.test(doc.front.prefix)) report.error(doc.path, 1, 'front-matter', 'prefix must be capital letters')
  if (doc.front.codes !== undefined && (!Array.isArray(doc.front.codes) || doc.front.codes.some(c => !/^[A-Z]+$/.test(c)))) report.error(doc.path, 1, 'front-matter', 'codes must be a list of capital-letter codes')
  if (doc.front.conforms !== undefined && doc.front.conforms !== false) report.error(doc.path, 1, 'front-matter', 'conforms may only be false')
}

function checkRfcKeys (doc, report) {
  const f = doc.front
  if (!RFC_STATUSES.includes(f.status)) report.error(doc.path, 1, 'rfc', `status must be one of ${RFC_STATUSES.join(', ')}`)
  if (f.status === 'implemented' && !(Array.isArray(f.commits) && f.commits.length > 0)) report.error(doc.path, 1, 'rfc', 'an implemented RFC lists its commits')
  if (f.sections !== undefined && f.sections !== 'legacy') report.error(doc.path, 1, 'rfc', 'sections may only be legacy')
  const expected = Number(basename(doc.path).slice(0, 4))
  if (f.number !== expected) report.error(doc.path, 1, 'rfc', `number ${f.number} does not match the file name (${expected})`)
}

function checkFrontMatter (doc, report) {
  if (doc.front === null) return report.error(doc.path, 1, 'front-matter', 'missing front matter')
  checkKeys(doc, report)
  if (doc.front.type === 'architecture' || doc.front.type === 'architecture-index') checkArchitectureKeys(doc, report)
  if (doc.front.type === 'rfc') checkRfcKeys(doc, report)
}

function checkUniqueDeclarations (docs, report) {
  const seen = new Map()
  const claim = (kind, value, doc) => {
    const key = `${kind}:${value}`
    if (seen.has(key)) report.error(doc.path, 1, 'front-matter', `${kind} ${value} is also declared by ${seen.get(key)}`)
    else seen.set(key, relative(dirname(doc.path), doc.path))
  }
  for (const doc of docs) {
    if (doc.front?.prefix !== undefined) claim('prefix', doc.front.prefix, doc)
    for (const code of Array.isArray(doc.front?.codes) ? doc.front.codes : []) claim('code', code, doc)
  }
}

function checkWorkflowVersion (docs, report) {
  const workflow = docs.find(d => d.front?.type === 'workflow')
  const index = docs.find(d => d.front?.type === 'docs-index')
  if (index === undefined) return report.error(docs[0]?.path ?? '.', 1, 'layout', 'docs/README.md with type docs-index is missing')
  if (workflow === undefined) return report.error(index.path, 1, 'layout', 'docs/WORKFLOW.md is missing')
  if (String(index.front.workflow) !== String(workflow.front.version)) report.error(index.path, 1, 'front-matter', `workflow ${index.front.workflow} does not match WORKFLOW.md ${workflow.front.version}`)
}

// ─── Structure ──────────────────────────────────────────────────────────────

const childrenOf = (doc, parent, level) => {
  const end = doc.headings.find(h => h.line > parent.line && h.level <= parent.level)?.line ?? doc.lines.length
  return doc.headings.filter(h => h.line > parent.line && h.line < end && h.level === level)
}

const sectionLines = (doc, heading) => {
  const end = doc.headings.find(h => h.line > heading.line && h.level <= heading.level)?.line ?? doc.lines.length
  return { start: heading.line + 1, end, lines: doc.lines.slice(heading.line + 1, end) }
}

function checkInOrder (doc, found, required, where, report) {
  const names = found.map(h => h.text)
  let cursor = -1
  for (const name of required) {
    const at = names.indexOf(name)
    if (at < 0) report.error(doc.path, (found[0]?.line ?? 0) + 1, 'structure', `${where}: missing section '${name}'`)
    else if (at < cursor) report.error(doc.path, found[at].line + 1, 'structure', `${where}: '${name}' is out of order (expected ${required.join(', ')})`)
    else cursor = at
  }
}

function checkParts (doc, report) {
  const titles = doc.headings.filter(h => h.level === 1)
  if (titles.length !== 1) report.error(doc.path, (titles[1]?.line ?? 0) + 1, 'structure', `exactly one # title expected, found ${titles.length}`)
  const parts = doc.headings.filter(h => h.level === 2)
  const critique = parts.find(p => p.text === 'Critique')
  if (critique !== undefined) report.error(doc.path, critique.line + 1, 'structure', 'an architecture document holds no ## Critique: critiques live in RFCs (WORKFLOW §5.1)')
  else if (parts.map(p => p.text).join('|') !== PARTS.join('|')) report.error(doc.path, (parts[0]?.line ?? 0) + 1, 'structure', `## parts must be exactly ${PARTS.join(', ')}, found ${parts.map(p => p.text).join(', ') || 'none'}`)
  return Object.fromEntries(parts.map(p => [p.text, p]))
}

function checkStructure (doc, report) {
  const parts = checkParts(doc, report)
  if (parts.Design !== undefined) checkInOrder(doc, childrenOf(doc, parts.Design, 3), DESIGN_SECTIONS[doc.front.type], 'Design', report)
  return parts
}

function checkRfcSections (doc, report) {
  const found = doc.headings.filter(h => h.level === 2)
  if (found.map(h => h.text).join('|') !== RFC_SECTIONS.join('|')) report.error(doc.path, (found[0]?.line ?? 0) + 1, 'structure', `## sections must be exactly ${RFC_SECTIONS.join(', ')}`)
}

function checkRfcCritique (doc, report) {
  const critique = doc.headings.find(h => h.level === 2 && h.text === 'Critique')
  if (critique === undefined) return
  const { lines } = sectionLines(doc, critique)
  for (const paragraph of CRITIQUE_PARAGRAPHS) if (!lines.some(l => l.trim() === paragraph)) report.error(doc.path, critique.line + 1, 'critique', `the Critique lacks ${paragraph}`)
}

// ─── Statements ─────────────────────────────────────────────────────────────

function statementFields (doc, heading) {
  const { lines, start } = sectionLines(doc, heading)
  const field = (name) => {
    const at = lines.findIndex(l => l.startsWith(`- ${name}:`))
    return at < 0 ? undefined : { value: lines[at].slice(name.length + 3).trim(), line: start + at }
  }
  return { test: field('Test'), state: field('State') }
}

/** The `- Test:` value (WORKFLOW §6.1) as `{ kind, files }`, or `null` when it has none of the forms. */
function parseTest (value) {
  if (value === 'none yet') return { kind: 'none yet', files: [] }
  if (TEST_UNVERIFIED.test(value)) return { kind: 'unverified', files: [] }
  const list = value.replace(TEST_PARTIAL, '')
  if (!TEST_FILES.test(list)) return null
  return { kind: 'files', files: [...list.matchAll(/`([^`]+)`/g)].map(m => m[1]) }
}

const stateOf = (state) => state?.value.startsWith('removed') ? 'removed' : state?.value.startsWith('new') ? 'new' : 'current'

/** A statement ID as a whole token: `SEC-1` matches in `SEC-1:` but not in `SEC-12`. */
const idToken = (id) => new RegExp(`(?<![A-Za-z0-9-])${id}(?![0-9])`)

const isFile = (path) => existsSync(path) && statSync(path).isFile()

function checkTestLine (doc, heading, id, test, state, report) {
  if (test === undefined || test.value === '') return report.error(doc.path, heading.line + 1, 'statement', `${id} has no '- Test:' line`)
  const parsed = parseTest(test.value)
  if (parsed === null) report.error(doc.path, test.line + 1, 'statement', `${id}: '- Test: ${test.value}' is none of the forms in WORKFLOW §6.1`)
  if (parsed?.kind === 'none yet' && stateOf(state) !== 'new') report.error(doc.path, test.line + 1, 'statement', "'none yet' is only for a statement with State new")
  return parsed
}

/** Each named test file exists and carries the statement's ID (WORKFLOW §6.2). */
function checkTestFiles (doc, statement, testLine, root, report) {
  for (const file of statement.test.files) {
    const path = join(root, file)
    if (!isFile(path)) report.error(doc.path, testLine + 1, 'test', `${file} does not exist`)
    else if (!idToken(statement.id).test(readFileSync(path, 'utf-8'))) report.error(doc.path, testLine + 1, 'test', `${file} has no test carrying ${statement.id}`)
  }
}

function checkStatement (doc, heading, root, report) {
  const match = STATEMENT_HEADING.exec(heading.text)
  if (match === null) return report.error(doc.path, heading.line + 1, 'statement', `'${heading.text}' is not '<CODE>-<n> · <title>'`)
  const [, struckOpen, code, number] = match
  const id = `${code}-${number}`
  if (!(doc.front.codes ?? []).includes(code)) report.error(doc.path, heading.line + 1, 'statement', `code ${code} is not declared in codes`)
  const { test, state } = statementFields(doc, heading)
  if (state !== undefined && !STATE_VALUE.test(state.value)) report.error(doc.path, state.line + 1, 'statement', `invalid State '${state.value}'`)
  if ((struckOpen !== undefined) !== (stateOf(state) === 'removed')) report.error(doc.path, heading.line + 1, 'statement', 'a removed statement is struck through, and only a removed one')
  const statement = { id, doc, line: heading.line, state: stateOf(state), test: checkTestLine(doc, heading, id, test, state, report) }
  if (statement.test?.kind === 'files' && statement.state !== 'removed') checkTestFiles(doc, statement, test.line, root, report)
  return statement
}

function checkSpecification (doc, specification, root, report) {
  const statements = doc.headings.filter(h => h.level === 4 && h.line > specification.line && h.line < sectionLines(doc, specification).end)
  const { lines } = sectionLines(doc, specification)
  if (statements.length === 0 && !lines.some(l => l.trim() === 'None.')) report.error(doc.path, specification.line + 1, 'statement', "a Specification without statements says 'None.'")
  return statements.map(h => checkStatement(doc, h, root, report)).filter(s => s !== undefined)
}

// ─── IDs ────────────────────────────────────────────────────────────────────

const idPattern = (prefixes) => `(?:${[...prefixes].sort((a, b) => b.length - a.length).join('|')})[${CATEGORIES}]\\d+[a-z]?`
const baseId = (id) => id.replace(/[a-z]$/, '')

function registerRange (doc) {
  const register = doc.headings.find(h => h.level === 3 && h.text === 'Register')
  return register === undefined ? null : sectionLines(doc, register)
}

function collectDefinitions (doc, prefixes, report, definitions) {
  if (prefixes.size === 0) return
  const pattern = idPattern(prefixes)
  const row = new RegExp(`^\\|\\s*(${pattern})\\s*\\|`)
  const bold = new RegExp(`^(?:- )?\\*\\*(${pattern})[.,:\\s]`)
  const register = registerRange(doc)
  doc.lines.forEach((line, i) => {
    if (register !== null && i >= register.start && i < register.end) return
    const id = (row.exec(line) ?? bold.exec(line))?.[1]
    if (id === undefined) return
    if (definitions.has(id)) report.error(doc.path, i + 1, 'id', `${id} is already defined at ${definitions.get(id).where}`)
    else definitions.set(id, { doc, where: `${relative(dirname(doc.path), doc.path)}:${i + 1}` })
  })
}

/** Register rows are checked by checkRegister, so the mention scan skips them. */
function checkMentions (doc, pattern, known, rule, report) {
  const regex = new RegExp(`(?<![A-Za-z0-9-])(${pattern})(?![A-Za-z0-9])`, 'g')
  const register = registerRange(doc)
  doc.lines.forEach((line, i) => {
    if (register !== null && i >= register.start && i < register.end) return
    for (const [, id] of line.matchAll(regex)) if (!known(id)) report.error(doc.path, i + 1, rule, `${id} is not defined`)
  })
}

function checkRegister (index, members, definitions, report) {
  const range = registerRange(index)
  if (range === null) return
  const listed = new Map()
  const row = /^\|\s*([A-Z]+[UDFSQ]\d+)\s*\|/
  range.lines.forEach((line, i) => { const id = row.exec(line)?.[1]; if (id !== undefined) listed.set(id, range.start + i) })
  const inDirectory = new Set([...definitions].filter(([, d]) => members.includes(d.doc)).map(([id]) => baseId(id)))
  for (const id of inDirectory) if (!listed.has(id)) report.error(index.path, range.start, 'register', `${id} is defined but not in the register`)
  for (const [id, line] of listed) if (!inDirectory.has(id)) report.error(index.path, line + 1, 'register', `${id} is in the register but not defined`)
}

// ─── Links ──────────────────────────────────────────────────────────────────

/** GitHub-style heading anchor. */
function slug (text) {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-')
}

function anchorsOf (path, cache) {
  if (!cache.has(path)) {
    const counts = new Map()
    const anchors = new Set()
    for (const h of parseHeadings(withoutFences(readFileSync(path, 'utf-8').split('\n')))) {
      const base = slug(h.text.replace(/`/g, ''))
      const n = counts.get(base) ?? 0
      anchors.add(n === 0 ? base : `${base}-${n}`)
      counts.set(base, n + 1)
    }
    cache.set(path, anchors)
  }
  return cache.get(path)
}

function checkLinks (doc, cache, report) {
  const link = /\[[^\]]*\]\(([^)\s]+)\)/g
  doc.lines.forEach((line, i) => {
    for (const [, target] of line.replace(/`[^`]*`/g, '').matchAll(link)) {
      if (/^[a-z]+:/i.test(target)) continue
      const [file, anchor] = target.split('#')
      const path = file === '' ? doc.path : resolve(dirname(doc.path), decodeURI(file))
      if (!existsSync(path)) { report.error(doc.path, i + 1, 'link', `${target} does not exist`); continue }
      if (anchor !== undefined && path.endsWith('.md') && !anchorsOf(path, cache).has(anchor)) report.error(doc.path, i + 1, 'link', `${target}: no heading with anchor #${anchor}`)
    }
  })
}

// ─── Git ────────────────────────────────────────────────────────────────────

function gitSucceeds (args, cwd) {
  try {
    execFileSync('git', args, { cwd, stdio: 'ignore' })
    return true
  } catch { return false }
}

/** 'unknown', 'outside' the history of HEAD, or 'ancestor' of it. */
function commitPlace (hash, cwd) {
  if (!gitSucceeds(['cat-file', '-e', `${hash}^{commit}`], cwd)) return 'unknown'
  return gitSucceeds(['merge-base', '--is-ancestor', hash, 'HEAD'], cwd) ? 'ancestor' : 'outside'
}

function checkCommits (doc, report) {
  for (const hash of Array.isArray(doc.front.commits) ? doc.front.commits : []) {
    const place = commitPlace(String(hash), dirname(doc.path))
    if (place === 'unknown') report.error(doc.path, 1, 'rfc', `commit ${hash} is not known to git`)
    if (place === 'outside') report.error(doc.path, 1, 'rfc', `commit ${hash} is not in the history of HEAD: squashed or rebased? (WORKFLOW §8.3)`)
  }
}

function checkRfcIndex (docs, report) {
  const rfcs = docs.filter(d => d.front?.type === 'rfc')
  const index = docs.find(d => d.front?.type === 'rfc-index')
  if (rfcs.length === 0) return
  if (index === undefined) return report.error(rfcs[0].path, 1, 'rfc', 'rfcs/README.md with type rfc-index is missing')
  const text = index.lines.join('\n')
  for (const rfc of rfcs) if (!text.includes(`(${basename(rfc.path)})`)) report.error(index.path, 1, 'rfc', `${basename(rfc.path)} is not listed`)
}

// ─── Orchestration ──────────────────────────────────────────────────────────

/** Attaches each directory document to its index, so it can inherit the prefix. */
function linkIndexes (docs) {
  const indexes = docs.filter(d => d.front?.type === 'architecture-index')
  for (const doc of docs) {
    if (doc.front?.type !== 'architecture') continue
    doc.index = indexes.find(i => dirname(i.path) === dirname(doc.path))
  }
  return indexes
}

const prefixOf = (doc) => doc.front?.prefix ?? doc.index?.front?.prefix
const isArchitecture = (doc) => doc.front?.type === 'architecture' || doc.front?.type === 'architecture-index'
const conforms = (doc) => isArchitecture(doc) && doc.front.conforms !== false

/** Statements of the conforming documents, by ID: `{ id, doc, line, state, test }`. */
function checkArchitecture (docs, root, report) {
  const statements = new Map()
  for (const doc of docs.filter(conforms)) {
    const parts = checkStructure(doc, report)
    if (parts.Specification === undefined) continue
    for (const s of checkSpecification(doc, parts.Specification, root, report)) {
      if (statements.has(s.id)) report.error(doc.path, s.line + 1, 'statement', `${s.id} is already defined in ${relative(dirname(doc.path), statements.get(s.id).doc.path)}`)
      else statements.set(s.id, s)
    }
  }
  for (const doc of docs.filter(d => isArchitecture(d) && !conforms(d))) report.warning(doc.path, 1, 'conforms', 'not yet restructured (conforms: false)')
  return statements
}

function checkIds (docs, statements, report) {
  const prefixes = new Set(docs.filter(conforms).map(prefixOf).filter(p => p !== undefined))
  const definitions = new Map()
  for (const doc of docs.filter(conforms)) collectDefinitions(doc, prefixes, report, definitions)
  for (const index of docs.filter(d => d.front?.type === 'architecture-index' && conforms(d))) {
    checkRegister(index, docs.filter(d => d.index === index || d === index), definitions, report)
  }
  const codes = [...new Set([...statements.keys()].map(id => id.split('-')[0]))]
  const scanned = docs.filter(d => d.front?.type !== 'workflow')
  for (const doc of scanned) {
    if (prefixes.size > 0) checkMentions(doc, idPattern(prefixes), id => definitions.has(id) || definitions.has(baseId(id)), 'id', report)
    if (codes.length > 0) checkMentions(doc, `(?:${codes.join('|')})-\\d+`, id => statements.has(id), 'statement', report)
  }
}

function checkRfc (doc, report) {
  if (doc.front.sections !== 'legacy') { checkRfcSections(doc, report); checkRfcCritique(doc, report) }
  checkCommits(doc, report)
}

/** Statement codes declared by conforming documents, and by those not restructured yet. */
function declaredCodes (docs) {
  const codesOf = (list) => new Set(list.flatMap(d => Array.isArray(d.front.codes) ? d.front.codes : []))
  return { conforming: codesOf(docs.filter(conforms)), other: codesOf(docs.filter(d => isArchitecture(d) && !conforms(d))) }
}

/** Checks `docsDir`, whose parent is the repository root; returns the report, statements and codes. */
function analyze (docsDir) {
  const report = createReport()
  const docs = listMarkdown(docsDir).map(readDocument)
  linkIndexes(docs)
  for (const doc of docs) checkFrontMatter(doc, report)
  checkUniqueDeclarations(docs, report)
  checkWorkflowVersion(docs, report)
  const statements = checkArchitecture(docs, dirname(resolve(docsDir)), report)
  checkIds(docs, statements, report)
  for (const doc of docs.filter(d => d.front?.type === 'rfc')) checkRfc(doc, report)
  checkRfcIndex(docs, report)
  const cache = new Map()
  for (const doc of docs.filter(d => d.front?.type !== 'workflow')) checkLinks(doc, cache, report)
  return { report, statements, codes: declaredCodes(docs) }
}

const check = (docsDir) => analyze(docsDir).report

function main () {
  const docsDir = resolve(process.argv[2] ?? 'docs')
  if (!existsSync(docsDir)) { console.error(`${docsDir} does not exist`); process.exit(2) }
  const errors = printReport(check(docsDir), process.cwd())
  process.exit(errors > 0 ? 1 : 0)
}

export { analyze, check, createReport, printReport, slug, parseFrontMatter }

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
