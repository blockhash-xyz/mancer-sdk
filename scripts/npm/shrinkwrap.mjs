#!/usr/bin/env node
// Writes the MCP server's npm-shrinkwrap.json, which npm publishes in its tarball: a package that reads the calldata its
// agents sign installs the tree its checks ran on. `npx` and `npm install -g` read a published package's shrinkwrap (and never its
// lock), so every package under the server is the version, the URL and the hash this repository's lock names.
//
//   node scripts/npm/shrinkwrap.mjs [--remove]
//
// packages/mcp's prepack runs it, and its postpack takes the file away again: the file is made from the lock at each
// pack and is never committed. It reads the repository's root package-lock.json and follows the server's dependencies
// as Node resolves them from packages/mcp: every package, its dependencies and its required peer dependencies, from the
// registry alone with an integrity hash. The SDK is the one package that is not in the lock as a download (it is a
// workspace): its entry names the registry's tarball of the SDK's version and the integrity of the SDK's tarball,
// read from MANCER_MCP_SDK_TARBALL where the caller packed it (scripts/npm/pack-check.mjs does), or packed here.
// The SDK and the server are released together, so the tarball the shrinkwrap names is the one published beside it.
// Exits 1 where the tree cannot be read whole from the lock.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const MCP = 'packages/mcp'
const SDK = 'packages/sdk'
const SDK_NAME = '@blockhash/mancer-sdk'
const REGISTRY = 'https://registry.npmjs.org/'
const OUT = join(ROOT, MCP, 'npm-shrinkwrap.json')
/** The fields of a lock entry a shrinkwrap carries; the flags (dev, peer, extraneous) are the monorepo root's view. */
const FIELDS = ['version', 'resolved', 'integrity', 'license', 'dependencies', 'optionalDependencies', 'peerDependencies', 'peerDependenciesMeta', 'bin', 'engines', 'os', 'cpu', 'libc', 'hasInstallScript', 'deprecated']

const fail = (why) => {
  console.error(`shrinkwrap: ${why}`)
  process.exit(1)
}

if (process.argv.includes('--remove')) {
  rmSync(OUT, { force: true })
  process.exit(0)
}

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))
const lock = readJson(join(ROOT, 'package-lock.json'))
if (lock.lockfileVersion !== 3 && lock.lockfileVersion !== 2) fail(`the root lock is version ${lock.lockfileVersion}`)
const L = lock.packages
const mcp = readJson(join(ROOT, MCP, 'package.json'))
const sdk = readJson(join(ROOT, SDK, 'package.json'))

/** The integrity of the SDK's tarball, as npm writes it. */
function sdkIntegrity() {
  let tarball = process.env.MANCER_MCP_SDK_TARBALL
  let tmp = null
  if (!tarball) {
    tmp = mkdtempSync(join(tmpdir(), 'mancer-shrinkwrap-'))
    execFileSync('npm', ['pack', '--pack-destination', tmp], { cwd: join(ROOT, SDK), stdio: ['ignore', 'ignore', 'inherit'] })
    const [file] = readdirSync(tmp).filter((f) => f.endsWith('.tgz'))
    tarball = join(tmp, file)
  }
  const bytes = readFileSync(tarball)
  if (tmp) rmSync(tmp, { recursive: true, force: true })
  return `sha512-${createHash('sha512').update(bytes).digest('base64')}`
}

/** The lock key Node finds `name` at, resolving from the package at lock key `from`. */
function lookup(from, name) {
  let dir = from
  for (;;) {
    const key = dir ? `${dir}/node_modules/${name}` : `node_modules/${name}`
    if (L[key]) return key
    if (!dir) return null
    const up = /^(.*?)\/?node_modules\/(?:@[^/]+\/)?[^/]+$/.exec(dir)
    dir = up ? up[1] : '' // a workspace (packages/mcp) resolves from the root next
  }
}

