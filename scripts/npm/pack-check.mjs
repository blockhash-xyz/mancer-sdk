#!/usr/bin/env node
// The SDK and the MCP server as npm will publish them, checked as a consumer gets them:
//
//   node scripts/npm/pack-check.mjs [--patterns <module.mjs>] [--out <dir>] [--keep]
//
// 1. `npm pack` the SDK and then the MCP server (each one's prepack builds it; the server's writes its
//    npm-shrinkwrap.json, naming the SDK tarball packed here by its integrity) into a folder outside the repository.
// 2. Each tarball holds dist, LICENSE, README.md and package.json alone, and the server's its npm-shrinkwrap.json
//    beside them; no source map; no file names a package of Mancer's monorepo; the JavaScript carries no comment but a
//    bundler's annotations; and the scan (scan.mjs, with --patterns' own) finds nothing in any file. The server names
//    every dependency by its exact version, and its shrinkwrap names those versions, the SDK tarball's integrity, and
//    registry downloads with their hashes alone.
// 3. The server installed alone from its shrinkwrap, as `npx` and `npm install -g` install it (`npm ci` on the
//    shrinkwrap, the SDK taken from the tarball beside it and held to the shrinkwrap's hash), and the bin started there.
// 4. Both tarballs installed into a fresh folder with no workspace in reach, from a lock made of the shrinkwrap and
//    this repository's lock (`npm ci`, so nothing resolves at the moment), and in plain Node (no tsx): the SDK imported,
//    `new Mancer()` made and two offline functions called; a TypeScript file that imports both packages' types checked
//    with `tsc --noEmit`, with node's types and with none listed; the bin started through `.bin`, with no key and no
//    setting, an MCP `initialize` and `tools/list` answered over stdio (the server signs nothing, so it starts with
//    nothing of a wallet's).
// Every install runs with --ignore-scripts, and every child process with an environment that holds no token, key or
// CI credential. With --out, the two tarballs it checked are copied there as sdk.tgz and mcp.tgz, with SHA256SUMS:
// those are the files to publish, and nothing else is. Prints each tarball's files and sizes, and exits 1 at the first
// check that fails.
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stripComments } from './strip-comments.mjs'
import { declaredIn, filesOf, patternsWith, printHits, scanFiles } from './scan.mjs'

const ROOT = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..'))
const SDK = { dir: 'packages/sdk', name: '@blockhash/mancer-sdk', short: 'sdk' }
const MCP = { dir: 'packages/mcp', name: '@blockhash/mancer-mcp', short: 'mcp' }
const ALLOWED = {
  sdk: /^(?:dist\/(?!.*\.map$).+|LICENSE|README\.md|package\.json)$/,
  mcp: /^(?:dist\/(?!.*\.map$).+|LICENSE|README\.md|package\.json|npm-shrinkwrap\.json)$/,
}
const MONOREPO = /@mancer\/[a-z]/
const REGISTRY = 'https://registry.npmjs.org/'
const EXACT = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

const args = process.argv.slice(2)
const keep = args.includes('--keep')
const modules = args.flatMap((a, i) => (args[i - 1] === '--patterns' ? [a] : []))
const outAt = args.indexOf('--out')
const OUT = outAt >= 0 ? resolve(args[outAt + 1] ?? '') : null

let failed = false
const fail = (why) => {
  console.log(`  FAIL ${why}`)
  failed = true
}
const ok = (what) => console.log(`  ok   ${what}`)

// No child sees a credential: npm's install, a package's import or the bin cannot ask CI for a token it was never handed.
const SECRETISH = /TOKEN|SECRET|PASSWORD|PRIVATE|_KEY$|^KEY$|AUTH|CREDENTIAL|COOKIE|SESSION/i
const childEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^ACTIONS_/i.test(k) && !SECRETISH.test(k) && !/^npm_config_\/\//i.test(k)))
const run = (cmd, argv, opts = {}) =>
  execFileSync(cmd, argv, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20, ...opts, env: { ...childEnv, ...opts.env } })
const integrityOf = (file) => `sha512-${createHash('sha512').update(readFileSync(file)).digest('base64')}`
const sha256Of = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))

