#!/usr/bin/env node
// Reads published text for a secret, and for what belongs to Mancer's own operations and not to the public.
//
// A secret is a private key beside its name, an API key of Mancer's, an npm, GitHub or cloud token, a bearer token, a
// provider's RPC URL with its key in the path, or a webhook's URL. A file that holds secrets by its name (`.env` and
// its kin, `.npmrc`, a key file) is refused whatever it holds, and so is a binary file, which no pattern can read.
// Anvil's ten published development keys are no secret: the tests sign with them on a local fork.
//
// What belongs to Mancer's own operations: a home folder's path, an IP address, a host under mancer.xyz that is not a
// public one, an app host on a hosting provider, a package scope of the monorepo, an environment variable of Mancer's own
// servers, or a reference to an internal note. Contract addresses, ABIs, chain ids and the public hosts (api, docs,
// stream and www under mancer.xyz) are public facts and pass.
//
//   node scripts/npm/scan.mjs [--patterns <module.mjs>] <file or folder>...
//
// A folder is read whole, every regular file of it whatever its name, but for node_modules and .git trees. A pattern
// module adds patterns of its own (its default export, an array shaped as PATTERNS). Prints every hit and exits 1 where
// there is one.
import { lstatSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const PUBLIC_HOSTS = new Set(['api', 'docs', 'mcp', 'stream', 'www'])
const LOCAL_IPS = new Set(['127.0.0.1', '0.0.0.0'])

/** Environment names the published code and its tests read, which are the packages' own and no server's. */
const OWN_ENV = [/^MANCER_(MCP|SDK)_[A-Z0-9_]+$/, /^MANCER_(API_KEY|RPC_URL|API_URL|STREAM_URL|SIGN_IN_DOMAIN|HOME)$/]

/** Anvil's and Hardhat's default accounts, from the mnemonic `test test … junk`: published, and held by every fork. */
const ANVIL_KEYS = new Set([
  'ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  '59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  '5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
  '7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
  '47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a',
  '8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba',
  '92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e',
  '4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356',
  'dbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97',
  '2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6',
])
// a line that names a key: in prose or a camel-case name in any case, or a constant (`KEY`, `PRIVATE_KEY`, `BOT_PK`)
const KEY_NAME = /private[_ -]?key|secret[_ -]?key|signer[_ -]?key|wallet[_ -]?key|mnemonic|seed[_ -]?phrase/i
const KEY_CONST = /\b(?:[A-Z0-9]+_)*(?:KEY|PK|SECRET)\b\s*[:=]/
const HEX_32 = /\b(?:0x)?([0-9a-fA-F]{64})\b/g

/** A host the internet reserves for examples and tests (RFC 2606, RFC 6761), where no real key can be held. */
const EXAMPLE_HOST = /^https?:\/\/(?:[^/@\s]*@)?(?:[a-z0-9-]+\.)*(?:example(?:\.(?:com|net|org))?|test|invalid|localhost)(?::\d+)?(?:\/|$)/i

/** A JSON Web Token whose signature reads as words: written by hand for a test, since a real signature is random bytes. */
function handWrittenJwt(m) {
  const sig = m.split('.')[2] ?? ''
  const bytes = Buffer.from(sig.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
  return bytes.length >= 8 && /^[\x20-\x7e]+$/.test(bytes.toString('latin1'))
}

/** @type {{ name: string, re: RegExp, why: string, secret?: boolean, allow?: (match: string, ctx: { declared: Set<string>, line: string }) => boolean }[]} */
export const PATTERNS = [
  // ── secrets
  {
    name: 'private-key',
    secret: true,
    re: /\b(?:0x)?[0-9a-fA-F]{64}\b/g,
    why: 'a 32-byte hex value beside the name of a key',
    allow: (m, ctx) => !(KEY_NAME.test(ctx.line) || KEY_CONST.test(ctx.line)) || ANVIL_KEYS.has(m.replace(/^0x/, '').toLowerCase()),
  },
  { name: 'pem-key', secret: true, re: /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/g, why: 'a private key in PEM form' },
  { name: 'api-key', secret: true, re: /\bmancer_[A-Za-z0-9]{24,}\b/g, why: "an API key of Mancer's" },
  { name: 'npm-token', secret: true, re: /\bnpm_[A-Za-z0-9]{30,}\b|_authToken\s*=\s*(?!\$\{)[^\s'"]+/g, why: 'an npm token' },
  { name: 'github-token', secret: true, re: /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/g, why: 'a GitHub token' },
  {
    name: 'cloud-key',
    secret: true,
    re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b|\bAIza[0-9A-Za-z_-]{35}\b|\bxox[abprs]-[A-Za-z0-9-]{10,}\b|\bsk-(?:ant-)?[A-Za-z0-9_-]{32,}\b/g,
    why: "a cloud provider's or a model provider's key",
  },
  { name: 'bearer-token', secret: true, re: /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/g, why: 'a bearer token' },
  {
    name: 'jwt',
    secret: true,
    re: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{16,}/g,
    why: 'a signed token (a session)',
    allow: handWrittenJwt,
  },
  {
    name: 'keyed-url',
    secret: true,
    // a provider's RPC URL carries its key as a path segment after the version: /v2/<key> or /v3/<key>
    re: /\bhttps?:\/\/[^\s'"`]*\/v\d+\/[A-Za-z0-9_-]{16,}/gi,
    why: "an RPC URL with a provider's key in its path",
    allow: (m) => EXAMPLE_HOST.test(m) || !/\d/.test(m.slice(m.lastIndexOf('/') + 1)),
  },
  {
    name: 'keyed-url-query',
    secret: true,
    re: /\bhttps?:\/\/[^\s'"`]*[?&](?:api[_-]?key|key|token|access_token|secret)=[A-Za-z0-9_-]{12,}/gi,
    why: 'a URL with a key in its query',
    allow: (m) => EXAMPLE_HOST.test(m),
  },
  { name: 'webhook', secret: true, re: /\bdiscord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+|\bhooks\.slack\.com\/services\/[A-Za-z0-9/]+/gi, why: "a webhook's URL" },
  // ── Mancer's own operations
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

/** A file that holds secrets by its name, refused whatever it holds. `.env.example` is the template the docs name. */
const SECRET_FILE = /^(?:\.env(?!\.example$)(?:\..*)?|.+\.env|\.npmrc|\.netrc|\.pypirc|id_(?:rsa|ecdsa|ed25519)(?:\.pub)?|.+\.(?:pem|key|p12|pfx|keystore|jks))$/i
export const isSecretFile = (path) => SECRET_FILE.test(basename(path))

const SKIP_DIRS = new Set(['node_modules', '.git'])

/** Every file under the paths given, whatever its name or type: a symlink is listed (and refused by the scan), a folder
 * walked. */
export function filesOf(paths) {
  const out = []
  const walk = (p) => {
    const s = lstatSync(p)
    if (s.isDirectory()) {
      for (const d of readdirSync(p)) if (!SKIP_DIRS.has(d)) walk(join(p, d))
    } else out.push(p)
  }
  for (const p of paths) walk(resolve(p))
  return out.sort()
}

const utf8 = new TextDecoder('utf-8', { fatal: true })

/** A file's text, or why it has none the scan can read. */
function textOf(file) {
  const s = lstatSync(file)
  if (s.isSymbolicLink()) return { refused: 'a symlink, which publishes what it points at' }
  if (!s.isFile()) return { refused: 'not a regular file' }
  const bytes = readFileSync(file)
  if (bytes.includes(0)) return { refused: 'a binary file, which no pattern can read' }
  try {
    return { text: utf8.decode(bytes) }
  } catch {
    return { refused: 'not UTF-8 text, which no pattern can read' }
  }
}

const CODE = /\.(?:[cm]?[jt]sx?)$/

/** The names the code declares (a constant, a function, a type, an ABI's entry), which are no environment variable
 * whatever their shape. Only code declares them, and they excuse a name in code alone: a README, a workflow or a
 * manifest that names one is read as naming the variable. */
function declaredNames(files, texts) {
  const declared = new Set()
  const code = /\b(?:const|let|var|function|class|interface|type|enum)\s+([A-Z][A-Z0-9_]+)\b/g
  const abi = /["']?name["']?\s*:\s*["']([A-Z][A-Z0-9_]+)["']|\bfunction ([A-Z][A-Z0-9_]+)\(/g
  files.forEach((f, i) => {
    if (!CODE.test(f) || texts[i] === undefined) return
    for (const m of texts[i].matchAll(code)) declared.add(m[1])
    for (const m of texts[i].matchAll(abi)) declared.add(m[1] ?? m[2])
  })
  return declared
}

/** The names a set of files' code declares (above). */
export function declaredIn(files) {
  return declaredNames(files, files.map((f) => textOf(f).text))
}

/** Every hit in the files, as { file, line, pattern, match, why }. `alsoDeclared` names what a package the files import
 * declares (the server's own SDK, packed beside it): a name the server imports from it is excused as the SDK's is. */
export function scanFiles(files, patterns = PATTERNS, base = process.cwd(), alsoDeclared = new Set()) {
  const hits = []
  const read = files.map(textOf)
  const declaredInCode = declaredNames(files, read.map((r) => r.text))
  for (const name of alsoDeclared) declaredInCode.add(name)
  const none = new Set()
  files.forEach((file, i) => {
    const rel = relative(base, file)
    if (isSecretFile(file)) hits.push({ file: rel, line: 0, pattern: 'secret-file', match: basename(file), why: 'a file that holds secrets by its name', secret: true, text: '' })
    const { text: content, refused } = read[i]
    if (refused) {
      hits.push({ file: rel, line: 0, pattern: 'unreadable', match: basename(file), why: refused, text: '' })
      return
    }
    const declared = CODE.test(file) ? declaredInCode : none
    content.split('\n').forEach((text, n) => {
      const ctx = { declared, line: text }
      for (const p of patterns) {
        for (const m of text.matchAll(new RegExp(p.re.source, p.re.flags.includes('g') ? p.re.flags : `${p.re.flags}g`))) {
          if (p.allow?.(m[0], ctx)) continue
          hits.push({ file: rel, line: n + 1, pattern: p.name, match: m[0], why: p.why, secret: Boolean(p.secret), text: text.trim().slice(0, 240) })
        }
      }
    })
  })
  return hits
}

/** A secret's hit with every long value cut short, so a printed hit is no second copy of the secret. */
const masked = (s) => s.replace(HEX_32, (m) => `${m.slice(0, m.startsWith('0x') ? 8 : 6)}…`).replace(/([A-Za-z0-9_-]{6})[A-Za-z0-9_-]{10,}/g, '$1…')

export function printHits(hits, label) {
  for (const h of hits) {
    const show = h.secret ? masked : (s) => s
    console.log(`  ${h.file}:${h.line}  ${h.pattern}  ${JSON.stringify(show(h.match))}  (${h.why})${h.text ? `\n      ${show(h.text)}` : ''}`)
  }
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
