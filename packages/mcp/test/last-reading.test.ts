import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'
import type { Hex } from 'viem'
import { configFrom } from '../src/config'
import { serveHttp } from '../src/http'
import { prefixOf } from '../src/rate'
import { _resetTokenMemoForTests, tokenInfos, type ChainSource } from '../src/values'
import type { ApiAnswer, Asker } from '../src/api'
import { configFor, standIn } from './helpers'

/**
 * The fixes of the final reading's lows and its availability find (2026-10-31): the session caps of a block of addresses
 * and the fair share at the cap of all, a caller this server cannot place, a token's decimals the chain did not answer, and
 * a node's URL that carries credentials.
 */

afterEach(() => _resetTokenMemoForTests())

const INIT = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'last', version: '1' } } }
const PROOF = 'the-edge-proof'

async function open(url: string, headers: Record<string, string>): Promise<{ status: number; id: string | null }> {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers }, body: JSON.stringify(INIT) })
  await r.text()
  return { status: r.status, id: r.headers.get('mcp-session-id') }
}

async function alive(url: string, id: string): Promise<boolean> {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-session-id': id, 'mcp-protocol-version': '2025-06-18' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
  })
  await r.text()
  return r.status === 200
}

const proven = (ip: string) => ({ 'cf-connecting-ip': ip, 'x-mancer-edge': PROOF })

/** An address of IPv4's documentation block (RFC 5737), and the block: written apart, as the published tree holds no address
 * but a loopback one whole. */
const NET = ['198', '51', '100'].join('.')
const v4 = (host: number) => `${NET}.${host}`

test('a block of addresses is an IPv6 /48 and an IPv4 /24, each kind apart', () => {
  assert.equal(prefixOf('cf:2001:db8:1:a::/64'), 'cf:2001:db8:1::/48')
  assert.equal(prefixOf('cf:2001:db8:1:ffff::/64'), 'cf:2001:db8:1::/48')
  assert.equal(prefixOf(`sock:${v4(9)}`), `sock:${NET}.0/24`)
  assert.equal(prefixOf(`cf:${v4(200)}`), `cf:${NET}.0/24`)
  assert.notEqual(prefixOf(`cf:${v4(9)}`), prefixOf(`sock:${v4(9)}`))
  for (const odd of ['sock:unknown', 'local', 'cf:fe80::1%eth0']) assert.equal(prefixOf(odd), odd)
})

test('the /64s of one /48 hold MANCER_MCP_MAX_SESSIONS_PER_PREFIX at the most, and the /24 of an IPv4 address alike', async () => {
  const api = await standIn()
  let at = 1_800_000_000_000
  const handle = await serveHttp(configFor(api, { MANCER_MCP_MAX_SESSIONS_PER_ADDRESS: '2', MANCER_MCP_MAX_SESSIONS_PER_PREFIX: '3', MANCER_MCP_EDGE_SECRET: PROOF }), { now: () => (at += 1_100), log: () => {} })
  try {
    const ids: string[] = []
    for (const ip of ['2001:db8:1:a::1', '2001:db8:1:b::1', '2001:db8:1:c::1']) ids.push((await open(handle.url, proven(ip))).id!)
    const other = (await open(handle.url, proven('2001:db8:2::1'))).id!
    // a fourth /64 of the same /48: the /48's least lately used goes, and no other /48's
    const fourth = (await open(handle.url, proven('2001:db8:1:d::1'))).id!
    assert.deepEqual([await alive(handle.url, ids[0]!), await alive(handle.url, ids[1]!), await alive(handle.url, ids[2]!), await alive(handle.url, fourth), await alive(handle.url, other)], [false, true, true, true, true])
    // IPv4: the /24's addresses share one cap
    const block: string[] = []
    for (const host of [1, 2, 3, 4]) block.push((await open(handle.url, proven(v4(host)))).id!)
    assert.deepEqual(await Promise.all(block.map((id) => alive(handle.url, id))), [false, true, true, true])
    assert.equal(await alive(handle.url, other), true)
  } finally {
    await handle.close()
    await api.close()
  }
})