const WORK = realpathSync(mkdtempSync(join(tmpdir(), 'mancer-pack-check-')))
if (WORK.startsWith(ROOT + '/')) throw new Error('the temp folder is inside the repository')
const TARBALLS = join(WORK, 'tarballs')
mkdirSync(TARBALLS)
console.log(`pack check of ${ROOT}\nwork folder ${WORK}`)

/** Fails where a folder above `dir` holds a package.json or node_modules, which a resolution from `dir` could reach. */
function nothingAbove(dir) {
  for (let d = dirname(dir); d !== dirname(d); d = dirname(d)) {
    for (const n of ['package.json', 'node_modules']) {
      try {
        statSync(join(d, n))
        fail(`${join(d, n)} is in reach of ${dir}`)
      } catch {}
    }
  }
}

// 1 and 2: pack, list, scan
const sdkVersion = readJson(join(ROOT, SDK.dir, 'package.json')).version
const rootLock = readJson(join(ROOT, 'package-lock.json')).packages
const lockIntegrities = new Set(Object.values(rootLock).map((e) => e.integrity).filter(Boolean))
const patterns = await patternsWith(modules)

/** `alsoDeclared`: the names the packed SDK's code declares, which the server imports (scan.mjs `scanFiles`). */
function pack(p, env = {}, alsoDeclared = new Set()) {
  console.log(`\n── ${p.name}: npm pack`)
  const out = run('npm', ['pack', '--json', '--pack-destination', TARBALLS], { cwd: join(ROOT, p.dir), env })
  const [info] = JSON.parse(out.slice(out.search(/^\[$/m)))
  const tarball = join(TARBALLS, info.filename)
  const integrity = integrityOf(tarball)
  if (info.integrity !== integrity) fail(`npm names the tarball ${info.integrity}, and its bytes are ${integrity}`)
  console.log(`  ${info.filename}: ${info.size} bytes packed, ${info.unpackedSize} unpacked, ${info.entryCount} files, ${integrity.slice(0, 24)}…`)
  for (const f of info.files) console.log(`    ${String(f.size).padStart(8)}  ${f.path}`)
  const stray = info.files.filter((f) => !ALLOWED[p.short].test(f.path))
  if (stray.length) fail(`files the package may not carry: ${stray.map((f) => f.path).join(', ')}`)
  else ok(`only ${p.short === 'mcp' ? 'dist, LICENSE, README.md, package.json and npm-shrinkwrap.json' : 'dist, LICENSE, README.md and package.json'}, and no source map`)
  for (const must of ['LICENSE', 'README.md', 'package.json', ...(p.short === 'mcp' ? ['npm-shrinkwrap.json'] : [])]) {
    if (!info.files.some((f) => f.path === must)) fail(`no ${must} in the tarball`)
  }

  const into = join(WORK, 'extract', p.short)
  mkdirSync(into, { recursive: true })
  run('tar', ['-xzf', tarball, '-C', into])
  const files = filesOf([join(into, 'package')])
  const naming = files.filter((f) => MONOREPO.test(readFileSync(f, 'utf8')))
  if (naming.length) fail(`files that name a package of the monorepo: ${naming.map((f) => relative(into, f)).join(', ')}`)
  else ok('no file names a package of the monorepo')
  for (const f of files.filter((f) => /\.[cm]?js$/.test(f))) {
    const code = readFileSync(f, 'utf8')
    if (stripComments(code, f) !== code) fail(`${relative(into, f)} carries comments`)
  }
  ok('the JavaScript carries no comment but a bundler annotation')
  const pkg = readJson(join(into, 'package', 'package.json'))
  if (pkg.license !== 'MIT') fail(`license ${pkg.license}`)
  if (pkg.publishConfig?.access !== 'public') fail('publishConfig.access is not public')
  if (pkg.private) fail('package.json says private')
  const named = Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies, ...pkg.optionalDependencies })
  console.log(`  dependencies: ${Object.entries(pkg.dependencies ?? {}).map(([n, v]) => `${n}@${v}`).join(', ')}`)
  if (p.short === 'mcp' && named.length !== Object.keys(pkg.dependencies ?? {}).length) fail('the server has peer or optional dependencies, which its shrinkwrap does not bind')
  const hits = scanFiles(files, patterns, into, alsoDeclared)
  printHits(hits, `  scan of ${files.length} files with ${patterns.length} patterns`)
  if (hits.length) fail('the scan found published text that is not public')
  return { ...p, info, tarball, integrity, pkg, root: join(into, 'package'), declared: declaredIn(files) }
}

