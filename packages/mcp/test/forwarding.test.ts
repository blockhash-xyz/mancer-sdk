import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { callerAddress, callerBuckets } from '../src/rate'
import { ConfigError, configFrom } from '../src/config'
import { call, configFor, httpClient, KEY, standIn } from './helpers'

// Every address here is IPv6's documentation prefix (RFC 3849) or a unique local one: no one's.
/**
 * What a call of the API carries of the MCP request it arrived on. A local copy carries none of the caller's headers: the
 * API reads it as the machine it runs on. The hosted copy (`MANCER_MCP_FORWARD_EDGE=1`) carries `CF-Connecting-IP`,
 * `CF-IPCountry`, `X-Mancer-Edge` and `User-Agent` as they came, and nothing else of them: never an Origin, a cookie, an
 * admin header, a platform's client-address header or a forwarded-for. The API's own reading of those headers is api-forwarding.test.ts.
 */

const api = await standIn()
after(() => api.close())

const CALLER = {
  'cf-connecting-ip': '2001:db8::4',
  'cf-ipcountry': 'CA',
  'x-mancer-edge': 'the-edge-proof',
  'user-agent': 'agent-app/1.0',
  'x-mancer-admin': 'Bearer admin-of-nobody',
  'fly-client-ip': '2001:db8::10',
  'x-forwarded-for': '2001:db8::11',
  cookie: 'session=abc',
}

const lastLimits = () => api.seen.filter((s) => s.path === '/v1/limits').at(-1)!

test('a local copy forwards none of the caller\'s headers, whatever the MCP request carried', async () => {
  const { client, close } = await httpClient(configFor(api), CALLER)
  try {
    await call(client, 'get_limits')
    const h = lastLimits().headers
    for (const [name, value] of Object.entries(CALLER)) assert.notEqual(h[name], value, `${name} is not forwarded`)
    for (const name of ['cf-connecting-ip', 'cf-ipcountry', 'x-mancer-edge', 'x-mancer-admin', 'fly-client-ip', 'x-forwarded-for', 'cookie']) assert.equal(h[name], undefined, name)
    assert.match(h['user-agent']!, /^mancer-mcp\/\d/, "the server's own agent")
    assert.equal(h.authorization, undefined)
  } finally {
    await close()
  }
})

test('the hosted copy forwards the four headers of the caller as they came, and nothing else of them', async () => {
  const { client, close } = await httpClient(configFor(api, { MANCER_MCP_FORWARD_EDGE: '1', MANCER_MCP_EDGE_SECRET: 'the-edge-proof' }), CALLER)
  try {
    await call(client, 'get_limits')
    const h = lastLimits().headers
    assert.deepEqual(
      { ip: h['cf-connecting-ip'], country: h['cf-ipcountry'], edge: h['x-mancer-edge'], agent: h['user-agent'] },
      { ip: '2001:db8::4', country: 'CA', edge: 'the-edge-proof', agent: 'agent-app/1.0' },
    )
    for (const name of ['x-mancer-admin', 'fly-client-ip', 'x-forwarded-for', 'cookie', 'origin']) assert.equal(h[name], undefined, `${name} is not forwarded`)
    // every call of a tool carries them, a build's several calls alike
    await call(client, 'get_quote', { tokenIn: 'ETH', tokenOut: '0x5fc5360d0400a0fd4f2af552add042d716f1d168', amount: '1' })
    const quote = api.seen.filter((s) => s.path === '/v1/quote').at(-1)!
    const resolve = api.seen.filter((s) => s.path === '/v1/tokens/resolve').at(-1)
    for (const s of [quote, ...(resolve ? [resolve] : [])]) assert.equal(s.headers['x-mancer-edge'], 'the-edge-proof')
  } finally {
    await close()
  }
})

test("a caller's API key in the MCP request goes to the API as the call's bearer; a sign-in, where there is one, goes instead", async () => {
  const { client, close } = await httpClient(configFor(api, { MANCER_MCP_FORWARD_EDGE: '1', MANCER_MCP_EDGE_SECRET: 'the-edge-proof' }), { ...CALLER, authorization: `Bearer ${KEY}` })
  try {
    await call(client, 'get_limits')
    assert.equal(lastLimits().headers.authorization, `Bearer ${KEY}`)
  } finally {
    await close()
  }
})

test("this server's own bucket counts a caller by the proven address where it holds the proof, and by the socket where the proof is forged", () => {
  const base = { headers: { 'cf-connecting-ip': '2001:db8::4', 'x-mancer-edge': 'the-edge-proof' }, socket: 'fd00::5' }
  const hosted = configFrom({ MANCER_MCP_FORWARD_EDGE: '1', MANCER_MCP_EDGE_SECRET: 'the-edge-proof' })
  // an IPv6 caller is its /64
  assert.equal(callerAddress(hosted, base), 'cf:2001:db8:0:0::/64')
  assert.equal(callerAddress(hosted, { ...base, headers: { ...base.headers, 'cf-connecting-ip': '2001:db8::99' } }), 'cf:2001:db8:0:0::/64')
  assert.equal(callerAddress(hosted, { ...base, headers: { ...base.headers, 'x-mancer-edge': 'forged' } }), 'sock:fd00:0:0:0::/64', 'a forged proof places nobody')
  assert.equal(callerAddress(hosted, { ...base, headers: { 'cf-connecting-ip': '2001:db8::4' } }), 'sock:fd00:0:0:0::/64')
  // a copy that forwards for Cloudflare and holds no proof to check does not start
  assert.throws(() => configFrom({ MANCER_MCP_FORWARD_EDGE: '1' }), ConfigError)
  // a copy with no proof believes no header: a CF-Connecting-IP is anyone's word, whatever proof it carries
  assert.equal(callerAddress(configFrom({}), base), 'sock:fd00:0:0:0::/64')
  // the proof alone places a caller, forwarding or not
  assert.equal(callerAddress(configFrom({ MANCER_MCP_EDGE_SECRET: 'the-edge-proof' }), base), 'cf:2001:db8:0:0::/64')
  // stdio is one caller; a key pays its own bucket and its address's at a key's rate
  assert.deepEqual(callerBuckets(configFrom({}), null).map((b) => b.key), ['local'])
  const keyed = callerBuckets(hosted, { ...base, headers: { ...base.headers, authorization: `Bearer ${KEY}` } })
  assert.equal(keyed.length, 2)
  assert.match(keyed[0]!.key, /^key\|[0-9a-f]{16}$/)
  assert.equal(keyed[1]!.key, 'keyed|cf:2001:db8:0:0::/64')
  assert.ok(!keyed[0]!.key.includes(KEY.slice(7, 20)), 'no bucket names the key')
})
