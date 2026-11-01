import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { serveHttp } from '../src/http'
import { configFor, standIn } from './helpers'

/**
 * The hosted server's sessions are bounded by the caller's address: one address holds at most its own cap, and opening
 * one more evicts that address's oldest, never anyone else's, and only once the new session's initialize succeeded.
 */

const api = await standIn()
after(() => api.close())

const INIT = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'cap', version: '1' } } }
const PROOF = 'the-edge-proof'

async function open(url: string, headers: Record<string, string> = {}, body: unknown = INIT): Promise<string | null> {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers }, body: JSON.stringify(body) })
  await r.text()
  return r.headers.get('mcp-session-id')
}

/** An initialize this server takes up and the transport then refuses (an Accept with no event stream: 406), so a session
 * is made ready and never stands. */
const refusedOpen = (url: string, headers: Record<string, string> = {}) => open(url, { ...headers, accept: 'application/json' })

async function alive(url: string, id: string): Promise<boolean> {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-session-id': id, 'mcp-protocol-version': '2025-06-18' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
  })
  await r.text()
  return r.status === 200
}

test("one address holds its cap, an initialize that fails evicts nobody, and a new session evicts that address's least lately used alone", async () => {
  let at = 1_800_000_000_000
  const handle = await serveHttp(configFor(api, { MANCER_MCP_MAX_SESSIONS_PER_ADDRESS: '2', MANCER_MCP_EDGE_SECRET: PROOF }), { now: () => (at += 1_100), log: () => {} })
  // two /64s: the addresses of one block are one caller
  const A = { 'cf-connecting-ip': '2001:db8:a::1', 'x-mancer-edge': PROOF }
  const B = { 'cf-connecting-ip': '2001:db8:b::1', 'x-mancer-edge': PROOF }
  try {
    const a1 = (await open(handle.url, A))!
    const a2 = (await open(handle.url, A))!
    const b1 = (await open(handle.url, B))!
    assert.equal(handle.sessions(), 3)
    // an initialize the server refuses (no client info), or that its transport refuses once a session was made ready for
    // it, opens nothing, and so evicts nothing
    assert.equal(await open(handle.url, A, { ...INIT, params: { protocolVersion: '2025-06-18' } }), null)
    assert.equal(await refusedOpen(handle.url, A), null)
    assert.equal(handle.sessions(), 3)
    assert.ok(await alive(handle.url, a1))
    // a third of A's goes in beside its two, and the one A used least lately goes out (a2: a1 was just read): B's stands
    const a3 = (await open(handle.url, { ...A, 'cf-connecting-ip': '2001:db8:a::2' }))!
    assert.equal(handle.sessions(), 3)
    assert.deepEqual([await alive(handle.url, a2), await alive(handle.url, a1), await alive(handle.url, a3), await alive(handle.url, b1)], [false, true, true, true])
    // with no proof the caller is its socket, whatever address it names
    const forged = (await open(handle.url, { 'cf-connecting-ip': '2001:db8::c', 'x-mancer-edge': 'forged' }))!
    assert.ok(forged)
    assert.ok(await alive(handle.url, b1))
  } finally {
    await handle.close()
  }
})

test("past the cap of all, the oldest goes, and only once a new session stands", async () => {
  let at = 1_800_000_000_000
  const handle = await serveHttp(configFor(api, { MANCER_MCP_MAX_SESSIONS: '2' }), { now: () => (at += 1_100), log: () => {} })
  try {
    const first = (await open(handle.url))!
    const second = (await open(handle.url))!
    assert.equal(await open(handle.url, {}, { ...INIT, params: {} }), null)
    assert.equal(await refusedOpen(handle.url), null)
    assert.equal(handle.sessions(), 2)
    assert.deepEqual([await alive(handle.url, first), await alive(handle.url, second)], [true, true])
    const third = (await open(handle.url))!
    assert.equal(handle.sessions(), 2)
    assert.deepEqual([await alive(handle.url, first), await alive(handle.url, second), await alive(handle.url, third)], [false, true, true])
  } finally {
    await handle.close()
  }
})