const sdk = pack(SDK)
const mcp = pack(MCP, { MANCER_MCP_SDK_TARBALL: sdk.tarball }, sdk.declared)

// the server's pins and its shrinkwrap
console.log('\n── the server\'s dependencies, pinned')
const loose = Object.entries(mcp.pkg.dependencies ?? {}).filter(([, v]) => !EXACT.test(v))
if (loose.length) fail(`the server names ranges, not versions: ${loose.map(([n, v]) => `${n}@${v}`).join(', ')}`)
else ok('the server names every dependency by its exact version')
if (mcp.pkg.dependencies?.[SDK.name] !== sdkVersion) fail(`the server depends on ${SDK.name}@${mcp.pkg.dependencies?.[SDK.name]}, and the SDK packed is ${sdkVersion}`)
else ok(`the server depends on ${SDK.name}@${sdkVersion}, the SDK packed beside it`)
let shrinkwrap = null
try {
  shrinkwrap = readJson(join(mcp.root, 'npm-shrinkwrap.json'))
} catch (e) {
  fail(`the server's tarball holds no npm-shrinkwrap.json that reads: ${e.message}`)
}
if (shrinkwrap) {
  const P = shrinkwrap.packages ?? {}
  const top = P[''] ?? {}
  if (shrinkwrap.lockfileVersion !== 3) fail(`the shrinkwrap is lockfile version ${shrinkwrap.lockfileVersion}`)
  if (shrinkwrap.name !== mcp.pkg.name || shrinkwrap.version !== mcp.pkg.version || top.name !== mcp.pkg.name || top.version !== mcp.pkg.version) fail('the shrinkwrap names another package or version')
  if (JSON.stringify(top.dependencies) !== JSON.stringify(mcp.pkg.dependencies)) fail("the shrinkwrap's dependencies are not the package's")
  for (const [n, v] of Object.entries(mcp.pkg.dependencies ?? {})) {
    if (P[`node_modules/${n}`]?.version !== v) fail(`the shrinkwrap holds ${n}@${P[`node_modules/${n}`]?.version} where the package names ${v}`)
  }
  const sdkEntry = P[`node_modules/${SDK.name}`]
  if (sdkEntry?.integrity !== sdk.integrity) fail(`the shrinkwrap names the SDK by ${sdkEntry?.integrity}, and the SDK tarball packed here is ${sdk.integrity}`)
  else if (sdkEntry.resolved !== `${REGISTRY}${SDK.name}/-/mancer-sdk-${sdkVersion}.tgz`) fail(`the shrinkwrap resolves the SDK from ${sdkEntry.resolved}`)
  else ok(`the shrinkwrap names the SDK tarball packed here, ${sdk.integrity.slice(0, 24)}…`)
  const entries = Object.entries(P).filter(([k]) => k && k !== `node_modules/${SDK.name}`)
  const off = entries.filter(([, e]) => !e.resolved?.startsWith(REGISTRY) || !/^sha512-/.test(e.integrity ?? '') || e.link)
  if (off.length) fail(`shrinkwrap entries that are no registry download with a hash: ${off.map(([k]) => k).join(', ')}`)
  const unknown = entries.filter(([, e]) => !lockIntegrities.has(e.integrity))
  if (unknown.length) fail(`shrinkwrap entries this repository's lock does not hold: ${unknown.map(([k]) => k).join(', ')}`)
  if (!off.length && !unknown.length) ok(`the shrinkwrap pins ${entries.length + 1} packages, each a registry download this repository's lock holds, by its hash`)
}

