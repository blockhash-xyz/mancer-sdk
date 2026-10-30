import test from 'node:test'
import assert from 'node:assert/strict'
import { getAddress, verifyMessage, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { Mancer, MancerCheckError, MancerError, readRateLimit, sessionClaims, signInMessageMismatch, withRetry } from '../src/index'
import { loginMessage } from './fixtures/sign-in'
import { TRUSTED, contractsAnswer, fakeChain, mockApi } from './helpers'

// The client's own: the wallet sign-in and its message check, the session kept and signed in again before it ends, an
// API key carried as the same bearer, the error envelope as a typed value, the retry helper, and the rate-limit headers.

const KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const
const account = privateKeyToAccount(KEY)
// loginMessage is the API's own sign-in message, which the SDK's check must accept line for line (api-parity.test.ts
// holds the fixture equal to the API's builder)

function jwt(sub: string, iat: number, exp: number): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: sub.toLowerCase(), iat, exp })}.c2lnbmF0dXJl`
}

function signInRoutes(state: { signIns: number; message?: (nonce: string) => string; exp?: () => number }) {
  // each nonce's message is kept as issued and the signature is verified against it, as the API does from its nonce row
  const issued = new Map<string, string>()
  let n = 0
  return {
    'GET /auth/nonce': (r: { query: URLSearchParams }) => {
      const nonce = (++n).toString(16).padStart(32, '0')
      const message = state.message ? state.message(nonce) : loginMessage(r.query.get('address')!, nonce, Math.floor(Date.now() / 1000))
      issued.set(nonce, message)
      return { body: { nonce, message } }
    },
    'POST /auth/verify': async (r: { body: unknown }) => {
      const b = r.body as { address: string; signature: Hex; nonce: string }
      const message = issued.get(b.nonce)
      if (!message) return { status: 401, body: { error: 'nonce unknown', code: 'nonce-invalid', retryable: false } }
      const ok = await verifyMessage({ address: getAddress(b.address), message, signature: b.signature })
      if (!ok) return { status: 401, body: { error: 'signature does not match the address', code: 'signature-mismatch', retryable: false } }
      state.signIns += 1
      const now = Math.floor(Date.now() / 1000)
      return { body: { token: jwt(b.address, now, state.exp ? state.exp() : now + 7 * 86_400), created: state.signIns === 1, account: b.address.toLowerCase() } }
    },
  }
}

test("the API's own sign-in message passes the check, and every other line is refused", () => {
  const nonce = 'cd'.repeat(16)
  const now = Math.floor(Date.now() / 1000)
  const good = loginMessage(account.address, nonce, now)
  assert.equal(signInMessageMismatch(good, { address: account.address, nonce }), null)
  const other = privateKeyToAccount('0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba')
  assert.match(signInMessageMismatch(loginMessage(other.address, nonce, now), { address: account.address, nonce })!, /address/)
  assert.match(signInMessageMismatch(good.replace('mancer.xyz wants', 'evil.example wants'), { address: account.address, nonce })!, /domain/)
  assert.match(signInMessageMismatch(good.replace('Chain ID: 4663', 'Chain ID: 1'), { address: account.address, nonce })!, /chain id/)
  assert.match(signInMessageMismatch(good, { address: account.address, nonce: 'ef'.repeat(16) })!, /nonce/)
  assert.match(signInMessageMismatch(loginMessage(account.address, nonce, now - 3_600), { address: account.address, nonce })!, /Issued At/)
  assert.match(signInMessageMismatch(`${good}\nResources: - https://evil.example`, { address: account.address, nonce })!, /ten lines/)
  assert.match(signInMessageMismatch(good, { address: account.address, nonce, domain: 'app.example' })!, /domain/)
})

test('signs in with the wallet, carries the session, and reads its claims', async () => {
  const state = { signIns: 0 }
  const api = await mockApi({ ...signInRoutes(state), 'GET /auth/me': (r) => ({ body: { address: account.address, account: account.address, auth: r.headers.authorization } }) })
  try {
    const m = new Mancer({ baseUrl: api.url, account, signInDomain: 'mancer.xyz', trusted: TRUSTED, publicClient: fakeChain() })
    const me = (await m.me()) as unknown as { auth: string }
    assert.equal(state.signIns, 1, 'a route that needs a credential signs in first')
    assert.equal(me.auth, `Bearer ${m.session!.token}`)
    assert.equal(m.session!.wallet, account.address)
    assert.equal(sessionClaims(m.session!.token)!.wallet, account.address)
    await m.me()
    assert.equal(state.signIns, 1, 'a session with days left is kept')
    const nonceAsk = api.seen.find((s) => s.path === '/auth/nonce')!
    assert.equal(nonceAsk.headers.origin, undefined, 'a bot sends no Origin, so its message names mancer.xyz')
  } finally {
    await api.close()
  }
})

