#!/usr/bin/env node
// The SDK as npm will publish it, checked as a consumer gets it:
//
//   node scripts/npm/pack-check.mjs [--patterns <module.mjs>] [--keep]
//
// 1. `npm pack` the package (its prepack builds it) into a folder outside the repository.
// 2. The tarball holds dist, LICENSE, README.md and package.json alone; no file names a package of Mancer's monorepo;
//    the JavaScript carries no comment but a bundler's annotations; and the scan (scan.mjs, with --patterns' own) finds
//    nothing in any file.
// 3. The tarball installed into a fresh folder with no workspace in reach, and in plain Node (no tsx): the SDK imported,
//    `new Mancer()` made and two offline functions called; a TypeScript file that imports the package's types checked
//    with `tsc --noEmit`.
// Prints the tarball's files and sizes, and exits 1 at the first check that fails.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stripComments } from './strip-comments.mjs'
import { filesOf, patternsWith, printHits, scanFiles } from './scan.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const PACKAGES = [
  { dir: 'packages/sdk', name: '@blockhash/mancer-sdk' },
]
const ALLOWED = /^(?:dist\/.+|LICENSE|README\.md|package\.json)$/
const MONOREPO = /@mancer\/[a-z]/

const args = process.argv.slice(2)
const keep = args.includes('--keep')
const modules = args.flatMap((a, i) => (args[i - 1] === '--patterns' ? [a] : []))

let failed = false
const fail = (why) => {
  console.log(`  FAIL ${why}`)
  failed = true
}
const ok = (what) => console.log(`  ok   ${what}`)
const run = (cmd, argv, opts = {}) => execFileSync(cmd, argv, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20, ...opts })

const WORK = mkdtempSync(join(tmpdir(), 'mancer-pack-check-'))
if (realpathSync(WORK).startsWith(realpathSync(ROOT))) throw new Error('the temp folder is inside the repository')
const TARBALLS = join(WORK, 'tarballs')
mkdirSync(TARBALLS)
console.log(`pack check of ${ROOT}\nwork folder ${WORK}`)

// 1 and 2: pack, list, scan
const packed = []
for (const p of PACKAGES) {
  console.log(`\n── ${p.name}: npm pack`)
  const out = run('npm', ['pack', '--json', '--pack-destination', TARBALLS], { cwd: join(ROOT, p.dir) })
  const json = out.slice(out.search(/^\[$/m))
  const [info] = JSON.parse(json)
  packed.push({ ...p, info, tarball: join(TARBALLS, info.filename) })
  console.log(`  ${info.filename}: ${info.size} bytes packed, ${info.unpackedSize} unpacked, ${info.entryCount} files`)
  for (const f of info.files) console.log(`    ${String(f.size).padStart(8)}  ${f.path}`)
  const stray = info.files.filter((f) => !ALLOWED.test(f.path))
  if (stray.length) fail(`files outside dist, LICENSE, README.md and package.json: ${stray.map((f) => f.path).join(', ')}`)
  else ok('only dist, LICENSE, README.md and package.json')
  for (const must of ['LICENSE', 'README.md', 'package.json']) if (!info.files.some((f) => f.path === must)) fail(`no ${must}`)

  const into = join(WORK, 'extract', p.dir.split('/').pop())
  mkdirSync(into, { recursive: true })
  run('tar', ['-xzf', join(TARBALLS, info.filename), '-C', into])
  const files = filesOf([join(into, 'package')])
  const naming = files.filter((f) => MONOREPO.test(readFileSync(f, 'utf8')))
  if (naming.length) fail(`files that name a package of the monorepo: ${naming.map((f) => relative(into, f)).join(', ')}`)
  else ok('no file names a package of the monorepo')
  for (const f of files.filter((f) => /\.js$/.test(f))) {
    const code = readFileSync(f, 'utf8')
    if (stripComments(code, f) !== code) fail(`${relative(into, f)} carries comments`)
  }
  ok('the JavaScript carries no comment but a bundler annotation')
  const pkg = JSON.parse(readFileSync(join(into, 'package', 'package.json'), 'utf8'))
  if (pkg.license !== 'MIT') fail(`license ${pkg.license}`)
  if (pkg.publishConfig?.access !== 'public') fail('publishConfig.access is not public')
  if (pkg.private) fail('package.json says private')
  const named = Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies, ...pkg.optionalDependencies })
  console.log(`  dependencies: ${named.join(', ')}`)
  const patterns = await patternsWith(modules)
  const hits = scanFiles(files, patterns, into)
  printHits(hits, `  scan of ${files.length} files with ${patterns.length} patterns`)
  if (hits.length) fail('the scan found published text that is not public')
}

