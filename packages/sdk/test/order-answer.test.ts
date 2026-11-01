import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { PublicClient } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { ORDER_TYPEHASH_V3 } from '../src/kit/orders'
import { Mancer, MancerCheckError, MancerError } from '../src/index'
import { TRUSTED, contractsAnswer, fakeChain, mockApi } from './helpers'

// An order the API took with a success is held to what its answer must name, the order's hash, before anything reads it:
// an answer of no shape is the SDK's refusal carrying the signed order (`placed`), which a caller counts as an order the
// API may hold. A body cut off after the headers is the request's own error, named by its label (2026-10-30, the MCP
// server's second reader, M-B).

const account = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d')
const session = `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: account.address.toLowerCase(), iat: 1, exp: 4_000_000_000 })).toString('base64url')}.x`
const chain = fakeChain({ ORDER_TYPEHASH: () => ORDER_TYPEHASH_V3, makerEpoch: () => `0x${'00'.repeat(32)}` }) as PublicClient
const limit = { tokenIn: TRUSTED.weth, tokenOut: TRUSTED.usdg, amountIn: 10n ** 16n, minOut: 30_000_000n, maxFeeBps: 12 }
const fee = () => ({ body: { feeBps: 12, baseFeeBps: 10, swapFeeBps: 2, tier: 'other' } })

test("an order's POST answered with a success and no order hash is refused, carrying the signed order", async () => {
  for (const body of [undefined, null, { hash: 7, existing: false }, ['0x'], { existing: true }]) {
    const posted: { nonce: string }[] = []
    const api = await mockApi({
      'GET /v1/contracts': () => ({ body: contractsAnswer() }),
      'GET /v1/order-fee': fee,
      'POST /v1/orders': (r) => {
        posted.push((r.body as { order: { nonce: string } }).order)
        return { status: 201, body }
      },
    })
    try {
      const m = new Mancer({ baseUrl: api.url, account, session, trusted: TRUSTED, publicClient: chain })
      await assert.rejects(m.placeLimit(limit, { setup: false }), (e) => {
        assert.ok(e instanceof MancerCheckError, `answer ${JSON.stringify(body)}: ${e}`)
        assert.match(e.reason, /names no order hash: it may rest/)
        const placed = (e as MancerCheckError & { placed?: { hash: string; order: { nonce: string } } }).placed
        assert.match(placed?.hash ?? '', /^0x[0-9a-f]{64}$/, 'the error carries the order the bot signed, by its hash')
        assert.equal(placed?.order.nonce, posted[0]?.nonce, 'and the order itself, as posted')
        return true
      })
      assert.equal(posted.length, 1)
    } finally {
      await api.close()
    }
  }
})

test("an order's POST whose answer is cut off after its headers is the POST's own error", async () => {
  const contracts = JSON.stringify(contractsAnswer())
  const server = createServer(async (req, res) => {
    for await (const _ of req) void _
    const path = new URL(req.url ?? '/', 'http://localhost').pathname
    if (path === '/v1/contracts') {
      res.writeHead(200, { 'content-type': 'application/json' })
      return res.end(contracts)
    }
    if (path === '/v1/order-fee') {
      res.writeHead(200, { 'content-type': 'application/json' })
      return res.end(JSON.stringify(fee().body))
    }
    if (req.method === 'POST' && path === '/v1/orders') {
      // the order is taken: the headers go out, then the connection drops inside the body
      res.writeHead(201, { 'content-type': 'application/json', 'content-length': '200' })
      res.write('{"hash":"0x')
      setTimeout(() => res.socket?.destroy(), 20)
      return
    }
    res.writeHead(404, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: 'not found', code: 'not-found', retryable: false }))
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  try {
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const m = new Mancer({ baseUrl: url, account, session, trusted: TRUSTED, publicClient: chain })
    await assert.rejects(m.placeLimit(limit, { setup: false }), (e) => {
      assert.ok(e instanceof MancerError, String(e))
      assert.equal(e.request, 'POST /v1/orders', "the error names the order's POST, so a caller counts the order as one the API may hold")
      assert.equal(e.status, 201)
      assert.equal(e.retryable, false, 'a POST is never said to be safe to send again')
      return true
    })
  } finally {
    server.closeAllConnections()
    await new Promise<void>((done) => server.close(() => done()))
  }
})