// 3: the server alone, from its shrinkwrap, as npx installs it
if (shrinkwrap) {
  console.log('\n── the server alone, from its shrinkwrap (as npx and npm install -g install it)')
  const A = join(WORK, 'alone')
  mkdirSync(A)
  run('tar', ['-xzf', mcp.tarball, '-C', A])
  const at = join(A, 'package')
  nothingAbove(at)
  // the SDK of this version is not on the registry until it is published: npm takes it from the tarball beside it, and
  // holds it to the integrity the shrinkwrap names. Its devDependencies are no consumer's, and no lock names them.
  const sw = readJson(join(at, 'npm-shrinkwrap.json'))
  sw.packages[`node_modules/${SDK.name}`].resolved = `file:${sdk.tarball}`
  writeFileSync(join(at, 'npm-shrinkwrap.json'), JSON.stringify(sw, null, 2))
  const manifest = readJson(join(at, 'package.json'))
  delete manifest.devDependencies
  writeFileSync(join(at, 'package.json'), JSON.stringify(manifest, null, 2))
  try {
    run('npm', ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: at })
    const wrong = Object.entries(sw.packages)
      .filter(([k]) => k)
      .filter(([k, e]) => {
        try {
          return readJson(join(at, k, 'package.json')).version !== e.version
        } catch {
          return !e.optional
        }
      })
    if (wrong.length) fail(`installed otherwise than the shrinkwrap says: ${wrong.map(([k]) => k).join(', ')}`)
    else ok(`npm ci installed the shrinkwrap's ${Object.keys(sw.packages).length - 1} packages, the SDK held to its hash`)
    await bin(process.execPath, [join(at, 'dist', 'cli.js')], at, 'the bin on the shrinkwrap\'s tree')
  } catch (e) {
    fail(`the server alone from its shrinkwrap: ${e.stderr || e.message}`)
  }
}

// 4: a consumer with no workspace in reach, installed from a lock
console.log('\n── a fresh consumer, from a lock, in plain Node')
const C = join(WORK, 'consumer')
mkdirSync(C)
nothingAbove(C)
const typesClosure = ['node_modules/typescript', 'node_modules/@types/node', 'node_modules/undici-types']
const consumerDeps = {
  [SDK.name]: `file:${relative(C, sdk.tarball)}`,
  [MCP.name]: `file:${relative(C, mcp.tarball)}`,
  typescript: rootLock['node_modules/typescript'].version,
  '@types/node': rootLock['node_modules/@types/node'].version,
}
writeFileSync(join(C, 'package.json'), JSON.stringify({ name: 'consumer', private: true, type: 'module', dependencies: consumerDeps }, null, 2))
const strip = (e) => Object.fromEntries(Object.entries(e).filter(([k]) => !['dev', 'devOptional', 'peer', 'extraneous'].includes(k)))
const consumerLock = { name: 'consumer', lockfileVersion: 3, requires: true, packages: { '': { name: 'consumer', dependencies: consumerDeps } } }
const placeIn = (key, entry) => {
  if (consumerLock.packages[key]) fail(`the consumer's lock places two packages at ${key}`)
  consumerLock.packages[key] = entry
}
for (const p of [sdk, mcp]) {
  const { name, version, license, dependencies, bin, engines } = p.pkg
  placeIn(`node_modules/${name}`, { version, resolved: consumerDeps[name], integrity: p.integrity, license, dependencies, bin, engines })
}
for (const [k, e] of Object.entries(shrinkwrap?.packages ?? {})) if (k && k !== `node_modules/${SDK.name}`) placeIn(k, e)
for (const k of typesClosure) placeIn(k, strip(rootLock[k]))
writeFileSync(join(C, 'package-lock.json'), JSON.stringify(consumerLock, null, 2))
try {
  run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: C })
  ok(`npm ci installed the consumer's ${Object.keys(consumerLock.packages).length - 1} packages from its lock`)
} catch (e) {
  fail(`npm ci of the consumer: ${e.stderr || e.message}`)
}
const installed = JSON.parse(run('npm', ['ls', '--json', '--depth=0'], { cwd: C }))
for (const [name, d] of Object.entries(installed.dependencies ?? {})) console.log(`  installed ${name}@${d.version}`)
for (const p of [sdk, mcp]) {
  const at = realpathSync(join(C, 'node_modules', p.name))
  if (!at.startsWith(realpathSync(C))) fail(`${p.name} resolves outside the consumer: ${at}`)
  else ok(`${p.name} is the tarball's, at ${relative(realpathSync(C), at)}`)
}
const viaMcp = join(C, 'node_modules', '@blockhash', 'mancer-mcp', 'node_modules', '@blockhash', 'mancer-sdk')
try {
  statSync(viaMcp)
  fail('the MCP server holds an SDK of its own, not the tarball beside it')
} catch {
  ok("the MCP server's @blockhash/mancer-sdk is the SDK tarball's")
}