// 3: a consumer with no workspace in reach
console.log('\n── a fresh consumer, plain Node')
const C = join(WORK, 'consumer')
mkdirSync(C)
for (let d = dirname(C); d !== dirname(d); d = dirname(d)) {
  for (const n of ['package.json', 'node_modules']) {
    try {
      statSync(join(d, n))
      fail(`${join(d, n)} is in reach of the consumer`)
    } catch {}
  }
}
const repoTs = JSON.parse(readFileSync(join(ROOT, 'node_modules', 'typescript', 'package.json'), 'utf8')).version
writeFileSync(join(C, 'package.json'), JSON.stringify({ name: 'consumer', private: true, type: 'module' }, null, 2))
run('npm', ['install', '--no-audit', '--no-fund', '--ignore-scripts', ...packed.map((p) => p.tarball), `typescript@${repoTs}`, '@types/node@22'], { cwd: C })
const installed = JSON.parse(run('npm', ['ls', '--json', '--depth=0'], { cwd: C }))
for (const [name, d] of Object.entries(installed.dependencies ?? {})) console.log(`  installed ${name}@${d.version}`)
for (const p of packed) {
  const at = realpathSync(join(C, 'node_modules', p.name))
  if (!at.startsWith(realpathSync(C))) fail(`${p.name} resolves outside the consumer: ${at}`)
  else ok(`${p.name} is the tarball's, at ${relative(realpathSync(C), at)}`)
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
  if (r.version !== '0.1.0' || r.floor !== 'minOut' || !/^0x[0-9a-fA-F]{40}$/.test(r.router)) fail('the SDK answered other than it should')
  else ok('the SDK imports in plain Node, makes a Mancer and answers offline')
  if (!fileURLToPath(r.resolved).startsWith(realpathSync(C))) fail(`the SDK resolved to ${r.resolved}`)
} catch (e) {
  fail(`the SDK in plain Node: ${e.stderr || e.message}`)
}

writeFileSync(
  join(C, 'check.ts'),
  `import { Mancer, MancerCheckError, pinnedContracts, type FloorRule, type SwapRequest, type TrustedContracts } from '@blockhash/mancer-sdk'

const rule: FloorRule = { minOut: 1n }
const ask: Pick<SwapRequest, 'tokenIn' | 'tokenOut' | 'amountIn'> = { tokenIn: '0x0bd7d308f8e1639fab988df18a8011f41eacad73', tokenOut: '0x5fc5360d0400a0fd4f2af552add042d716f1d168', amountIn: 1n }
const mancer: Mancer = new Mancer({ baseUrl: 'https://api.mancer.xyz' })
const pinned: TrustedContracts | null = pinnedContracts(4663)
const error: typeof MancerCheckError = MancerCheckError
export { ask, error, mancer, pinned, rule }
`,
)
writeFileSync(
  join(C, 'tsconfig.json'),
  JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, noEmit: true, skipLibCheck: false, types: ['node'] }, files: ['check.ts'] }, null, 2),
)
try {
  run(join(C, 'node_modules', '.bin', 'tsc'), ['-p', 'tsconfig.json'], { cwd: C })
  ok(`tsc --noEmit (TypeScript ${repoTs}, NodeNext, skipLibCheck false) on a file that imports the package's types`)
} catch (e) {
  fail(`tsc on the consumer's types:\n${e.stdout}${e.stderr}`)
}

if (keep) console.log(`\nkept ${WORK}`)
else rmSync(WORK, { recursive: true, force: true })
console.log(failed ? '\n✗ pack check failed' : '\n✓ pack check passed')
process.exit(failed ? 1 : 0)
