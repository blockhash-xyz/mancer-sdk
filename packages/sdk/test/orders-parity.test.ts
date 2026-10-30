import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { getAddress, hashTypedData, recoverTypedDataAddress, verifyMessage, type Address, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { ORDER_TYPEHASH_V3, cancelOrdersMessage, type MancerOrderV3 } from '../src/kit/orders'
// the site's own builder, the module its usePlaceOrder signs through
import { orderTypedDataV3, orderV3ToSign, type PlaceOrderParams } from '../src/kit/site/order-typed-data'
import { Mancer, MancerCheckError } from '../src/index'
import { TRUSTED, contractsAnswer, fakeChain, mockApi } from './helpers'

/**
 * The SDK signs what the site signs. From the fixtures the phone app's parity test reads (apps/mobile src/lib/orders/
 * fixtures/order-signing.json: the orders the site's forms make, worked out with exact integers), each order is placed
 * through the SDK and built beside it by the site's own module, and held equal: the typed data, the digest, the signature
 * from one key, and the body sent to `POST /v1/orders`.
 */

const FIXTURES = JSON.parse(readFileSync(new URL('./fixtures/order-signing.json', import.meta.url), 'utf8')) as {
  chainId: number
  contract: string
  maker: string
  signerKey: Hex
  epoch: Hex
  tokens: Record<string, { address: string; decimals: number; symbol: string }>
  limits: Array<{ name: string; form: { spend: string; buy: string; mode: string }; legs: Array<{ terms: RawTerms; nonce: string; ocoGroup: string | null }> }>
  recurring: Array<{ name: string; form: { spend: string; buy: string }; terms: RawTerms; nonce: string }>
}
type RawTerms = { amountPerFill: string; totalFills: number; everySec: number; startAt: number; expiry: number; minOutPerFill: string; triggerOutPerFill: string; maxOutPerFill: string; maxFeeBps: number }

const account = privateKeyToAccount(FIXTURES.signerKey)
const token = (name: string) => getAddress(FIXTURES.tokens[name]!.address)

function params(raw: RawTerms, spend: string, buy: string): PlaceOrderParams {
  return {
    tokenIn: token(spend), tokenOut: token(buy), amountPerFill: BigInt(raw.amountPerFill), totalFills: raw.totalFills, everySec: raw.everySec,
    startAt: raw.startAt, expiry: raw.expiry, minOutPerFill: BigInt(raw.minOutPerFill), triggerOutPerFill: BigInt(raw.triggerOutPerFill),
    maxOutPerFill: BigInt(raw.maxOutPerFill), maxFeeBps: raw.maxFeeBps,
  }
}

const lower = (v: unknown): unknown => {
  if (typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v)) return v.toLowerCase()
  if (Array.isArray(v)) return v.map(lower)
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, lower(x)]))
  return v
}

async function stand(feeBps = 1) {
  const submitted: Array<{ order: MancerOrderV3; signature: Hex; contract: string }> = []
  const cancels: unknown[] = []
  const api = await mockApi({
    'GET /v1/contracts': () => ({ body: contractsAnswer() }),
    'GET /v1/order-fee': (r) => ({ body: { tokenIn: r.query.get('tokenIn'), tokenOut: r.query.get('tokenOut'), baseFeeBps: feeBps, swapFeeBps: 0, feeBps, tier: 'other' } }),
    'POST /v1/orders': (r) => {
      submitted.push(r.body as never)
      return { status: 201, body: { hash: hashTypedData(orderTypedDataV3((r.body as { order: MancerOrderV3 }).order, 4663, TRUSTED.orders)), existing: false } }
    },
    'POST /v1/orders/cancellations': (r) => {
      cancels.push(r.body)
      return { body: { results: [] } }
    },
  })
  const chain = fakeChain({ ORDER_TYPEHASH: () => ORDER_TYPEHASH_V3, makerEpoch: () => FIXTURES.epoch })
  // a session the stand-in API never checks: the orders' routes are the subject here, not the sign-in
  const session = `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: account.address.toLowerCase(), iat: 1, exp: 4_000_000_000 })).toString('base64url')}.x`
  const m = new Mancer({ baseUrl: api.url, account, session, trusted: TRUSTED, publicClient: chain })
  return { api, m, submitted, cancels }
}

