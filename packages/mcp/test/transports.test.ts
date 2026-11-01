import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { request } from 'node:http'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { TOOLS } from '../src/server'
import { serveHttp } from '../src/http'
import { SERVER_VERSION } from '../src/version'
import { USDG, call, configFor, httpClient, standIn } from './helpers'

/**
 * Both transports serve the same tools: stdio, as a client that starts a local server runs it (the source runner, a real
 * child process), and Streamable HTTP, stateful, as Mancer hosts it. The HTTP door's own rules: its health, a session it
 * does not hold, the Host and the Origin it answers, a session ended and one idle past its bound.
 */

const api = await standIn()
after(() => api.close())

const RUNNER = fileURLToPath(new URL('../scripts/run-source.mjs', import.meta.url))

test('over stdio the bin answers initialize and lists every tool, with no key', async () => {
  const client = new Client({ name: 'stdio-test', version: '1.0.0' })
  const env: Record<string, string> = { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', MANCER_API_URL: api.url, MANCER_SIGN_IN_DOMAIN: 'mancer.xyz' }
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [RUNNER], env, stderr: 'pipe' }))
  try {
    assert.deepEqual(client.getServerVersion(), { name: 'mancer', version: SERVER_VERSION })
    assert.match(client.getInstructions() ?? '', /dex aggregator and order layer of Robinhood Chain/)
    assert.match(client.getInstructions() ?? '', /never signs and never holds a key/)
    const { tools } = await client.listTools()
    assert.equal(tools.length, TOOLS.length)
    const r = await call(client, 'search_tokens', { query: 'USDG' })
    assert.equal(r.isError, false)
    assert.equal(r.body.tokens[0].address, USDG)
  } finally {
    await client.close()
  }
})

test('over Streamable HTTP the server initializes a session, lists the same tools and calls one', async () => {
  const { client, handle, close } = await httpClient(configFor(api))
  try {
    assert.equal(client.getServerVersion()?.name, 'mancer')
    const { tools } = await client.listTools()
    assert.deepEqual(tools.map((t) => t.name).sort(), TOOLS.map((t) => t.name).sort())
    assert.equal(handle.sessions(), 1)
    const r = await call(client, 'search_tokens', { query: 'USDG' })
    assert.equal(r.body.q, 'USDG')
  } finally {
    await close()
  }
})

test('the tools: one name each, plain descriptions, and builds marked as changing nothing', () => {
  const names = TOOLS.map((t) => t.name)
  assert.equal(new Set(names).size, names.length)
  assert.equal(TOOLS.length, 71)
  for (const n of ['sign_in', 'complete_sign_in', 'sign_out', 'get_quote', 'build_swap', 'build_transfer', 'prepare_limit_order', 'submit_order', 'list_books', 'build_book_act', 'get_me', 'send_signed_transaction']) assert.ok(names.includes(n), n)
  for (const t of TOOLS) {
    assert.match(t.name, /^[a-z][a-z_]+$/, t.name)
    assert.ok(t.description.length > 20 && t.description.length <= 600, `${t.name}: ${t.description.length}`)
    assert.doesNotMatch(t.description, /\blane\b|\bquoter\b|\ba DEX\b|private key/i, t.name)
  }
  // every build is held to the SDK's checks, and says it refuses build-mismatch
  for (const t of TOOLS.filter((x) => x.kind === 'build')) assert.match(t.description, /build-mismatch/, t.name)
  // nothing here signs, mints keys, deletes accounts or manages webhooks
  for (const n of names) assert.doesNotMatch(n, /sign_transaction|private|mint|api_key|webhook|delete_account/, n)
})

test('the version is the package\'s, and the SDK it names is the one beside it', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string; dependencies: Record<string, string> }
  const sdk = JSON.parse(readFileSync(new URL('../../sdk/package.json', import.meta.url), 'utf8')) as { version: string }
  assert.equal(SERVER_VERSION, pkg.version)
  assert.equal(pkg.dependencies['@blockhash/mancer-sdk'], sdk.version)
  for (const [n, v] of Object.entries(pkg.dependencies)) assert.match(v, /^\d+\.\d+\.\d+$/, `${n} is named by its exact version`)
})

const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers }, body: JSON.stringify(body) })
const INIT = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'raw', version: '0' } } }

