import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// The package's own rules: its types are the reference's (the checked-in file is what openapi.yaml makes now), it runs
// in a browser as in Node (no Node module in its source), and it never touches a key beyond asking the account to sign.

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SRC = fileURLToPath(new URL('../src', import.meta.url))

function sources(dir = SRC): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? sources(`${dir}/${d.name}`) : d.name.endsWith('.ts') ? [`${dir}/${d.name}`] : []))
}

test('the generated types are what openapi.yaml makes now', () => {
  const out = execFileSync(process.execPath, [`${ROOT}scripts/gen-types.mjs`, '--check'], { encoding: 'utf8' })
  assert.match(out, /up to date/)
})

test('no source file imports a Node module, reads the environment, or writes a file', () => {
  for (const f of sources()) {
    const text = readFileSync(f, 'utf8')
    assert.doesNotMatch(text, /from ['"](node:|fs|path|os|child_process|crypto)['"]/, f)
    assert.doesNotMatch(text, /process\.env/, f)
  }
})

test('no source file logs, and none reads a private key: an account signs, and the SDK keeps only its address', () => {
  for (const f of sources()) {
    const text = readFileSync(f, 'utf8')
    assert.doesNotMatch(text, /console\.(log|info|warn|error|debug)/, f)
    assert.doesNotMatch(text, /privateKey|PRIVATE_KEY|mnemonic/i, f)
  }
})