test('the fixtures sign for the orders contract this SDK pins, by the fixtures’ maker', () => {
  assert.equal(getAddress(FIXTURES.contract), TRUSTED.orders)
  assert.equal(account.address, getAddress(FIXTURES.maker))
  assert.equal(FIXTURES.chainId, 4663)
})

test('every limit, stop and pair of the fixtures: the SDK sends the site’s order, digest and signature', async () => {
  const { api, m, submitted } = await stand()
  try {
    let n = 0
    for (const c of FIXTURES.limits) {
      for (const leg of c.legs) {
        const p = params(leg.terms, c.form.spend, c.form.buy)
        const signer = { maker: account.address, epoch: FIXTURES.epoch, nonce: leg.nonce, ...(leg.ocoGroup ? { ocoGroup: leg.ocoGroup as Hex } : {}) }
        const site = orderV3ToSign(p, signer)
        const siteTyped = orderTypedDataV3(site, 4663, TRUSTED.orders)
        const siteSig = await account.signTypedData(siteTyped)
        const placed = await m.placeOrder(p, { setup: false, nonce: leg.nonce, ...(leg.ocoGroup ? { ocoGroup: leg.ocoGroup as Hex } : {}) })
        const body = submitted[n++]!
        assert.deepEqual(lower(body), lower({ order: site, signature: siteSig, contract: TRUSTED.orders }), `${c.name}: the body to POST /v1/orders`)
        assert.equal(placed.signature, siteSig, `${c.name}: the signature`)
        assert.equal(hashTypedData(orderTypedDataV3(placed.order, 4663, TRUSTED.orders)), hashTypedData(siteTyped), `${c.name}: the digest`)
      }
    }
    assert.equal(n, FIXTURES.limits.reduce((k, c) => k + c.legs.length, 0))
  } finally {
    await api.close()
  }
})

test('every recurring order of the fixtures: the same, its fill window the site’s', async () => {
  const { api, m, submitted } = await stand()
  try {
    for (const [i, c] of FIXTURES.recurring.entries()) {
      const p = params(c.terms, c.form.spend, c.form.buy)
      const site = orderV3ToSign(p, { maker: account.address, epoch: FIXTURES.epoch, nonce: c.nonce })
      const siteSig = await account.signTypedData(orderTypedDataV3(site, 4663, TRUSTED.orders))
      await m.placeOrder(p, { setup: false, nonce: c.nonce })
      assert.deepEqual(lower(submitted[i]), lower({ order: site, signature: siteSig, contract: TRUSTED.orders }), c.name)
      assert.ok(submitted[i]!.order.fillWindowSec > 0, `${c.name}: a schedule carries its window`)
    }
  } finally {
    await api.close()
  }
})

