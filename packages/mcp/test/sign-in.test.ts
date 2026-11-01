import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { inspect } from 'node:util'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { Connection } from '../src/connection'
import { VENUE_ROUTES, call, configFor, httpClient, loginMessage, sessionWallet, standIn, WETH, USDG } from './helpers'

/**
 * The sign-in through the agent's own wallet, end to end: a real viem account signs the message `sign_in` answers, the
 * stand-in's `/auth/verify` checks the signature as the API does, and the session it answers is kept by the server for that
 * MCP session alone, sent on its later calls and on no other connection's, and never in an answer, a refusal or a log.
 */

const api = await standIn(VENUE_ROUTES)
after(() => api.close())

const agent = privateKeyToAccount(generatePrivateKey())
const other = privateKeyToAccount(generatePrivateKey())

async function signIn(client: Awaited<ReturnType<typeof httpClient>>['client'], account = agent) {
  const begun = await call(client, 'sign_in', { wallet: account.address })
  assert.equal(begun.isError, false, begun.text)
  assert.equal(begun.body.wallet, account.address.toLowerCase())
  const signature = await account.signMessage({ message: begun.body.message })
  const done = await call(client, 'complete_sign_in', { signature })
  assert.equal(done.isError, false, done.text)
  return { begun, done, signature }
}

test('an agent signs in with its own wallet: the server never shows the session, and sends it on the account\'s calls alone', async () => {
  const log: string[] = []
  const { client, close } = await httpClient(configFor(api), {}, log)
  try {
    // with no sign-in, an account's tool refuses before it asks anything
    const before = api.seen.length
    const refused = await call(client, 'get_notifications')
    assert.equal(refused.isError, true)
    assert.equal(refused.body.code, 'sign-in-required')
    assert.match(refused.body.hint, /sign_in/)
    assert.equal(api.seen.length, before, 'nothing asked of the API')

    const { begun, done } = await signIn(client)
    // the message is Mancer's sign-in for this wallet, chain 4663, as the API wrote it
    assert.match(begun.body.message, /^mancer\.xyz wants you to sign in with your Ethereum account:\n/)
    assert.match(begun.body.message, /Chain ID: 4663/)
    assert.match(begun.body.signWith, /personal_sign/)
    // the nonce call carried no credential
    const nonce = api.seen.find((s) => s.path === '/auth/nonce')!
    assert.equal(nonce.headers.authorization, undefined)
    assert.deepEqual(Object.keys(done.body).sort(), ['account', 'expiresAt', 'next', 'signedIn', 'wallet'])
    assert.equal(done.body.wallet, agent.address.toLowerCase())

    // the account's tools now act for the wallet, with the session as the bearer
    const notices = await call(client, 'get_notifications')
    assert.equal(notices.isError, false, notices.text)
    assert.equal(notices.body.wallet, agent.address.toLowerCase())
    const sent = api.seen.filter((s) => s.path === '/v1/me/notifications').at(-1)!
    assert.equal(sessionWallet(sent.headers.authorization), agent.address.toLowerCase())
    const bearer = sent.headers.authorization!.slice('Bearer '.length)

    // the token is in no answer, no refusal and no log line of the server
    const answers: string[] = [begun.text, JSON.stringify(done.body), notices.text]
    answers.push((await call(client, 'get_limits')).text, (await call(client, 'sign_out')).text)
    for (const a of answers) assert.ok(!a.includes(bearer), 'no answer carries the session')
    assert.ok(log.every((l) => !l.includes(bearer)))

    // signed out, the account's tools wait for a new sign-in again
    assert.equal((await call(client, 'get_notifications')).body.code, 'sign-in-required')
  } finally {
    await close()
  }
})

test("a build defaults to the signed-in wallet as taker, recipient and maker; a wallet named is the build's", async () => {
  const { client, close } = await httpClient(configFor(api))
  try {
    const bare = await call(client, 'build_swap', { tokenIn: WETH, tokenOut: USDG, amount: '0.01', trustQuote: true })
    assert.equal(bare.body.code, 'wallet-required')
    assert.match(bare.body.hint, /sign_in/)
    await signIn(client)
    const me = agent.address.toLowerCase()
    const swap = await call(client, 'build_swap', { tokenIn: WETH, tokenOut: USDG, amount: '0.01', trustQuote: true })
    assert.equal(swap.isError, false, swap.text)
    const q = api.seen.filter((s) => s.path === '/v1/quote').at(-1)!
    assert.deepEqual([q.query.taker, q.query.recipient], [me, me])
    assert.equal(swap.body.transactions[1].does.recipient, me)
    const order = await call(client, 'prepare_limit_order', { tokenIn: WETH, tokenOut: USDG, amount: '0.5', minOut: '1200' })
    assert.equal(order.isError, false, order.text)
    assert.equal(order.body.orders[0].order.maker, me)
    assert.equal(api.seen.filter((s) => s.path === '/v1/orders/setup').at(-1)!.query.maker, me)
    // signed in as the maker, the setup counted the maker's own open orders: no note says otherwise
    assert.ok(order.body.notes.every((n: string) => !/counts none/.test(n)))
    assert.equal((await call(client, 'build_transfer', { to: '@friend', token: 'ETH', amount: '0.001' })).isError, false)
    assert.equal((api.seen.filter((s) => s.path === '/v1/transfers/steps').at(-1)?.body as { wallet?: string } | undefined)?.wallet, me)
    const act = await call(client, 'build_book_act', { token: '0x00000000000000000000000000000000000b00c5', action: 'arm' })
    assert.equal(act.isError, false, act.text)
    assert.equal((api.seen.filter((s) => s.path.endsWith('/steps')).at(-1)!.body as { wallet: string }).wallet, me)
    // naming another wallet builds for it: its own signature is what the build waits on
    const theirs = await call(client, 'build_swap', { tokenIn: WETH, tokenOut: USDG, amount: '0.01', wallet: other.address, trustQuote: true })
    assert.equal(theirs.isError, false)
    assert.equal(api.seen.filter((s) => s.path === '/v1/quote').at(-1)!.query.taker, other.address.toLowerCase())
  } finally {
    await close()
  }
})