const node = (code) => run(process.execPath, ['--input-type=module', '-e', code], { cwd: C }).trim()
try {
  const out = node(`
    import { Mancer, SDK_VERSION, floorKind, pinnedContracts } from '@blockhash/mancer-sdk'
    const m = new Mancer()
    const t = pinnedContracts(4663)
    console.log(JSON.stringify({ version: SDK_VERSION, baseUrl: m.baseUrl, router: t.router, floor: floorKind({ minOut: 1n }, 'swap'), resolved: import.meta.resolve('@blockhash/mancer-sdk') }))
  `)
  const r = JSON.parse(out)
  console.log(`  ${out}`)
  if (r.version !== sdkVersion || r.floor !== 'minOut' || !/^0x[0-9a-fA-F]{40}$/.test(r.router)) fail('the SDK answered other than it should')
  else ok('the SDK imports in plain Node, makes a Mancer and answers offline')
  if (!fileURLToPath(r.resolved).startsWith(realpathSync(C))) fail(`the SDK resolved to ${r.resolved}`)
} catch (e) {
  fail(`the SDK in plain Node: ${e.stderr || e.message}`)
}
try {
  const out = node(`
    import * as mcp from '@blockhash/mancer-mcp'
    const config = mcp.configFrom({})
    console.log(JSON.stringify({ server: mcp.SERVER_NAME, version: mcp.SERVER_VERSION, api: config.apiUrl, tools: mcp.TOOLS.length, exports: Object.keys(mcp).length }))
  `)
  console.log(`  ${out}`)
  const r = JSON.parse(out)
  if (r.server !== 'mancer' || r.api !== 'https://api.mancer.xyz' || !(r.tools > 0)) fail('the MCP library answered other than it should')
  else ok('the MCP library imports in plain Node')
} catch (e) {
  fail(`the MCP library in plain Node: ${e.stderr || e.message}`)
}

writeFileSync(
  join(C, 'check.ts'),
  `import { Mancer, MancerCheckError, pinnedContracts, type FloorRule, type SwapRequest, type TrustedContracts } from '@blockhash/mancer-sdk'
import { configFrom, createServer, serveHttp, type Config, type HttpHandle, type ServerDeps } from '@blockhash/mancer-mcp'

const rule: FloorRule = { minOut: 1n }
const ask: Pick<SwapRequest, 'tokenIn' | 'tokenOut' | 'amountIn'> = { tokenIn: '0x0bd7d308f8e1639fab988df18a8011f41eacad73', tokenOut: '0x5fc5360d0400a0fd4f2af552add042d716f1d168', amountIn: 1n }
const mancer: Mancer = new Mancer({ baseUrl: 'https://api.mancer.xyz' })
const pinned: TrustedContracts | null = pinnedContracts(4663)
const config: Config = configFrom({})
const make: (d: ServerDeps) => unknown = createServer
const serve: (c: Config) => Promise<HttpHandle> = serveHttp
const error: typeof MancerCheckError = MancerCheckError
export { ask, config, error, make, mancer, pinned, rule, serve }
`,
)
const tsconfigs = {
  'tsconfig.json': { types: ['node'], what: "node's types listed" },
  // a consumer that lists no types: the declarations that name Node's types say where those come from
  'tsconfig.no-types.json': { types: [], what: 'no types listed' },
}
for (const [file, { types, what }] of Object.entries(tsconfigs)) {
  writeFileSync(join(C, file), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, noEmit: true, skipLibCheck: false, types }, files: ['check.ts'] }, null, 2))
  try {
    run(join(C, 'node_modules', '.bin', 'tsc'), ['-p', file], { cwd: C })
    ok(`tsc --noEmit (TypeScript ${rootLock['node_modules/typescript'].version}, NodeNext, skipLibCheck false, ${what}) on a file that imports both packages' types`)
  } catch (e) {
    fail(`tsc on the consumer's types (${what}):\n${e.stdout}${e.stderr}`)
  }
}

