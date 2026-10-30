#!/usr/bin/env node
// The SDK's types, generated from the API reference (openapi.yaml: packages/docs/public in Mancer's monorepo, a copy
// beside this package in the published repository): every schema of
// `components.schemas` as a type, and every operation's path, query, body and success answer under its operationId.
// Run it after the reference changes: `npm run gen:types -w @blockhash/mancer-sdk`. `--check` writes nothing and fails where the
// checked-in file differs from what the reference makes, which the SDK's tests run.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

const COPY = fileURLToPath(new URL('../openapi.yaml', import.meta.url))
const SPEC = existsSync(COPY) ? COPY : fileURLToPath(new URL('../../docs/public/openapi.yaml', import.meta.url))
const OUT = fileURLToPath(new URL('../src/generated/openapi.ts', import.meta.url))

const spec = parse(readFileSync(SPEC, 'utf8'))
const schemas = spec.components?.schemas ?? {}
const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/

const key = (k) => (IDENT.test(k) ? k : JSON.stringify(k))
const lit = (v) => (v === null ? 'null' : JSON.stringify(v))

/** One line of a description, as a doc comment, never closing the comment early. */
function doc(text, indent) {
  if (typeof text !== 'string' || !text.trim()) return ''
  const line = text.replace(/\s+/g, ' ').trim().replace(/\*\//g, '*\\/')
  return `${indent}/** ${line} */\n`
}

function refName(ref) {
  const m = /^#\/components\/schemas\/(.+)$/.exec(ref)
  if (!m) throw new Error(`a reference the generator does not follow: ${ref}`)
  return m[1]
}

/** A schema as a TypeScript type. */
function ts(s, indent = '') {
  if (s === undefined || s === null || s === true) return 'unknown'
  if (s === false) return 'never'
  if (s.$ref) return refName(s.$ref) + (s.nullable ? ' | null' : '')
  let t
  if (s.allOf) t = s.allOf.map((x) => wrap(ts(x, indent))).join(' & ')
  else if (s.oneOf || s.anyOf) t = (s.oneOf ?? s.anyOf).map((x) => wrap(ts(x, indent))).join(' | ')
  else if ('const' in s) t = lit(s.const)
  else if (Array.isArray(s.enum)) t = s.enum.map(lit).join(' | ')
  else if (Array.isArray(s.type)) {
    t = s.type.map((one) => wrap(ts({ ...s, type: one, nullable: false }, indent))).join(' | ')
  } else {
    switch (s.type) {
      case 'string': t = 'string'; break
      case 'integer':
      case 'number': t = 'number'; break
      case 'boolean': t = 'boolean'; break
      case 'null': t = 'null'; break
      case 'array': t = `${wrap(ts(s.items, indent))}[]`; break
      case 'object': t = object(s, indent); break
      default: t = s.properties || s.additionalProperties ? object(s, indent) : 'unknown'
    }
  }
  if (s.nullable && t !== 'unknown') t = `${wrap(t)} | null`
  return t
}

function wrap(t) {
  return /[|&]/.test(t) && !/^\{[\s\S]*\}$/.test(t) ? `(${t})` : t
}

function object(s, indent) {
  const props = s.properties ?? {}
  const required = new Set(s.required ?? [])
  const inner = `${indent}  `
  const lines = []
  for (const [name, p] of Object.entries(props)) {
    lines.push(`${doc(p?.description, inner)}${inner}${key(name)}${required.has(name) ? '' : '?'}: ${ts(p, inner)}`)
  }
  const extra = s.additionalProperties
  if (extra === true || (extra && typeof extra === 'object' && Object.keys(extra).length === 0)) lines.push(`${inner}[key: string]: unknown`)
  else if (extra && typeof extra === 'object') {
    const v = ts(extra, inner)
    lines.push(`${inner}[key: string]: ${Object.keys(props).length ? 'unknown' : v}`)
  }
  if (!lines.length) return 'Record<string, unknown>'
  return `{\n${lines.join('\n')}\n${indent}}`
}

function params(op, where) {
  const list = (op.parameters ?? []).map((p) => (p.$ref ? spec.components.parameters[p.$ref.split('/').pop()] : p)).filter((p) => p && p.in === where)
  if (!list.length) return 'never'
  const lines = list.map((p) => `${doc(p.description, '      ')}      ${key(p.name)}${p.required ? '' : '?'}: ${ts(p.schema, '      ')}`)
  return `{\n${lines.join('\n')}\n    }`
}

function body(op) {
  const content = op.requestBody?.content
  if (!content) return 'never'
  const json = content['application/json']
  if (json) return ts(json.schema, '    ')
  return 'Blob | Uint8Array'
}

function answer(op) {
  const types = []
  for (const [status, r] of Object.entries(op.responses ?? {})) {
    if (!/^2\d\d$/.test(status)) continue
    const res = r.$ref ? spec.components.responses[r.$ref.split('/').pop()] : r
    const json = res?.content?.['application/json']
    if (json) types.push(ts(json.schema, '    '))
    else if (res?.content) types.push('unknown')
    else types.push('null')
  }
  if (!types.length) return 'unknown'
  return [...new Set(types)].map(wrap).join(' | ')
}

let out = `// Generated from Mancer's API reference (openapi.yaml) by scripts/gen-types.mjs. Do not edit: run
// \`npm run gen:types -w @blockhash/mancer-sdk\` after the reference changes. API version ${JSON.stringify(spec.info?.version ?? '')}.
/* eslint-disable */

`
for (const [name, s] of Object.entries(schemas)) {
  out += `${doc(s.description, '')}export type ${name} = ${ts(s)}\n\n`
}

const ops = []
for (const [path, methods] of Object.entries(spec.paths ?? {})) {
  for (const [method, op] of Object.entries(methods)) {
    if (!op?.operationId) continue
    ops.push({ id: op.operationId, path, method: method.toUpperCase(), op })
  }
}
ops.sort((a, b) => a.id.localeCompare(b.id))
out += '/** Every operation of the reference by its operationId: its method, its path, and what it takes and answers. */\nexport interface Operations {\n'
for (const { id, path, method, op } of ops) {
  out += `${doc(op.summary, '  ')}  ${key(id)}: {\n`
  out += `    method: ${lit(method)}\n    path: ${lit(path)}\n`
  out += `    pathParams: ${params(op, 'path')}\n`
  out += `    query: ${params(op, 'query')}\n`
  out += `    body: ${body(op)}\n`
  out += `    response: ${answer(op)}\n  }\n`
}
out += '}\n\nexport type OperationId = keyof Operations\n\n'

/** What credential an operation takes: none, one where given, or one it needs (the reference's `security`). */
function authOf(op) {
  const sec = op.security ?? spec.security ?? []
  if (!sec.length) return 'none'
  return sec.some((s) => Object.keys(s).length === 0) ? 'optional' : 'required'
}
out += '/** Every operation\'s method, path and credential at run time: `none` (the route reads none), `optional` or `required`. */\n'
out += 'export const OPERATIONS = {\n'
for (const { id, path, method, op } of ops) {
  out += `  ${key(id)}: { method: ${lit(method)}, path: ${lit(path)}, auth: ${lit(authOf(op))} },\n`
}
out += '} as const satisfies Record<OperationId, { method: string; path: string; auth: \'none\' | \'optional\' | \'required\' }>\n'

if (process.argv.includes('--check')) {
  const now = readFileSync(OUT, 'utf8')
  if (now !== out) {
    console.error('packages/sdk/src/generated/openapi.ts differs from what openapi.yaml makes: run npm run gen:types -w @blockhash/mancer-sdk')
    process.exit(1)
  }
  console.log(`generated types up to date (${Object.keys(schemas).length} schemas, ${ops.length} operations)`)
} else {
  writeFileSync(OUT, out)
  console.log(`wrote ${OUT} (${Object.keys(schemas).length} schemas, ${ops.length} operations)`)
}
