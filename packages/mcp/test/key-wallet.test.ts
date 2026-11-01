import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { getAddress, type Address } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import type { ApiCall, Asker } from '../src/api'
import { Connection } from '../src/connection'
import { KEY_NO_WALLET_KEEP_MS, KEY_WALLET_KEEP_MS, KeyWallets } from '../src/key-wallet'
import { createServer, KEY_DEFAULT_NOTE } from '../src/server'
import { KEY, USDG, VENUE_ROUTES, WETH, call, configFor, httpClient, sessionWallet, standIn } from './helpers'

/**
 * A tool defaults to the wallet a wallet key acts as, where no wallet is signed in and none is named: the key's wallet as
 * the API's `/auth/me` names it, asked with the key only when a tool needs the default, once, and kept by the key's hash.
 * The answer says the wallet came from the key. A partner's key (401) and a key without `read` (403) default to nothing, an
 * API that did not answer is a refusal to ask again, a sign-in wins over a key, a wallet named wins over both, and over HTTP
 * a key the server was started with defaults nobody.
 */

const OWNER = '0x00000000000000000000000000000000000000b7' as Address
const WALLET_KEY = `mancer_${'cd'.repeat(24)}`
const NO_READ_KEY = `mancer_${'ef'.repeat(24)}`
const UNREAD_KEY = `mancer_${'12'.repeat(24)}`

const api = await standIn({
  ...VENUE_ROUTES,
  // as the API answers /auth/me: a wallet key acts as its owner wallet (`address`, checksummed), a partner's key as nobody,
  // a key without the `read` scope may not ask, and a session names its own wallet
  'GET /auth/me': ({ headers }) => {
    const a = headers.authorization
    if (a === `Bearer ${WALLET_KEY}`) return { body: { address: getAddress(OWNER) } }
    if (a === `Bearer ${NO_READ_KEY}`) return { status: 403, body: { error: 'this key may not', code: 'key-scope', retryable: false } }
    if (a === `Bearer ${UNREAD_KEY}`) return { status: 503, body: { error: 'busy', code: 'store-unavailable', retryable: true } }
    const w = sessionWallet(a)
    return w ? { body: { address: w } } : { status: 401, body: { error: 'sign in required', code: 'auth-required', retryable: false } }
  },
})
after(() => api.close())

const meAsks = () => api.seen.filter((s) => s.path === '/auth/me').length
const lastQuote = () => api.seen.filter((s) => s.path === '/v1/quote').at(-1)!
const swap = { tokenIn: WETH, tokenOut: USDG, amount: '0.01', trustQuote: true }

test("with a wallet key and no sign-in, a build is the key's wallet's, says so, and the key is asked of once", async () => {
  const { client, close } = await httpClient(configFor(api), { authorization: `Bearer ${WALLET_KEY}` })
  try {
    const before = meAsks()
    // a tool that takes no wallet never asks whose the key is
    assert.equal((await call(client, 'get_quote', { tokenIn: WETH, tokenOut: USDG, amount: '1' })).isError, false)
    assert.equal(meAsks(), before)
    const r = await call(client, 'build_swap', swap)
    assert.equal(r.isError, false, r.text)
    assert.equal(r.body.transactions.at(-1).does.recipient, OWNER)
    assert.deepEqual(r.body.defaultWallet, { wallet: OWNER, from: 'api-key', note: KEY_DEFAULT_NOTE })
    assert.deepEqual([lastQuote().query.taker, lastQuote().headers.authorization], [OWNER, `Bearer ${WALLET_KEY}`])
    // a second build reads the kept answer
    assert.equal((await call(client, 'build_swap', swap)).isError, false)
    assert.equal(meAsks() - before, 1)
    // a wallet named is the build's, whatever the key's: no ask, and no mark
    const other = '0x00000000000000000000000000000000000000c8'
    const named = await call(client, 'build_swap', { ...swap, wallet: other })
    assert.equal(named.body.transactions.at(-1).does.recipient, other)
    assert.equal(named.body.defaultWallet, undefined)
    assert.equal(lastQuote().query.taker, other)
    assert.equal(meAsks() - before, 1)
  } finally {
    await close()
  }
})

test("a partner's key and a key without read default to nothing, and an API that did not answer is asked again", async () => {
  for (const [key, hint] of [[KEY, /wallet key acts as/], [NO_READ_KEY, /no read scope/]] as const) {
    const { client, close } = await httpClient(configFor(api), { authorization: `Bearer ${key}` })
    try {
      const r = await call(client, 'build_swap', swap)
      assert.equal(r.isError, true, key)
      assert.deepEqual([r.body.code, r.body.retryable], ['wallet-required', false])
      assert.match(r.body.hint, hint)
    } finally {
      await close()
    }
  }
  const { client, close } = await httpClient(configFor(api), { authorization: `Bearer ${UNREAD_KEY}` })
  try {
    const before = meAsks()
    for (let i = 0; i < 2; i++) {
      const r = await call(client, 'build_swap', swap)
      assert.deepEqual([r.body.code, r.body.retryable, r.body.retryAfterSeconds], ['key-wallet-unread', true, 2])
    }
    // nothing kept: each call asks again
    assert.equal(meAsks() - before, 2)
  } finally {
    await close()
  }
})