const head = readFileSync(join(C, 'node_modules', '@blockhash', 'mancer-mcp', 'dist', 'cli.js'), 'utf8').split('\n')[0]
if (head !== '#!/usr/bin/env node') fail(`the bin starts ${JSON.stringify(head)}`)
else ok('the bin starts with a node shebang')
await bin(join(C, 'node_modules', '.bin', 'mancer-mcp'), [], C, 'the bin through .bin')

if (OUT && !failed) {
  mkdirSync(OUT, { recursive: true })
  const sums = []
  for (const p of [sdk, mcp]) {
    copyFileSync(p.tarball, join(OUT, `${p.short}.tgz`))
    if (integrityOf(join(OUT, `${p.short}.tgz`)) !== p.integrity) fail(`the copy of ${p.short}.tgz is not the tarball checked`)
    sums.push(`${sha256Of(p.tarball)}  ${p.short}.tgz`)
  }
  writeFileSync(join(OUT, 'SHA256SUMS'), `${sums.join('\n')}\n`)
  console.log(`\nthe tarballs checked, in ${OUT}:\n${sums.map((s) => `  ${s}`).join('\n')}`)
}

if (keep) console.log(`\nkept ${WORK}`)
else rmSync(WORK, { recursive: true, force: true })
console.log(failed ? '\n✗ pack check failed' : '\n✓ pack check passed')
process.exit(failed ? 1 : 0)

/** Starts the bin with no key and no setting, and checks it answers `initialize` and lists its tools: the reads, the
 * builds and the sign-in, and none that signs. */
async function bin(cmd, argv, cwd, what) {
  try {
    const answers = await mcpOverStdio(cmd, argv, cwd)
    const init = answers.get(1)
    const tools = answers.get(2)?.result?.tools?.map((t) => t.name) ?? []
    console.log(`  initialize: ${JSON.stringify(init?.result?.serverInfo)} protocol ${init?.result?.protocolVersion}`)
    console.log(`  tools: ${tools.join(', ')}`)
    console.log(`  stderr: ${answers.stderr.trim()}`)
    const signing = tools.filter((t) => /sign_transaction|private|mint|webhook|delete_account/.test(t))
    if (init?.result?.serverInfo?.name !== 'mancer') fail(`${what}: the server did not answer initialize`)
    else if (!['get_quote', 'build_swap', 'prepare_limit_order', 'build_book_act', 'sign_in', 'complete_sign_in'].every((t) => tools.includes(t))) fail(`${what}: the server should list its reads, its builds and its sign-in`)
    else if (signing.length) fail(`${what}: the server lists tools it must not have: ${signing.join(', ')}`)
    else ok(`${what} starts with no key, answers initialize, and lists its ${tools.length} tools, none that signs`)
  } catch (e) {
    fail(`${what} over stdio: ${e.message}`)
  }
}

/** Starts the bin, sends `initialize` and `tools/list` over stdio, and answers what came back by id. */
function mcpOverStdio(cmd, argv, cwd) {
  return new Promise((done, reject) => {
    const child = spawn(cmd, argv, { cwd, stdio: ['pipe', 'pipe', 'pipe'], env: { PATH: process.env.PATH, HOME: process.env.HOME } })
    const answers = new Map()
    answers.stderr = ''
    let buffer = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`no answer in 20 s; stderr: ${answers.stderr}`))
    }, 20_000)
    const send = (msg) => child.stdin.write(`${JSON.stringify(msg)}\n`)
    child.stderr.on('data', (b) => (answers.stderr += b))
    child.stdout.on('data', (b) => {
      buffer += b
      let i
      while ((i = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, i).trim()
        buffer = buffer.slice(i + 1)
        if (!line) continue
        const msg = JSON.parse(line)
        if (msg.id === undefined) continue
        answers.set(msg.id, msg)
        if (msg.id === 1) {
          send({ jsonrpc: '2.0', method: 'notifications/initialized' })
          send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
        } else if (msg.id === 2) {
          clearTimeout(timer)
          child.kill()
          done(answers)
        }
      }
    })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (!answers.has(2)) {
        clearTimeout(timer)
        reject(new Error(`the server exited ${code}; stderr: ${answers.stderr}`))
      }
    })
    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'pack-check', version: '0.0.0' } } })
  })
}