test('each MCP session holds its own sign-in: one connection\'s session is never another\'s', async () => {
  const a = await httpClient(configFor(api))
  const b = await httpClient(configFor(api))
  try {
    await signIn(a.client, agent)
    assert.equal((await call(b.client, 'get_notifications')).body.code, 'sign-in-required', 'the other connection is signed in to nothing')
    await signIn(b.client, other)
    assert.equal((await call(a.client, 'get_notifications')).body.wallet, agent.address.toLowerCase())
    assert.equal((await call(b.client, 'get_notifications')).body.wallet, other.address.toLowerCase())
  } finally {
    await a.close()
    await b.close()
  }
})

test('a sign-in the API refuses holds nothing, and a session the API ends is forgotten at once', async () => {
  const { client, close } = await httpClient(configFor(api))
  try {
    assert.equal((await call(client, 'complete_sign_in', { signature: `0x${'11'.repeat(65)}` })).body.code, 'no-sign-in')
    await call(client, 'sign_in', { wallet: agent.address })
    // a signature of another message, or by another wallet, is refused by the API and spends the nonce
    const wrong = await call(client, 'complete_sign_in', { signature: await other.signMessage({ message: 'not the sign-in' }) })
    assert.equal(wrong.isError, true)
    assert.equal(wrong.body.code, 'auth-failed')
    assert.equal((await call(client, 'complete_sign_in', { signature: `0x${'11'.repeat(65)}` })).body.code, 'no-sign-in')
    // signed in, then the API answers 401 for the session: the server forgets it and says to sign in again
    await signIn(client)
    api.routes['GET /v1/me/notifications'] = () => ({ status: 401, body: { error: 'This session was ended. Sign in again.', code: 'session-revoked', retryable: false } })
    const ended = await call(client, 'get_notifications')
    assert.equal(ended.body.code, 'session-revoked')
    assert.match(ended.body.hint, /no longer stands/)
    assert.equal((await call(client, 'get_me')).body.code, 'sign-in-required')
  } finally {
    await close()
    const fresh = await standIn()
    api.routes['GET /v1/me/notifications'] = fresh.routes['GET /v1/me/notifications']!
    await fresh.close()
  }
})

test("the server refuses to hand an agent a message that is not Mancer's sign-in for its wallet", async () => {
  const tampered = await standIn({
    'GET /auth/nonce': () => ({ body: { nonce: 'n'.repeat(32), message: loginMessage(other.address, 'n'.repeat(32), Math.floor(Date.now() / 1000)) } }),
  })
  const elsewhere = await standIn({
    'GET /auth/nonce': ({ query }) => ({ body: { nonce: 'n'.repeat(32), message: loginMessage(query.address!, 'n'.repeat(32), Math.floor(Date.now() / 1000), 'evil.example') } }),
  })
  try {
    for (const s of [tampered, elsewhere]) {
      const { client, close } = await httpClient(configFor(s))
      const r = await call(client, 'sign_in', { wallet: agent.address })
      assert.equal(r.body.code, 'sign-in-mismatch')
      assert.equal(r.body.message, undefined, 'no message to sign')
      await close()
    }
    // an API that is not Mancer's, with no sign-in domain named, offers no sign-in at all
    const { client, close } = await httpClient({ ...configFor(tampered), signInDomain: null })
    assert.equal((await call(client, 'sign_in', { wallet: agent.address })).body.code, 'sign-in-unavailable')
    await close()
  } finally {
    await tampered.close()
    await elsewhere.close()
  }
})

test('a connection prints and serializes with no session in it', () => {
  const c = new Connection('c1')
  c.complete('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIweGEifQ.c2lnbmF0dXJl', { wallet: agent.address.toLowerCase() as `0x${string}`, account: null, expiresAt: Math.floor(Date.now() / 1000) + 3600 })
  assert.doesNotMatch(JSON.stringify(c), /eyJ/)
  assert.doesNotMatch(inspect(c), /eyJ/)
  assert.doesNotMatch(String(c), /eyJ/)
  assert.equal(c.sessionToken()?.startsWith('eyJ'), true)
  // a session within a minute of its end is not sent
  const late = new Connection('c2')
  late.complete('t.t.t', { wallet: agent.address.toLowerCase() as `0x${string}`, account: null, expiresAt: Math.floor(Date.now() / 1000) + 30 })
  assert.equal(late.sessionToken(), null)
  // a session that runs out leaves a sign-in begun beside it standing
  const both = new Connection('c3')
  both.complete('t.t.t', { wallet: agent.address.toLowerCase() as `0x${string}`, account: null, expiresAt: Math.floor(Date.now() / 1000) + 30 })
  both.begin({ wallet: agent.address.toLowerCase() as `0x${string}`, nonce: 'n', message: 'm' })
  assert.equal(both.signedIn(), null)
  assert.equal(both.pending()?.nonce, 'n')
})