test('signs in again before the session ends, and never signs a message that is not its own sign-in', async () => {
  const state = { signIns: 0, exp: () => Math.floor(Date.now() / 1000) + 600 }
  const api = await mockApi({ ...signInRoutes(state), 'GET /auth/me': () => ({ body: { address: account.address, account: account.address } }) })
  try {
    const m = new Mancer({ baseUrl: api.url, account, signInDomain: 'mancer.xyz', trusted: TRUSTED, publicClient: fakeChain(), signInMarginSeconds: 3_600 })
    await m.me()
    await m.me()
    assert.equal(state.signIns, 2, 'a session ten minutes from its end is signed in again before the next request')
  } finally {
    await api.close()
  }
  const hostile = { signIns: 0, message: (nonce: string) => loginMessage(account.address, nonce, Math.floor(Date.now() / 1000)).replace('mancer.xyz wants', 'mancer.xyz.evil wants') }
  const evil = await mockApi(signInRoutes(hostile))
  try {
    const m = new Mancer({ baseUrl: evil.url, account, signInDomain: 'mancer.xyz', trusted: TRUSTED, publicClient: fakeChain() })
    await assert.rejects(m.signIn(), (e) => e instanceof MancerCheckError && /domain/.test(e.reason))
    assert.equal(evil.seen.filter((s) => s.path === '/auth/verify').length, 0, 'nothing was signed or sent')
  } finally {
    await evil.close()
  }
})

test('an API key is the bearer of every request, and no sign-in runs', async () => {
  const api = await mockApi({ 'GET /v1/limits': (r) => ({ body: { caller: { kind: 'key' }, auth: r.headers.authorization } }) })
  try {
    const m = new Mancer({ baseUrl: api.url, apiKey: 'mancer_' + '0'.repeat(48), account, trusted: TRUSTED, publicClient: fakeChain() })
    const limits = await m.limits() as unknown as { auth: string }
    assert.equal(limits.auth, `Bearer mancer_${'0'.repeat(48)}`)
    assert.equal(api.seen.some((s) => s.path.startsWith('/auth/')), false)
  } finally {
    await api.close()
  }
})

test('an error envelope is a MancerError with its code, retryable, wait, request id and rate bucket', async () => {
  let calls = 0
  const api = await mockApi({
    'GET /v1/limits': (): { status?: number; headers?: Record<string, string>; body?: unknown } => {
      calls += 1
      if (calls === 1) return { status: 429, headers: { 'retry-after': '1', 'ratelimit-policy': '"session";q=120;w=4', ratelimit: '"session";r=0;t=1' }, body: { error: 'rate limited', code: 'rate-limited', retryable: true, retryAfterSeconds: 1, bucket: 'session' } }
      return { headers: { 'ratelimit-policy': '"session";q=120;w=4', ratelimit: '"session";r=118;t=1' }, body: { caller: { kind: 'anonymous' } } }
    },
    'GET /v1/order-fee': () => ({ status: 400, body: { error: 'tokenIn is an address', code: 'bad-query', retryable: false } }),
  })
  try {
    const m = new Mancer({ baseUrl: api.url, trusted: TRUSTED, publicClient: fakeChain() })
    const e = await m.limits().then(() => null, (x) => x)
    assert.ok(e instanceof MancerError)
    assert.equal(e.status, 429)
    assert.equal(e.code, 'rate-limited')
    assert.equal(e.retryable, true)
    assert.equal(e.retryAfterSeconds, 1)
    assert.equal(e.requestId, 'req-1')
    assert.deepEqual(e.rateLimit, { bucket: 'session', burst: 120, windowSeconds: 4, remaining: 0, resetSeconds: 1 })
    const waits: number[] = []
    const ok = await withRetry(() => m.limits(), { sleep: async (ms) => { waits.push(ms) } })
    assert.equal((ok.caller as { kind: string }).kind, 'anonymous')
    assert.deepEqual(waits, [], 'the second call answered')
    assert.equal(m.lastRateLimit?.remaining, 118)
    const bad = await m.orderFee('0x1' as never, '0x2' as never).then(() => null, (x) => x)
    assert.ok(bad instanceof MancerError && bad.code === 'bad-query' && !bad.retryable)
  } finally {
    await api.close()
  }
})

test('withRetry waits what the answer names, retries the retryable alone, and stops at its tries', async () => {
  const waits: number[] = []
  const sleep = async (ms: number) => { waits.push(ms) }
  const busy = new MancerError({ status: 503, code: 'unavailable', message: 'x', retryable: true, retryAfterSeconds: 2, request: 'GET /x' })
  let n = 0
  const value = await withRetry(async () => {
    n += 1
    if (n < 3) throw busy
    return 'done'
  }, { sleep })
  assert.equal(value, 'done')
  assert.deepEqual(waits, [2_000, 2_000])
  const refusal = new MancerError({ status: 409, code: 'quote-invalid', message: 'x', retryable: false, request: 'POST /x' })
  let m = 0
  await assert.rejects(withRetry(async () => { m += 1; throw refusal }, { sleep }), (e) => e === refusal)
  assert.equal(m, 1, 'a refusal is never sent twice')
  let k = 0
  await assert.rejects(withRetry(async () => { k += 1; throw busy }, { sleep, tries: 2 }))
  assert.equal(k, 2)
  const long = new MancerError({ status: 429, code: 'rate-limited', message: 'x', retryable: true, retryAfterSeconds: 120, request: 'GET /x' })
  await assert.rejects(withRetry(async () => { throw long }, { sleep, maxWaitSeconds: 30 }), (e) => e === long)
  // with no wait named, the base wait doubles
  const plain = new MancerError({ status: 503, code: 'unavailable', message: 'x', retryable: true, request: 'GET /x' })
  waits.length = 0
  await assert.rejects(withRetry(async () => { throw plain }, { sleep, tries: 3, baseWaitSeconds: 1 }))
  assert.deepEqual(waits, [1_000, 2_000])
})

