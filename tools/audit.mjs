#!/usr/bin/env node
// Offline sanity checks for the language pack. `orca plugin validate .` remains the
// authority; this catches the mistakes a translator makes before validating.
//
//   node tools/audit.mjs [--english en.json]

import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = {}
for (let i = 2; i < process.argv.length; i += 1) {
  if (process.argv[i].startsWith('--')) args[process.argv[i].slice(2)] = process.argv[i + 1]
}

function flatten(node, prefix = '', out = new Map()) {
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') out.set(path, value)
    else if (value && typeof value === 'object' && !Array.isArray(value)) flatten(value, path, out)
  }
  return out
}

const PLACEHOLDER = /\{\{[^}]+\}\}|\{[A-Za-z][A-Za-z0-9_]*\}|<\/?[a-z][a-z0-9]*>/g
const placeholders = (value) => [...value.matchAll(PLACEHOLDER)].map((match) => match[0]).sort()
const count = (list) => list.reduce((acc, item) => ((acc[item] = (acc[item] ?? 0) + 1), acc), {})

const catalog = flatten(JSON.parse(readFileSync(join(root, 'locales/zh.json'), 'utf8')))
const problems = []

for (const [path, value] of catalog) {
  if (value.length > 8192) problems.push(`${path}: longer than 8192 characters`)
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if ((code <= 0x1f && code !== 0x0a) || (code >= 0x7f && code <= 0x9f) || code === 0x2028 || code === 0x2029 || code === 0xfeff) {
      problems.push(`${path}: control or separator character U+${code.toString(16).toUpperCase()}`)
      break
    }
  }
}

if (args.english) {
  const english = flatten(JSON.parse(readFileSync(args.english, 'utf8')))
  for (const [path, value] of catalog) {
    // Chinese has no one/other split: _one mirrors _other and never renders.
    if (path.endsWith('_one')) continue
    const source = english.get(path)
    if (source === undefined) continue
    const expected = count(placeholders(source))
    const actual = count(placeholders(value))
    for (const [token, times] of Object.entries(expected)) {
      if ((actual[token] ?? 0) < times) problems.push(`${path}: missing placeholder ${token}`)
    }
    for (const [token, times] of Object.entries(actual)) {
      if ((expected[token] ?? 0) < times) problems.push(`${path}: placeholder ${token} not in the English text`)
    }
    if (value.includes('\n') && !source.includes('\n')) problems.push(`${path}: added a line break`)
    if (value.length > Math.max(64, source.length * 4)) problems.push(`${path}: longer than 4x the English text`)
  }
}

// Prose left in English. Code, CSS and regexes are intentionally untranslated.
const prose = /^[\p{L}\p{N} .,'’!?…:;"“”()\-—/&%+*]+$/u
const untranslated = [...catalog].filter(
  ([path, value]) => /\b(the|and|with|your|from|this)\b/.test(value) && !/[\u4e00-\u9fff]/.test(value) && prose.test(value)
)
const glossary = { 智能体: 0, 代理: 0, 标签页: 0, 选项卡: 0, 您: 0, 工作树: 0, 工作区: 0 }
for (const [, value] of catalog) {
  for (const term of Object.keys(glossary)) if (value.includes(term)) glossary[term] += 1
}

console.log(`entries: ${catalog.size}`)
console.log('terms:  ', Object.entries(glossary).map(([term, times]) => `${term}=${times}`).join(' '))
if (untranslated.length > 0) {
  console.log(`\nEnglish-looking strings (${untranslated.length}):`)
  for (const [path, value] of untranslated.slice(0, 20)) console.log(`  ${path}: ${value}`)
}
if (problems.length > 0) {
  console.log(`\n${problems.length} problem(s):`)
  for (const problem of problems.slice(0, 50)) console.log(`  ${problem}`)
  process.exit(1)
}
console.log('\nno placeholder, length or character problems')