test('the SDK’s own limit, stop, pair and recurring helpers make the fixtures’ terms, signed as the site signs them', async () => {
  const { api, m, submitted } = await stand()
  try {
    const recovered = async (o: MancerOrderV3, sig: Hex) => recoverTypedDataAddress({ ...orderTypedDataV3(o, 4663, TRUSTED.orders), signature: sig })
    const terms = (o: MancerOrderV3) => ({ amountPerFill: o.amountPerFill, totalFills: o.totalFills, everySec: o.everySec, startAt: o.startAt, expiry: o.expiry, minOutPerFill: o.minOutPerFill, triggerOutPerFill: o.triggerOutPerFill, maxOutPerFill: o.maxOutPerFill, maxFeeBps: o.maxFeeBps })
    for (const c of FIXTURES.limits) {
      const before = submitted.length
      if (c.form.mode === 'limit') {
        const t = c.legs[0]!.terms
        await m.placeLimit({ tokenIn: token(c.form.spend), tokenOut: token(c.form.buy), amountIn: BigInt(t.amountPerFill), minOut: BigInt(t.minOutPerFill), expiry: t.expiry, maxFeeBps: t.maxFeeBps }, { setup: false })
      } else if (c.form.mode === 'stop') {
        const t = c.legs[0]!.terms
        await m.placeStop({ tokenIn: token(c.form.spend), tokenOut: token(c.form.buy), amountIn: BigInt(t.amountPerFill), trigger: BigInt(t.triggerOutPerFill), minOut: BigInt(t.minOutPerFill), expiry: t.expiry, maxFeeBps: t.maxFeeBps }, { setup: false })
      } else {
        const [tp, st] = c.legs.map((l) => l.terms) as [RawTerms, RawTerms]
        await m.placeOco({
          takeProfit: { tokenIn: token(c.form.spend), tokenOut: token(c.form.buy), amountIn: BigInt(tp.amountPerFill), minOut: BigInt(tp.minOutPerFill), expiry: tp.expiry, maxFeeBps: tp.maxFeeBps },
          stop: { tokenIn: token(c.form.spend), tokenOut: token(c.form.buy), amountIn: BigInt(st.amountPerFill), trigger: BigInt(st.triggerOutPerFill), minOut: BigInt(st.minOutPerFill), expiry: st.expiry, maxFeeBps: st.maxFeeBps },
        }, { setup: false })
        const [a, b] = submitted.slice(before)
        assert.equal(a!.order.ocoGroup, b!.order.ocoGroup, `${c.name}: one group`)
        assert.notEqual(a!.order.ocoGroup, `0x${'0'.repeat(64)}`)
      }
      const sent = submitted.slice(before)
      assert.equal(sent.length, c.legs.length, c.name)
      for (const [i, s] of sent.entries()) {
        assert.deepEqual(terms(s.order), c.legs[i]!.terms, `${c.name}: leg ${i}'s terms`)
        assert.equal(await recovered(s.order, s.signature), account.address, `${c.name}: leg ${i} signed by the maker over the site's typed data`)
      }
    }
    for (const c of FIXTURES.recurring) {
      const t = c.terms
      await m.placeRecurring({
        tokenIn: token(c.form.spend), tokenOut: token(c.form.buy), amountPerFill: BigInt(t.amountPerFill), fills: t.totalFills, everySec: t.everySec,
        startAt: t.startAt, expiry: t.expiry, minOutPerFill: BigInt(t.minOutPerFill), maxOutPerFill: BigInt(t.maxOutPerFill), maxFeeBps: t.maxFeeBps,
      }, { setup: false })
      const s = submitted.at(-1)!
      assert.deepEqual(terms(s.order), t, c.name)
      assert.equal(await recovered(s.order, s.signature), account.address)
    }
  } finally {
    await api.close()
  }
})

test('a fee under the pair’s schedule is refused before anything is signed', async () => {
  const { api, m, submitted } = await stand(30)
  try {
    const t = FIXTURES.limits[0]!.legs[0]!.terms
    await assert.rejects(m.placeOrder(params(t, 'WETH', 'USDG'), { setup: false }), (e) => e instanceof MancerCheckError && /order fee \(30\)/.test(e.reason))
    assert.equal(submitted.length, 0)
  } finally {
    await api.close()
  }
})

test('a cancel by signature signs the kit’s own cancel message for the pinned book', async () => {
  const { api, m, cancels } = await stand()
  try {
    const hash = `0x${'12'.repeat(32)}` as Hex
    await m.cancelOrders([hash])
    const body = cancels[0] as { hashes: string[]; issuedAt: number; signature: Hex }
    assert.deepEqual(body.hashes, [hash])
    const message = cancelOrdersMessage([hash], 4663, TRUSTED.orders, body.issuedAt)
    assert.equal(await verifyMessage({ address: account.address as Address, message, signature: body.signature }), true)
  } finally {
    await api.close()
  }
})
