import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { askerFor } from '../src/api'
import { configFrom } from '../src/config'
import { Connection } from '../src/connection'
import { call, configFor, httpClient, sessionWallet, standIn, type Route } from './helpers'

/**
 * A sign-in that is being completed when the connection signs out, or begins another, lands nothing. `complete_sign_in`
 * waits on the API's `/auth/verify`, and an MCP client may send `sign_out` beside it on the same connection: the sign-out
 * answered first, and the late answer of the verify then put the session back, so the connection read signed in after
 * its sign-out had said it was not (the outside review of 2026-11-01). A completion lands only while nothing has
 * happened to the sign-in since it was read (connection.ts `epoch`).
 */

const api = await standIn()
after(() => api.close())
const agent = privateKeyToAccount(generatePrivateKey())
const other = privateKeyToAccount(generatePrivateKey())

/** Holds the stand-in's verify until `release`, answering then as the API would have. */
function holdVerify(): { release: () => void; reached: Promise<void>; restore: () => void } {
  const verify = api.routes['POST /auth/verify']!
  let release!: () => void
  let reachedNow!: () => void
  const gate = new Promise<void>((r) => (release = r))
  const reached = new Promise<void>((r) => (reachedNow = r))
  api.routes['POST /auth/verify'] = (async (req) => {
    reachedNow()
    await gate
    return verify(req)
  }) as Route
  return { release, reached, restore: () => { api.routes['POST /auth/verify'] = verify } }
}

test('a sign-out while the verify is out stands: the late answer signs nothing back in', async () => {
  const { client, close } = await httpClient(configFor(api))
  const held = holdVerify()
  try {
    const begun = await call(client, 'sign_in', { wallet: agent.address })
    assert.equal(begun.isError, false, begun.text)
    const signature = await agent.signMessage({ message: begun.body.message })
    const completing = call(client, 'complete_sign_in', { signature })
    await held.reached
    const out = await call(client, 'sign_out')
    assert.equal(out.body.signedIn, false)
    held.release()
    const done = await completing
    assert.equal(done.isError, true, 'the completion answers that it kept nothing')
    assert.equal(done.body.code, 'sign-in-superseded')
    assert.match(done.body.hint, /sign_in/)
    // the connection stays signed out: the account's tools wait, and no call carries the session
    const before = api.seen.length
    assert.equal((await call(client, 'get_notifications')).body.code, 'sign-in-required')
    assert.equal(api.seen.length, before, 'nothing asked of the API')
    const limits = await call(client, 'get_limits')
    assert.equal(limits.body.caller?.kind, 'anonymous', 'no session is sent after the sign-out')
    assert.ok(api.seen.slice(before).every((s) => sessionWallet(s.headers.authorization) === null))
  } finally {
    held.restore()
    await close()
  }
})

test('a sign-in begun while another completes is the one that stands', async () => {
  const { client, close } = await httpClient(configFor(api))
  const held = holdVerify()
  try {
    const first = await call(client, 'sign_in', { wallet: agent.address })
    const completing = call(client, 'complete_sign_in', { signature: await agent.signMessage({ message: first.body.message }) })
    await held.reached
    held.restore()
    // the agent begins again, for another wallet, before the first verify answers
    const second = await call(client, 'sign_in', { wallet: other.address })
    assert.equal(second.isError, false, second.text)
    held.release()
    const late = await completing
    assert.equal(late.body.code, 'sign-in-superseded', 'the first wallet\'s late session is not kept')
    // the second sign-in still waits, and completes as its own wallet
    const done = await call(client, 'complete_sign_in', { signature: await other.signMessage({ message: second.body.message }) })
    assert.equal(done.isError, false, done.text)
    assert.equal(done.body.wallet, other.address.toLowerCase())
    const notices = await call(client, 'get_notifications')
    assert.equal(notices.body.wallet, other.address.toLowerCase())
  } finally {
    held.restore()
    await close()
  }
})

test('a completion lands only under the epoch it was read in', () => {
  const wallet = agent.address.toLowerCase() as `0x${string}`
  const s = { wallet, account: null, expiresAt: Math.floor(Date.now() / 1000) + 3600 }
  const c = new Connection('c1')
  c.begin({ wallet, nonce: 'n', message: 'm' })
  const read = c.epoch
  c.signOut()
  assert.equal(c.complete('t.t.t', s, read), false, 'a sign-out since: nothing lands')
  assert.equal(c.signedIn(), null)
  assert.equal(c.sessionToken(), null)

  c.begin({ wallet, nonce: 'n1', message: 'm' })
  const stale = c.epoch
  c.begin({ wallet, nonce: 'n2', message: 'm' })
  assert.equal(c.complete('t.t.t', s, stale), false, 'a newer sign-in begun since: nothing lands')
  assert.equal(c.pending()?.nonce, 'n2', 'and the newer one still waits')
  assert.equal(c.abandon(stale), false, "a stale completion's failure leaves the newer sign-in standing")
  assert.equal(c.pending()?.nonce, 'n2')

  const now = c.epoch
  assert.equal(c.complete('t.t.t', s, now), true)
  assert.equal(c.signedIn()?.wallet, wallet)
  assert.equal(c.complete('t.t.t', s, now), false, 'one epoch lands once')
  assert.equal(c.abandon(now), false, "a second completion's failure leaves the first one's session")
  assert.equal(c.signedIn()?.wallet, wallet)
})

// The second reader's find (2026-11-01): a 401 forgot whatever session the connection held, so a call sent with the old
// session that answered after a new sign-in landed signed the connection out of the new one.
test('a late 401 for an old session forgets that session alone, and a sign-in that landed after it stands', async () => {
  const wallet = privateKeyToAccount(generatePrivateKey()).address
  const c = new Connection('late-401')
  const hour = () => Math.floor(Date.now() / 1000) + 3600
  assert.equal(c.complete('old.old.old', { wallet, account: null, expiresAt: hour() }, c.epoch), true)
  let release!: () => void
  const gate = new Promise<void>((r) => (release = r))
  let sent: string | null = null
  const fetch = (async (_url: string, init: RequestInit) => {
    sent = new Headers(init.headers).get('authorization')
    await gate
    return new Response(JSON.stringify({ error: 'x', code: 'session-revoked' }), { status: 401, headers: { 'content-type': 'application/json' } })
  }) as unknown as typeof globalThis.fetch
  const config = configFrom({ MANCER_API_URL: 'http://127.0.0.1:1', MANCER_SIGN_IN_DOMAIN: 'mancer.xyz', MANCER_MCP_PORT: '0' })
  const ask = askerFor({ config, connection: c, inbound: null, fetch } as never)
  const inflight = ask({ method: 'GET', path: '/v1/me/notifications' } as never)
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(sent, 'Bearer old.old.old')
  c.begin({ wallet, nonce: 'n', message: 'm' })
  assert.equal(c.complete('new.new.new', { wallet, account: null, expiresAt: hour() }, c.epoch), true)
  release()
  await inflight
  assert.equal(c.sessionToken(), 'new.new.new', 'the 401 was the old session\'s')
  // a 401 for the session in force still forgets it
  const again = ask({ method: 'GET', path: '/v1/me/notifications' } as never)
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(sent, 'Bearer new.new.new')
  await again
  assert.equal(c.sessionToken(), null)
})