test('a caller this server cannot place takes no proven caller’s session, and a proven newcomer may take one of its', async () => {
  // With an edge proof held, a request with no proof (or another) is its socket's: every such caller one address. It holds
  // that address's sessions and gives up its own; at the cap of all it never takes a proven caller's place
  const api = await standIn()
  let at = 1_800_000_000_000
  const lines: string[] = []
  const handle = await serveHttp(configFor(api, { MANCER_MCP_MAX_SESSIONS: '3', MANCER_MCP_MAX_SESSIONS_PER_ADDRESS: '2', MANCER_MCP_EDGE_SECRET: PROOF }), { now: () => (at += 1_100), log: (l) => lines.push(l) })
  try {
    const p1 = (await open(handle.url, proven('2001:db8:a::1'))).id!
    const p2 = (await open(handle.url, proven('2001:db8:b::1'))).id!
    const u1 = (await open(handle.url, { 'cf-connecting-ip': '2001:db8:c::1' })).id!
    // full: an unplaced caller with a session of its own gives up its own
    const u2 = (await open(handle.url, { 'cf-connecting-ip': '2001:db8:d::1', 'x-mancer-edge': 'not-the-proof' })).id!
    assert.deepEqual([await alive(handle.url, p1), await alive(handle.url, p2), await alive(handle.url, u1), await alive(handle.url, u2)], [true, true, false, true])
    // the unplaced caller's address is at its cap of 2 and the server is full with 2 proven prefixes over 1 place each:
    // a second unplaced session takes its own least lately used, never a proven one
    const u3 = (await open(handle.url, {})).id!
    assert.deepEqual([await alive(handle.url, u2), await alive(handle.url, u3), await alive(handle.url, p1), await alive(handle.url, p2)], [false, true, true, true])
    // a proven newcomer of a fourth prefix: 3 places over 4 prefixes, a share of none, and every prefix over it: the least
    // lately used session of them goes, here the unplaced caller's
    const e = (await open(handle.url, proven('2001:db8:e::1'))).id!
    assert.deepEqual([await alive(handle.url, u3), await alive(handle.url, p1), await alive(handle.url, p2), await alive(handle.url, e)], [false, true, true, true])
    // the warning: requests with no proof and with another, said once a minute at the most and never the proof
    assert.equal(lines.filter((l) => /X-Mancer-Edge/.test(l)).length, 1)
    assert.match(lines.find((l) => /X-Mancer-Edge/.test(l))!, /carried no X-Mancer-Edge, or one that is not this server's proof/)
    assert.doesNotMatch(lines.join('\n'), /the-edge-proof|not-the-proof/)
  } finally {
    await handle.close()
  }
  // unplaced callers that hold none of their own, at the cap of all: refused rather than take a proven caller's place
  const full = await serveHttp(configFor(api, { MANCER_MCP_MAX_SESSIONS: '2', MANCER_MCP_EDGE_SECRET: PROOF }), { now: () => (at += 1_100), log: () => {} })
  try {
    const a = (await open(full.url, proven('2001:db8:a::1'))).id!
    const b = (await open(full.url, proven('2001:db8:a::2'))).id!
    assert.equal((await open(full.url, {})).status, 503)
    assert.deepEqual([await alive(full.url, a), await alive(full.url, b)], [true, true])
    // a proven newcomer of another /48 takes the place of the /48 over its share (2 of 2, its share 1)
    const c = (await open(full.url, proven('2001:db8:9::1'))).id!
    assert.deepEqual([await alive(full.url, a), await alive(full.url, b), await alive(full.url, c)], [false, true, true])
  } finally {
    await full.close()
    await api.close()
  }
})

test('the hosted copy warns once a minute of requests that carry no edge proof at all', async () => {
  const api = await standIn()
  let at = 1_800_000_000_000
  const lines: string[] = []
  const handle = await serveHttp(configFor(api, { MANCER_MCP_EDGE_SECRET: PROOF }), { now: () => at, log: (l) => lines.push(l) })
  try {
    await open(handle.url, {})
    await open(handle.url, {})
    // its health and a proven request warn of nothing
    await fetch(`${handle.url}health`)
    await open(handle.url, proven('2001:db8::1'))
    assert.equal(lines.filter((l) => /X-Mancer-Edge/.test(l)).length, 1)
    at += 61_000
    await open(handle.url, {})
    const warned = lines.filter((l) => /X-Mancer-Edge/.test(l))
    assert.equal(warned.length, 2)
    assert.match(warned[1]!, /^mancer-mcp: warning: 2 requests since the last warning/)
  } finally {
    await handle.close()
    await api.close()
  }
  // a copy that holds no proof (a local one) warns of nothing
  const local = await standIn()
  const quiet: string[] = []
  const plain = await serveHttp(configFor(local), { log: (l) => quiet.push(l) })
  try {
    await open(plain.url, {})
    assert.equal(quiet.filter((l) => /X-Mancer-Edge/.test(l)).length, 0)
  } finally {
    await plain.close()
    await local.close()
  }
})

// ---------------------------------------------------------------------------------------------------- decimals

const TOKEN = '0x00000000000000000000000000000000000070c1'

/** A chain source whose chain door answers `answer` to every eth_call: an HTTP status and a body. */
function doorOf(answer: () => { status: number; body: unknown; headers?: Record<string, string> }): ChainSource {
  const api: Asker = async (c): Promise<ApiAnswer> => {
    if (c.path === '/v1/tokens/resolve') return { status: 200, body: { tokens: [] }, headers: new Headers(), usedSession: false }
    const a = answer()
    return { status: a.status, body: a.body, headers: new Headers(a.headers ?? {}), usedSession: false }
  }
  return { api, config: { rpcUrl: null, requestTimeoutMs: 5_000 } }
}

test("a token's decimals the chain's door or node did not answer are the chain's silence, never a verdict on the token", async () => {
  const code = async (src: ChainSource) => {
    try {
      await tokenInfos(src, [{ native: false, address: TOKEN }])
      return 'answered'
    } catch (e) {
      const r = (e as { refusal?: { code?: string; retryable?: boolean; retryAfterSeconds?: number } }).refusal
      return `${r?.code}${r?.retryable ? ' retryable' : ''}${r?.retryAfterSeconds !== undefined ? ` after ${r.retryAfterSeconds}` : ''}`
    }
  }
  const rpcError = (error: Record<string, unknown>) => () => ({ status: 200, body: { jsonrpc: '2.0', id: 1, error } })
  // the node's throttle and its own failures, passed through the door as its answer
  assert.equal(await code(doorOf(rpcError({ code: 429, message: 'Too Many Requests' }))), 'chain-unavailable retryable')
  assert.equal(await code(doorOf(rpcError({ code: -32005, message: 'limit exceeded' }))), 'chain-unavailable retryable')
  assert.equal(await code(doorOf(rpcError({ code: -32603, message: 'request timed out' }))), 'chain-unavailable retryable')
  assert.equal(await code(doorOf(rpcError({ code: -32000, message: 'header not found' }))), 'chain-unavailable retryable')
  // the door refusing for itself: its upstream did not answer, or it is at capacity
  assert.equal(await code(doorOf(() => ({ status: 502, body: { jsonrpc: '2.0', id: null, error: { code: -32000, message: 'upstream unreachable' } } }))), 'chain-unavailable retryable')
  assert.equal(await code(doorOf(() => ({ status: 429, body: { error: 'too many', code: 'rate-limited', retryable: true }, headers: { 'retry-after': '3' } }))), 'chain-unavailable retryable after 3')
  // the call's own failure in the EVM is no token
  assert.equal(await code(doorOf(rpcError({ code: 3, message: 'execution reverted', data: '0x' }))), 'unknown-token')
  assert.equal(await code(doorOf(rpcError({ code: -32000, message: 'execution reverted' }))), 'unknown-token')
  assert.equal(await code(doorOf(rpcError({ code: -32015, message: 'invalid opcode: INVALID' }))), 'unknown-token')
  assert.equal(await code(doorOf(() => ({ status: 200, body: { jsonrpc: '2.0', id: 1, result: '0x' } }))), 'unknown-token')
  // and a refusal of the API's own about the caller stands as it came
  assert.equal(await code(doorOf(() => ({ status: 401, body: { error: 'This session was ended. Sign in again.', code: 'session-revoked', retryable: false } }))), 'session-revoked')
  // a door that answers it after all: read, and kept
  assert.equal(await code(doorOf(() => ({ status: 200, body: { jsonrpc: '2.0', id: 1, result: `0x${'0'.repeat(62)}12` as Hex } }))), 'answered')
})

// ------------------------------------------------------------------------------------------------------- the node

test("a node's URL that carries credentials before its host is refused at the start, without the URL", () => {
  for (const url of ['https://user:secret-token@node.example/rpc', 'https://only-a-user@node.example/rpc']) {
    assert.throws(() => configFrom({ MANCER_MCP_RPC_URL: url }), (e: Error) => /carries credentials before its host/.test(e.message) && !/secret-token|only-a-user|node\.example/.test(e.message))
  }
  // a token in the path or the query is the node's own form, and is taken
  assert.equal(configFrom({ MANCER_MCP_RPC_URL: 'https://node.example/v2/token-in-the-path' }).rpcUrl, 'https://node.example/v2/token-in-the-path')
  assert.equal(configFrom({ MANCER_MCP_RPC_URL: 'https://node.example/rpc?key=abc' }).rpcUrl, 'https://node.example/rpc?key=abc')
})