test('a sign-in wins over a wallet key: its wallet is the default, and its session is what the build carries', async () => {
  const agent = privateKeyToAccount(generatePrivateKey())
  const { client, close } = await httpClient(configFor(api), { authorization: `Bearer ${WALLET_KEY}` })
  try {
    const begun = await call(client, 'sign_in', { wallet: agent.address })
    assert.equal(begun.isError, false, begun.text)
    const done = await call(client, 'complete_sign_in', { signature: await agent.signMessage({ message: begun.body.message }) })
    assert.equal(done.isError, false, done.text)
    const r = await call(client, 'build_swap', swap)
    assert.equal(r.isError, false, r.text)
    assert.equal(lastQuote().query.taker, agent.address.toLowerCase())
    assert.equal(sessionWallet(lastQuote().headers.authorization), agent.address.toLowerCase())
    assert.equal(r.body.defaultWallet, undefined)
  } finally {
    await close()
  }
})

test("a key the server was started with defaults a stdio copy's builds, and nobody's over HTTP", async () => {
  const config = configFor(api, { MANCER_API_KEY: WALLET_KEY })
  // over HTTP the key is the operator's: no ask, no default
  const http = await httpClient(config)
  try {
    const before = meAsks()
    const r = await call(http.client, 'build_swap', swap)
    assert.equal(r.body.code, 'wallet-required')
    assert.equal(meAsks(), before)
  } finally {
    await http.close()
  }
  // a stdio copy is its one user's: the key's wallet, marked
  const server = createServer({ config, connection: new Connection('stdio-test'), inbound: () => null, envKeyDefaults: true, log: () => {} })
  const [a, b] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test-client', version: '1.0.0' })
  await Promise.all([server.connect(a), client.connect(b)])
  try {
    const r = await call(client, 'build_swap', swap)
    assert.equal(r.isError, false, r.text)
    assert.equal(lastQuote().query.taker, OWNER)
    assert.equal(r.body.defaultWallet.wallet, OWNER)
  } finally {
    await client.close()
    await server.close()
  }
})

/** An asker that answers /auth/me as `answer` says, counting its asks. */
function asker(answer: () => { status: number; body: unknown } | Promise<{ status: number; body: unknown }>): Asker & { asks: ApiCall[] } {
  const asks: ApiCall[] = []
  const f = async (c: ApiCall) => {
    asks.push(c)
    const a = await answer()
    return { ...a, headers: new Headers(), usedSession: false }
  }
  return Object.assign(f, { asks })
}

test('the kept answers: a wallet five minutes, no wallet one minute, a failure not at all, and one ask in flight a key', async () => {
  let now = 1_000_000
  const wallets = new KeyWallets(() => now)
  const owner = asker(() => ({ status: 200, body: { address: getAddress(OWNER) } }))
  assert.equal((await wallets.of('k1', owner)).wallet, OWNER)
  now += KEY_WALLET_KEEP_MS - 1
  assert.equal((await wallets.of('k1', owner)).wallet, OWNER)
  assert.equal(owner.asks.length, 1)
  now += 1
  assert.equal((await wallets.of('k1', owner)).wallet, OWNER)
  assert.equal(owner.asks.length, 2)
  assert.deepEqual(owner.asks[0], { method: 'GET', path: '/auth/me' })

  const partner = asker(() => ({ status: 401, body: { code: 'auth-required' } }))
  assert.deepEqual(await wallets.of('k2', partner), { wallet: null, why: 'no-wallet' })
  now += KEY_NO_WALLET_KEEP_MS - 1
  assert.deepEqual(await wallets.of('k2', partner), { wallet: null, why: 'no-wallet' })
  assert.equal(partner.asks.length, 1)
  now += 1
  await wallets.of('k2', partner)
  assert.equal(partner.asks.length, 2)

  // a 200 that names no address is no wallet, kept the minute; a 403 is a key without read
  const odd = asker(() => ({ status: 200, body: { address: 'not an address' } }))
  assert.deepEqual(await wallets.of('k3', odd), { wallet: null, why: 'no-wallet' })
  assert.deepEqual(await wallets.of('k3', odd), { wallet: null, why: 'no-wallet' })
  assert.equal(odd.asks.length, 1)
  assert.deepEqual(await wallets.of('k7', asker(() => ({ status: 403, body: null }))), { wallet: null, why: 'no-read' })

  // a 503, a 429 and an API that cannot be reached are kept for nothing
  for (const fail of [() => ({ status: 503, body: null }), () => ({ status: 429, body: null }), () => { throw new Error('unreachable') }]) {
    const a = asker(fail)
    assert.deepEqual(await wallets.of('k4', a), { wallet: null, why: 'unread' })
    assert.deepEqual(await wallets.of('k4', a), { wallet: null, why: 'unread' })
    assert.equal(a.asks.length, 2)
  }

  // concurrent calls with one key ask once
  let release!: () => void
  const gate = new Promise<void>((r) => (release = r))
  const slow = asker(async () => {
    await gate
    return { status: 200, body: { address: OWNER } }
  })
  const both = Promise.all([wallets.of('k5', slow), wallets.of('k5', slow)])
  release()
  assert.deepEqual((await both).map((r) => r.wallet), [OWNER, OWNER])
  assert.equal(slow.asks.length, 1)

  // an answer the asker sent with a session (a sign-in that landed while the ask went out) is no key's word: kept for nothing
  const session = Object.assign(async (c: ApiCall) => { session.asks.push(c); return { status: 200, body: { address: OWNER }, headers: new Headers(), usedSession: true } }, { asks: [] as ApiCall[] })
  assert.deepEqual(await wallets.of('k8', session), { wallet: null, why: 'unread' })
  assert.deepEqual(await wallets.of('k8', session), { wallet: null, why: 'unread' })
  assert.equal(session.asks.length, 2)

  // another key is asked of its own
  const second = asker(() => ({ status: 200, body: { address: '0x00000000000000000000000000000000000000D9' } }))
  assert.equal((await wallets.of('k6', second)).wallet, '0x00000000000000000000000000000000000000d9')
})
