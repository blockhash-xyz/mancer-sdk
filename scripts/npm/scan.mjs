#!/usr/bin/env node
// Reads published text for what belongs to Mancer's own operations and not to the public: a home folder's path, an IP
// address, a host under mancer.xyz that is not a public one, an app host on a hosting provider, a package scope of the
// monorepo, an environment variable of Mancer's own servers, or a reference to an internal note. Contract addresses,
// ABIs, chain ids and the public hosts (api, docs, mcp, stream and www under mancer.xyz) are public facts and pass.
//
//   node scripts/npm/scan.mjs [--patterns <module.mjs>] <file or folder>...
//
// A folder is read whole but for node_modules, .git and dist trees of a package's own build cache. A pattern module adds
// patterns of its own (its default export, an array shaped as PATTERNS). Prints every hit and exits 1 where there is one.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const PUBLIC_HOSTS = new Set(['api', 'docs', 'mcp', 'stream', 'www'])
const LOCAL_IPS = new Set(['127.0.0.1', '0.0.0.0'])

/** Environment names the published code and its tests read, which are the packages' own and no server's. */
const OWN_ENV = [/^MANCER_(?:SDK)_[A-Z0-9_]+$/, /^MANCER_(API_KEY|RPC_URL|API_URL|STREAM_URL|SIGN_IN_DOMAIN)$/]

/** @type {{ name: string, re: RegExp, why: string, allow?: (match: string, ctx: { declared: Set<string> }) => boolean }[]} */
export const PATTERNS = [
  // `/Users/you/` is the docs' placeholder for the reader's own folder
  { name: 'home-path', re: /\/(?:Users|home)\/(?!you\/)[A-Za-z]/g, why: "a path in someone's home folder" },
  {
    name: 'ip-address',
    re: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    why: 'an IP address',
    allow: (m) => LOCAL_IPS.has(m),
  },
  {
    name: 'mancer-host',
    re: /\b(?:[a-z0-9-]+\.)+mancer\.xyz\b/gi,
    why: 'a host under mancer.xyz that is not a public one',
    allow: (m) => {
      const labels = m.toLowerCase().split('.')
      return labels.length === 3 && PUBLIC_HOSTS.has(labels[0])
    },
  },
  {
    name: 'app-host',
    re: /\b[a-z0-9-]+\.(?:fly\.dev|fly\.io|herokuapp\.com|onrender\.com|railway\.app|ngrok\.(?:io|app))\b|\bfly\.toml\b/gi,
    why: "an app's host on a hosting provider",
  },
  { name: 'monorepo-scope', re: /@mancer\/[a-z]/g, why: "a package of Mancer's monorepo, which is never published" },
  {
    name: 'server-env',
    re: /\bMANCER_[A-Z0-9_]{2,}\b/g,
    why: "an environment variable of Mancer's own servers",
    allow: (m, ctx) => ctx.declared.has(m) || OWN_ENV.some((re) => re.test(m)),
  },
  // each pattern is written so that it does not match its own text, since this file is published and scanned too
  { name: 'note-ref', re: /\b(?:item|items) \d+\b|\blab[ ]log\b/gi, why: 'a reference to an internal note' },
]

const SKIP_DIRS = new Set(['node_modules', '.git'])
const TEXT = /\.(?:[cm]?[jt]sx?|d\.[cm]?ts|json|ya?ml|md|mdx|txt|sh|toml|example|gitignore|npmrc|lock)$|(?:^|\/)(?:LICENSE|README|SECURITY|\.gitignore|\.env\.example)$/i

/** Every text file under the paths given. */
export function filesOf(paths) {
  const out = []
  const walk = (p) => {
    const s = statSync(p)
    if (s.isDirectory()) {
      for (const d of readdirSync(p)) if (!SKIP_DIRS.has(d)) walk(join(p, d))
    } else if (TEXT.test(p)) out.push(p)
  }
  for (const p of paths) walk(resolve(p))
  return out.sort()
}

/** The names code declares (a constant, a function, a type, an ABI's entry), which are no environment variable whatever
 * their shape. */
function declaredNames(texts) {
  const declared = new Set()
  const code = /\b(?:const|let|var|function|class|interface|type|enum)\s+([A-Z][A-Z0-9_]+)\b/g
  const abi = /["']?name["']?\s*:\s*["']([A-Z][A-Z0-9_]+)["']|\bfunction ([A-Z][A-Z0-9_]+)\(/g
  for (const t of texts) {
    for (const m of t.matchAll(code)) declared.add(m[1])
    for (const m of t.matchAll(abi)) declared.add(m[1] ?? m[2])
  }
  return declared
}

/** Every hit in the files, as { file, line, pattern, match, why }. */
export function scanFiles(files, patterns = PATTERNS, base = process.cwd()) {
  const texts = files.map((f) => readFileSync(f, 'utf8'))
  const ctx = { declared: declaredNames(texts) }
  const hits = []
  files.forEach((file, i) => {
    const lines = texts[i].split('\n')
    lines.forEach((text, n) => {
      for (const p of patterns) {
        for (const m of text.matchAll(new RegExp(p.re.source, p.re.flags.includes('g') ? p.re.flags : `${p.re.flags}g`))) {
          if (p.allow?.(m[0], ctx)) continue
          hits.push({ file: relative(base, file), line: n + 1, pattern: p.name, match: m[0], why: p.why, text: text.trim().slice(0, 240) })
        }
      }
    })
  })
  return hits
}

export function printHits(hits, label) {
  for (const h of hits) console.log(`  ${h.file}:${h.line}  ${h.pattern}  ${JSON.stringify(h.match)}  (${h.why})\n      ${h.text}`)
  console.log(hits.length ? `${label}: ${hits.length} hits` : `${label}: no hit`)
}

/** The public patterns, and those of each module named. */
export async function patternsWith(modules) {
  const extra = []
  for (const m of modules) extra.push(...(await import(pathToFileURL(resolve(m)).href)).default)
  return [...PATTERNS, ...extra]
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2)
  const modules = []
  const paths = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--patterns') modules.push(args[++i])
    else paths.push(args[i])
  }
  const patterns = await patternsWith(modules)
  const files = filesOf(paths)
  const hits = scanFiles(files, patterns)
  printHits(hits, `scanned ${files.length} files with ${patterns.length} patterns`)
  process.exit(hits.length ? 1 : 0)
}