test('an answer that is no envelope, or no answer at all, is a MancerError of the SDK\'s own code', async () => {
  const api = await mockApi({ 'GET /v1/limits': () => ({ status: 502, headers: { 'content-type': 'text/html' }, body: undefined }) })
  try {
    const m = new Mancer({ baseUrl: api.url, trusted: TRUSTED, publicClient: fakeChain() })
    const e = await m.limits().then(() => null, (x) => x)
    assert.ok(e instanceof MancerError && e.code === 'not-json' && e.retryable, 'a gateway error on a read may be sent again')
  } finally {
    await api.close()
  }
  const gone = new Mancer({ baseUrl: 'http://127.0.0.1:9', trusted: TRUSTED, publicClient: fakeChain() })
  const e = await gone.limits().then(() => null, (x) => x)
  assert.ok(e instanceof MancerError && e.code === 'network-error' && e.status === 0 && e.retryable)
})

test('the RateLimit headers read as the bucket nearest its end', () => {
  const h = new Headers({ 'ratelimit-policy': '"key";q=600;w=60', ratelimit: '"key";r=12;t=3' })
  assert.deepEqual(readRateLimit(h), { bucket: 'key', burst: 600, windowSeconds: 60, remaining: 12, resetSeconds: 3 })
  assert.equal(readRateLimit(new Headers()), null)
})

test('a Book draft is sent with an Idempotency-Key of its own, and a replay is told', async () => {
  const keys: string[] = []
  const api = await mockApi({
    'GET /auth/nonce': (r) => ({ body: { nonce: 'ab'.repeat(16), message: loginMessage(r.query.get('address')!, 'ab'.repeat(16), Math.floor(Date.now() / 1000)) } }),
    'POST /auth/verify': (r) => ({ body: { token: jwt((r.body as { address: string }).address, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000) + 86_400 * 7), created: false, account: account.address } }),
    'POST /v1/books/drafts': (r) => {
      keys.push(String(r.headers['idempotency-key']))
      const headers: Record<string, string> = keys.length > 1 ? { 'idempotent-replayed': 'true' } : {}
      return { status: 201, headers, body: { draft: { id: 'f'.repeat(32) } } }
    },
  })
  try {
    const m = new Mancer({ baseUrl: api.url, account, signInDomain: 'mancer.xyz', trusted: TRUSTED, publicClient: fakeChain() })
    await m.createBookDraft({ factory: TRUSTED.router, name: 'Test', symbol: 'TST', targets: [] })
    await m.createBookDraft({ factory: TRUSTED.router, name: 'Test', symbol: 'TST', targets: [] }, 'my-key-1')
    assert.match(keys[0]!, /^sdk-[0-9a-f]{32}$/)
    assert.equal(keys[1], 'my-key-1')
    const answer = await m.request('POST', '/v1/books/drafts', { body: {}, idempotencyKey: 'again', auth: 'required' })
    assert.equal(answer.replayed, true)
  } finally {
    await api.close()
  }
})

test('the contracts are trusted only where the API, the kit and the caller\'s own node agree', async () => {
  const api = await mockApi({ 'GET /v1/contracts': () => ({ body: contractsAnswer() }) })
  try {
    const m = new Mancer({ baseUrl: api.url, trusted: TRUSTED, publicClient: fakeChain() })
    const t = await m.trustedContracts()
    assert.equal(t.router, TRUSTED.router)
    // the node shows other code at the router than the hash the API names
    const lied = new Mancer({ baseUrl: api.url, trusted: TRUSTED, publicClient: fakeChain({}, { [TRUSTED.router.toLowerCase()]: '0x60ff' }) })
    await assert.rejects(lied.trustedContracts(), (e) => e instanceof MancerCheckError && /differs from the code hash/.test(e.reason))
  } finally {
    await api.close()
  }
  const hostile = contractsAnswer()
  hostile.router.address = getAddress('0x' + '99'.repeat(20))
  const evil = await mockApi({ 'GET /v1/contracts': () => ({ body: hostile }) })
  try {
    const m = new Mancer({ baseUrl: evil.url, trusted: TRUSTED, publicClient: fakeChain() })
    await assert.rejects(m.trustedContracts(), (e) => e instanceof MancerCheckError && /another router/.test(e.reason))
  } finally {
    await evil.close()
  }
})