test("the HTTP door: its health with no credential, a session it does not hold, and a call before initialize", async () => {
  const handle = await serveHttp(configFor(api), { log: () => {} })
  try {
    const health = await fetch(new URL('health', handle.url))
    assert.equal(health.status, 200)
    // up and its version, and nothing of who is connected
    assert.deepEqual(await health.json(), { ok: true, name: 'mancer', version: SERVER_VERSION })
    const unknown = await post(handle.url, { jsonrpc: '2.0', id: 2, method: 'tools/list' }, { 'mcp-session-id': 'not-a-session', 'mcp-protocol-version': '2025-06-18' })
    assert.equal(unknown.status, 404)
    assert.equal(((await unknown.json()) as { error: { code: number } }).error.code, -32001)
    const early = await post(handle.url, { jsonrpc: '2.0', id: 2, method: 'tools/list' })
    assert.equal(early.status, 400)
    const notJson = await fetch(handle.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{not json' })
    assert.equal(notJson.status, 400)
    assert.equal(((await notJson.json()) as { error: { code: number } }).error.code, -32700)
    assert.equal((await fetch(new URL('elsewhere', handle.url))).status, 404)
    // /mcp is the same endpoint as /
    const init = await post(new URL('mcp', handle.url).toString(), INIT)
    assert.equal(init.status, 200)
    assert.ok(init.headers.get('mcp-session-id'))
  } finally {
    await handle.close()
  }
})

test('a local copy answers only its own loopback Host, and a page only from an Origin it names; never a key from a page', async () => {
  const handle = await serveHttp(configFor(api), { log: () => {} })
  const port = new URL(handle.url).port
  try {
    // a name a page could point at this port (DNS rebinding) is no Host it serves
    // (fetch sets Host itself, so this asks with node's own client)
    const status = (host: string) => new Promise<number>((resolve, reject) => {
      const r = request({ host: '127.0.0.1', port: Number(port), path: '/', method: 'POST', headers: { host, 'content-type': 'application/json', accept: 'application/json, text/event-stream' } }, (res) => {
        res.resume()
        resolve(res.statusCode ?? 0)
      })
      r.on('error', reject)
      r.end(JSON.stringify(INIT))
    })
    assert.equal(await status(`evil.example:${port}`), 403)
    assert.equal(await status(`localhost:${port}`), 200)
    const page = await post(handle.url, INIT, { origin: 'https://evil.example' })
    assert.equal(page.status, 403)
  } finally {
    await handle.close()
  }
  const open = await serveHttp(configFor(api, { MANCER_MCP_ALLOWED_ORIGINS: 'https://app.example' }), { log: () => {} })
  try {
    assert.equal((await post(open.url, INIT, { origin: 'https://app.example' })).status, 200)
    const keyed = await post(open.url, INIT, { origin: 'https://app.example', authorization: 'Bearer mancer_abcdefabcdef' })
    assert.equal(keyed.status, 403)
    assert.match(((await keyed.json()) as { error: { message: string } }).error.message, /server’s alone/)
  } finally {
    await open.close()
  }
})

test('a session ends when its client ends it, and one idle past its bound is dropped with its sign-in', async () => {
  let now = 1_800_000_000_000
  const config = { ...configFor(api), sessionIdleMs: 60_000 }
  const handle = await serveHttp(config, { log: () => {}, now: () => now })
  try {
    const init = await post(handle.url, INIT)
    const id = init.headers.get('mcp-session-id')!
    assert.equal(handle.sessions(), 1)
    const end = await fetch(handle.url, { method: 'DELETE', headers: { 'mcp-session-id': id, 'mcp-protocol-version': '2025-06-18' } })
    assert.equal(end.status, 200)
    assert.equal(handle.sessions(), 0)
    // a second session, then a minute and more with no request: the sweep drops it
    await post(handle.url, INIT)
    assert.equal(handle.sessions(), 1)
    now += 61_000
    assert.equal(handle.sweep(), 1)
    assert.equal(handle.sessions(), 0)
  } finally {
    await handle.close()
  }
})

test('an address opens at most twenty sessions at once, then one a second', async () => {
  const handle = await serveHttp(configFor(api), { log: () => {} })
  try {
    for (let i = 0; i < 20; i++) assert.equal((await post(handle.url, INIT)).status, 200, `session ${i + 1}`)
    const limited = await post(handle.url, INIT)
    assert.equal(limited.status, 429)
    assert.ok(Number(limited.headers.get('retry-after')) >= 1)
    assert.equal(handle.sessions(), 20)
  } finally {
    await handle.close()
  }
})

test('past its most sessions the oldest goes first', async () => {
  const handle = await serveHttp({ ...configFor(api), maxSessions: 2 }, { log: () => {} })
  try {
    const a = (await post(handle.url, INIT)).headers.get('mcp-session-id')!
    await post(handle.url, INIT)
    await post(handle.url, INIT)
    assert.equal(handle.sessions(), 2)
    const gone = await post(handle.url, { jsonrpc: '2.0', id: 2, method: 'tools/list' }, { 'mcp-session-id': a, 'mcp-protocol-version': '2025-06-18' })
    assert.equal(gone.status, 404)
  } finally {
    await handle.close()
  }
})