/** Where the package at lock key `key` stands in the server's own tree. */
function placeOf(key) {
  if (key.startsWith(`${MCP}/`)) return key.slice(MCP.length + 1)
  if (key.startsWith(`${SDK}/node_modules/`)) return `node_modules/${SDK_NAME}/${key.slice(SDK.length + 1)}`
  if (key.startsWith('node_modules/')) return key
  fail(`${key} is outside the root's node_modules and the two packages' own`)
}

const packages = {
  '': { name: mcp.name, version: mcp.version, license: mcp.license, dependencies: mcp.dependencies, bin: mcp.bin, engines: mcp.engines },
}
const placedFrom = new Map()
/** [lock key the dependency is resolved from, name, optional path] */
const queue = []
const requires = (from, pkg, optional) => {
  for (const name of Object.keys(pkg.dependencies ?? {})) queue.push([from, name, optional])
  for (const name of Object.keys(pkg.optionalDependencies ?? {})) queue.push([from, name, true])
  for (const name of Object.keys(pkg.peerDependencies ?? {})) if (!pkg.peerDependenciesMeta?.[name]?.optional) queue.push([from, name, optional])
}
requires(MCP, mcp, false)
const optionalOnly = new Map()
while (queue.length) {
  const [from, name, optional] = queue.shift()
  if (name === SDK_NAME) {
    const place = `node_modules/${SDK_NAME}`
    if (!packages[place]) {
      if (mcp.dependencies?.[SDK_NAME] !== sdk.version) fail(`the server depends on ${SDK_NAME}@${mcp.dependencies?.[SDK_NAME]}, and the SDK is ${sdk.version}: they are released together, so the server names the SDK's version exactly`)
      packages[place] = {
        version: sdk.version,
        resolved: `${REGISTRY}${SDK_NAME}/-/${SDK_NAME.split('/')[1]}-${sdk.version}.tgz`,
        integrity: sdkIntegrity(),
        license: sdk.license,
        dependencies: sdk.dependencies,
        engines: sdk.engines,
      }
      requires(SDK, sdk, optional)
    }
    continue
  }
  const key = lookup(from, name)
  if (!key) {
    if (optional) continue // an optional dependency the lock never installed, as on another platform
    fail(`${name}, which ${from} requires, is not in the lock`)
  }
  const entry = L[key]
  if (entry.link) fail(`${key} is a link to ${entry.resolved}, not a download`)
  const place = placeOf(key)
  if (placedFrom.has(place) && placedFrom.get(place) !== key) fail(`${placedFrom.get(place)} and ${key} both stand at ${place} in the server's tree`)
  if (placedFrom.has(place)) {
    // reached again by a path that requires it: what it requires is required too
    if (!optional && optionalOnly.get(place)) {
      optionalOnly.set(place, false)
      requires(key, entry, false)
    }
    continue
  }
  optionalOnly.set(place, optional)
  placedFrom.set(place, key)
  if (!entry.resolved?.startsWith(REGISTRY) || !/^sha512-/.test(entry.integrity ?? '')) fail(`${key} is not a registry download with a sha512 integrity`)
  packages[place] = Object.fromEntries(FIELDS.filter((f) => entry[f] !== undefined).map((f) => [f, entry[f]]))
  requires(key, entry, optional)
}
for (const [place, optional] of optionalOnly) if (optional && packages[place]) packages[place].optional = true

const sorted = Object.fromEntries(Object.entries(packages).sort(([a], [b]) => (a === '' ? -1 : b === '' ? 1 : a < b ? -1 : a > b ? 1 : 0)))
const shrinkwrap = { name: mcp.name, version: mcp.version, lockfileVersion: 3, requires: true, packages: sorted }
writeFileSync(OUT, `${JSON.stringify(shrinkwrap, null, 2)}\n`)
console.error(`shrinkwrap: ${Object.keys(sorted).length - 1} packages under ${mcp.name}@${mcp.version}, ${SDK_NAME}@${sdk.version} at ${packages[`node_modules/${SDK_NAME}`]?.integrity.slice(0, 20)}…`)
