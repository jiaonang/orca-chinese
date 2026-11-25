#!/usr/bin/env node
// Builds locales/zh.json from a source Simplified Chinese catalog plus the curated
// overrides in overrides/. No dependencies; Node 18+.
//
//   node tools/build-pack.mjs --base zh-base.json --english en.json \
//        --protected protected-copy-keys.json --out locales/zh.json
//
// --base       A Simplified Chinese catalog (for example Orca's own src/renderer/src/i18n/locales/zh.json,
//              or the zh file from an Orca installation). The pack starts from it.
// --english    Orca's English catalog. Only needed to decide conditional term rules.
// --protected  Orca's protected-copy-keys.json. Removing protected copy is required by
//              `orca plugin validate`: a language pack may not replace security copy.
// --out        Where to write the pack. Defaults to locales/zh.json.

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (!token.startsWith('--')) continue
    args[token.slice(2)] = argv[i + 1]?.startsWith('--') ? 'true' : argv[(i += 1)]
  }
  return args
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function flatten(node, prefix = '', out = new Map()) {
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') out.set(path, value)
    else if (value && typeof value === 'object' && !Array.isArray(value)) flatten(value, path, out)
  }
  return out
}

function unflatten(entries) {
  const tree = {}
  for (const path of [...entries.keys()].sort()) {
    const parts = path.split('.')
    let node = tree
    for (const part of parts.slice(0, -1)) {
      node = node[part] ??= {}
    }
    node[parts.at(-1)] = entries.get(path)
  }
  return tree
}

const PLURAL = /_(?:zero|one|two|few|many|other)$/
const PROTECTED_ROOT = 'auto.components.settings.'
const PROTECTED_MODULE = /^plugin/i

function makeProtectedTest({ keys, prefixes }, chrome) {
  const keySet = new Set(keys)
  return (path) => {
    if (prefixes.some((prefix) => path.startsWith(prefix))) return true
    let candidate = path
    while (candidate) {
      if (keySet.has(candidate) || keySet.has(candidate.replace(PLURAL, ''))) return true
      const cut = candidate.lastIndexOf('.')
      candidate = cut === -1 ? '' : candidate.slice(0, cut)
    }
    if (!path.startsWith(PROTECTED_ROOT)) return false
    if (chrome.has(path)) return false
    return PROTECTED_MODULE.test(path.slice(PROTECTED_ROOT.length))
  }
}

function prune(node, path, isProtected, chrome, onlyChrome = false) {
  const out = {}
  for (const [key, value] of Object.entries(node)) {
    const childPath = path ? `${path}.${key}` : key
    const object = value && typeof value === 'object' && !Array.isArray(value)
    if (onlyChrome) {
      if (![...chrome].some((exempt) => exempt === childPath || exempt.startsWith(`${childPath}.`))) continue
      const kept = object ? prune(value, childPath, isProtected, chrome, true) : value
      if (object && Object.keys(kept).length === 0) continue
      out[key] = kept
      continue
    }
    if (chrome.has(childPath)) {
      out[key] = value
      continue
    }
    if (isProtected(childPath)) {
      const kept = object ? prune(value, childPath, isProtected, chrome, true) : null
      if (kept && Object.keys(kept).length > 0) out[key] = kept
      continue
    }
    if (!object) {
      out[key] = value
      continue
    }
    const kept = prune(value, childPath, isProtected, chrome)
    if (Object.keys(kept).length > 0) out[key] = kept
  }
  return out
}

const args = parseArgs(process.argv.slice(2))
if (!args.base) {
  console.error('usage: node tools/build-pack.mjs --base <zh-catalog.json> [--english <en.json>] [--protected <protected-copy-keys.json>] [--out <path>]')
  process.exit(2)
}

const entries = flatten(readJson(args.base))
const baseCount = entries.size
const english = args.english ? flatten(readJson(args.english)) : null
const fixes = readJson(join(root, 'overrides/fixes.json'))
const terminology = readJson(join(root, 'overrides/terminology.json'))
const chrome = new Set(readJson(join(root, 'overrides/translatable-chrome.json')).paths)

for (const [path, value] of Object.entries(fixes)) entries.set(path, value)
const fixedCount = entries.size - baseCount

// Chinese has no one/other split; mirror _other into a missing _one so coverage counts it.
let pluralMirrors = 0
for (const [path, value] of [...entries]) {
  if (!path.endsWith('_other')) continue
  const one = `${path.slice(0, -'_other'.length)}_one`
  if (!entries.has(one)) {
    entries.set(one, value)
    pluralMirrors += 1
  }
}

let globalHits = 0
for (const rule of terminology.globalReplacements ?? []) {
  for (const [path, value] of entries) {
    if (!value.includes(rule.from)) continue
    entries.set(path, value.split(rule.from).join(rule.to))
    globalHits += 1
  }
}

let conditionalHits = 0
if (english) {
  for (const rule of terminology.conditionalReplacements ?? []) {
    const include = new RegExp(rule.englishInclude, 'i')
    const exclude = rule.englishExclude ? new RegExp(rule.englishExclude, 'i') : null
    for (const [path, value] of entries) {
      if (!value.includes(rule.from)) continue
      const source = english.get(path) ?? english.get(`${path.replace(PLURAL, '')}_other`) ?? english.get(path.replace(PLURAL, ''))
      if (source === undefined) continue
      if (!include.test(source)) continue
      if (exclude?.test(source)) continue
      entries.set(path, value.split(rule.from).join(rule.to))
      conditionalHits += 1
    }
  }
} else {
  console.warn('no --english given: conditional term rules skipped')
}

let catalog = unflatten(entries)
let removed = 0
if (args.protected) {
  const isProtected = makeProtectedTest(readJson(args.protected), chrome)
  const before = flatten(catalog).size
  catalog = prune(catalog, '', isProtected, chrome)
  removed = before - flatten(catalog).size
} else {
  console.warn('no --protected given: protected copy left in the pack and validate will reject it')
}

const out = args.out ?? join(root, 'locales/zh.json')
writeFileSync(out, `${JSON.stringify(catalog, null, 2)}\n`)
const finalCount = flatten(catalog).size
console.log(`base strings:        ${baseCount}`)
console.log(`curated fixes:       ${fixedCount}`)
console.log(`plural mirrors:      ${pluralMirrors}`)
console.log(`global term edits:   ${globalHits}`)
console.log(`conditional edits:   ${conditionalHits}`)
console.log(`protected removed:   ${removed}`)
console.log(`final strings:       ${finalCount}`)
console.log(`written:             ${out}`)
