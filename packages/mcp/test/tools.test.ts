import test, { after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { hashTypedData, serializeTransaction, type Address } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { orderTypedDataV3, orderV3ToSign } from '@blockhash/mancer-sdk'
import { _resetTokenMemoForTests } from '../src/values'
import { BOOK, KEY, ORDERS, ROUTER, SPENDER, USDG, VENUE_ROUTES, WETH, buildAnswer, call, configFor, httpClient, standIn, swapCalldata } from './helpers'

/**
 * Every domain's tools against the stand-in of the API: the market's reads, the swap and the send with their read-back,
 * the orders (typed data equal to mancer.xyz's own builder, the cancels with no sign-in), the Books, and the account's
 * tools with a key; and a refusal's hygiene (the API's envelope and nothing else, no stack, no secret, no URL).
 */

const api = await standIn(VENUE_ROUTES)
after(() => api.close())
afterEach(() => _resetTokenMemoForTests())

const TAKER = '0x00000000000000000000000000000000000000a1' as Address

test('the market: tokens, a token, a wallet, the chain, the contracts and the limits, each one route of the API', async () => {
  const { client, close } = await httpClient(configFor(api))
  try {
    const cases: Array<[string, Record<string, unknown>, string]> = [
      ['search_tokens', { query: 'usdg' }, 'GET /v1/tokens'],
      ['get_token', { token: 'ETH' }, `GET /v1/tokens/${WETH}`],
      ['get_prices', { tokens: ['ETH', USDG] }, 'GET /v1/prices'],
      ['discover_tokens', { sort: 'volume' }, 'GET /v1/tokens/discover'],
      ['get_token_trades', { token: USDG }, `GET /v1/tokens/${USDG}/swaps`],
      ['get_token_chart', { token: USDG, interval: '4h' }, `GET /v1/tokens/${USDG}/candles`],
      ['get_balances', { wallet: TAKER }, `GET /v1/wallets/${TAKER}/balances`],
      ['get_wallet_trades', { wallet: TAKER }, `GET /v1/wallets/${TAKER}/swaps`],
      ['get_nfts', { wallet: TAKER }, `GET /v1/wallets/${TAKER}/collectibles`],
      ['get_transaction', { hash: `0x${'cd'.repeat(32)}` }, `GET /v1/transactions/0x${'cd'.repeat(32)}`],
      ['get_contracts', {}, 'GET /v1/contracts'],
      ['get_limits', {}, 'GET /v1/limits'],
      ['list_books', {}, 'GET /v1/books'],
      ['get_book', { token: BOOK }, `GET /v1/books/${BOOK}`],
      ['get_profile', { id: '@alice' }, 'GET /v1/users/alice'],
      ['get_fills', { orderHash: `0x${'7'.repeat(64)}` }, 'GET /v1/fills'],
    ]
    for (const [name, args, route] of cases) {
      const before = api.seen.length
      await call(client, name, args)
      const asked = api.seen.slice(before).map((s) => `${s.method} ${s.path}`)
      assert.ok(asked.includes(route), `${name} asks ${route}: ${asked.join(', ')}`)
    }
    const chart = api.seen.find((s) => s.path.endsWith('/candles'))!
    assert.equal(chart.query.tf, '14400')
    // a wallet's read with none named is the signed-in wallet's, and with neither it says so
    assert.equal((await call(client, 'get_balances')).body.code, 'wallet-required')
  } finally {
    await close()
  }
})

test('get_quote answers decimals beside raw units; with no credential the API answers its estimate', async () => {
  const { client, close } = await httpClient(configFor(api))
  try {
    const r = await call(client, 'get_quote', { tokenIn: 'ETH', tokenOut: USDG, amount: '0.01' })
    assert.deepEqual(r.body.tokenIn, { token: 'ETH', symbol: 'ETH', amount: '0.01', raw: '10000000000000000' })
    assert.deepEqual(r.body.tokenOut, { token: USDG, symbol: 'USDG', amount: '22.45356', raw: '22453560' })
    assert.equal(r.body.estimate, true)
    const q = api.seen.filter((s) => s.path === '/v1/quote').at(-1)!
    assert.deepEqual([q.query.tokenIn, q.query.taker, q.headers.authorization], [WETH, undefined, undefined])
    // a symbol alone, or more places than the token has, is refused before the API is asked
    const before = api.seen.length
    assert.equal((await call(client, 'get_quote', { tokenIn: 'WETH', tokenOut: USDG, amount: '1' })).body.code, 'bad-token')
    assert.equal((await call(client, 'get_quote', { tokenIn: USDG, tokenOut: WETH, amount: '1.0000001' })).body.code, 'bad-amount')
    assert.equal((await call(client, 'get_quote', { tokenIn: 'ETH', tokenOut: WETH, amount: '1' })).body.code, 'same-token')
    assert.equal(api.seen.slice(before).filter((s) => s.path === '/v1/quote').length, 0)
  } finally {
    await close()
  }
})

test('build_swap with no credential answers the approval and the swap unsigned, the swap read back from its own calldata', async () => {
  const { client, close } = await httpClient(configFor(api))
  try {
    const r = await call(client, 'build_swap', { tokenIn: WETH, tokenOut: USDG, amount: '0.01', wallet: TAKER, slippageBps: 50, trustQuote: true })
    assert.equal(r.isError, false, r.text)
    const [approval, swap] = r.body.transactions
    assert.deepEqual(approval.does, { call: 'approve', token: WETH, symbol: 'WETH', spender: SPENDER, amount: '0.01', raw: '10000000000000000' })
    assert.equal(approval.chainId, 4663)
    assert.deepEqual([swap.kind, swap.to, swap.gas, swap.does.entry], ['swap', ROUTER, '400000', 'execute'])
    // the floor is the quote (22.45356) less the 50 bps asked
    assert.deepEqual(swap.does.receivesAtLeast, { token: USDG, symbol: 'USDG', amount: '22.341292', raw: '22341292' })
    assert.deepEqual(r.body.minOut, { token: USDG, symbol: 'USDG', amount: '22.341292', raw: '22341292' })
    assert.deepEqual(swap.does.venues, ['uniswap-v3'])
    assert.equal(swap.does.recipient, TAKER)
    assert.match(r.body.next, /in order/)
    const q = api.seen.filter((s) => s.path === '/v1/quote').at(-1)!
    assert.deepEqual([q.query.taker, q.query.steps, q.query.excludeAccountBound, q.headers.authorization], [TAKER, '1', '1', undefined])
    // native ether in: no approval, the router's call carries the value
    const native = await call(client, 'build_swap', { tokenIn: 'ETH', tokenOut: USDG, amount: '0.01', wallet: TAKER, trustQuote: true })
    assert.equal(native.isError, false, native.text)
    assert.equal(native.body.transactions.length, 1)
    assert.equal(native.body.transactions[0].value, '10000000000000000')
  } finally {
    await close()
  }
})

test('a build whose calldata does not read back as asked is refused build-mismatch, and nothing is answered to sign', async () => {
  const bad = await standIn({ 'GET /v1/quote': ({ query }) => ({ body: buildAnswer(query, { recipient: '0x00000000000000000000000000000000000000ee', venue: true }) }) })
  const floorless = await standIn({
    'GET /v1/quote': ({ query }) => {
      const b = buildAnswer(query, { venue: true })
      b.quote.minOut = '23000000' // the answer names a higher floor than the calldata carries
      return { body: b }
    },
  })
  try {
    for (const s of [bad, floorless]) {
      const { client, close } = await httpClient(configFor(s))
      const r = await call(client, 'build_swap', { tokenIn: WETH, tokenOut: USDG, amount: '0.01', wallet: TAKER, trustQuote: true })
      assert.equal(r.isError, true)
      assert.equal(r.body.code, 'build-mismatch')
      assert.equal(r.body.transactions, undefined)
      await close()
    }
  } finally {
    await bad.close()
    await floorless.close()
  }
})

test("an order's typed data is mancer.xyz's own and reads back as asked; with no sign-in the setup says what it did not count", async () => {
  const { client, close } = await httpClient(configFor(api))
  try {
    const r = await call(client, 'prepare_limit_order', { wallet: TAKER, tokenIn: WETH, tokenOut: USDG, amount: '0.5', minOut: '1200' })
    assert.equal(r.isError, false, r.text)
    assert.equal(r.body.contract, ORDERS)
    const o = r.body.orders[0]
    assert.deepEqual(o.reads.spendsPerFill, { token: WETH, symbol: 'WETH', amount: '0.5', raw: '500000000000000000' })
    assert.deepEqual(o.reads.receivesAtLeastPerFill, { token: USDG, symbol: 'USDG', amount: '1200', raw: '1200000000' })
    assert.equal(o.reads.maxFeeBps, 12)
    const site = orderTypedDataV3(orderV3ToSign({
      tokenIn: WETH, tokenOut: USDG, amountPerFill: 500000000000000000n, totalFills: 1, everySec: 0, startAt: 0, expiry: 0,
      minOutPerFill: 1_200_000_000n, triggerOutPerFill: 0n, maxOutPerFill: 0n, maxFeeBps: 12,
    }, { maker: TAKER, epoch: `0x${'00'.repeat(32)}`, nonce: o.order.nonce }), 4663, ORDERS)
    assert.equal(o.orderHash, hashTypedData(site as never))
    assert.equal(hashTypedData(o.typedData), o.orderHash, 'the JSON typed data, its integers as strings, signs the same digest')
    assert.ok(r.body.notes.some((n: string) => /counts none of the wallet's other open orders/.test(n)))
    // a stop's floor sits under its trigger, and the pair of an OCO shares one group
    assert.equal((await call(client, 'prepare_stop_order', { wallet: TAKER, tokenIn: WETH, tokenOut: USDG, amount: '1', trigger: '2000', minOut: '2100' })).body.code, 'bad-stop')
    const oco = await call(client, 'prepare_oco_order', { wallet: TAKER, tokenIn: WETH, tokenOut: USDG, amount: '1', takeProfitMinOut: '3000', stopTrigger: '2000', stopMinOut: '1900' })
    assert.equal(oco.body.orders.length, 2)
    assert.equal(oco.body.orders[0].order.ocoGroup, oco.body.orders[1].order.ocoGroup)
    assert.notEqual(oco.body.orders[0].order.ocoGroup, `0x${'00'.repeat(32)}`)
    // the signed order goes to the book with no credential: its signature is its authority
    const signer = privateKeyToAccount(generatePrivateKey())
    const signature = await signer.signTypedData(o.typedData)
    const sub = await call(client, 'submit_order', { order: o.order, signature, contract: ORDERS })
    assert.equal(sub.isError, false, sub.text)
    const posted = api.seen.filter((s) => s.path === '/v1/orders' && s.method === 'POST').at(-1)!
    assert.deepEqual([posted.headers.authorization, (posted.body as { signature: string }).signature], [undefined, signature])
  } finally {
    await close()
  }
})

test('the cancels with no sign-in: the message built here, the on-chain cancel naming its order, the cancel-all its own salt', async () => {
  const { client, close } = await httpClient(configFor(api))
  try {
    const hash = `0x${'7'.repeat(64)}`
    const msg = await call(client, 'prepare_cancel_orders', { hashes: [hash], wallet: TAKER })
    assert.equal(msg.isError, false, msg.text)
    assert.match(msg.body.message, /^mancer\.xyz wants to cancel an order\./)
    assert.match(msg.body.message, new RegExp(`Order: ${hash}`))
    assert.match(msg.body.message, new RegExp(`Contract: ${ORDERS}`))
    assert.equal((await call(client, 'submit_cancel_orders', { hashes: [hash], issuedAt: msg.body.issuedAt, signature: `0x${'11'.repeat(65)}` })).isError, false)
    // on chain with no sign-in, the order itself is named, and sent beside the wallet; the cancel must be of that order
    assert.equal((await call(client, 'build_cancel_order', { hash, wallet: TAKER })).body.code, 'order-required')
    const order = orderV3ToSign({
      tokenIn: WETH, tokenOut: USDG, amountPerFill: 10n ** 17n, totalFills: 1, everySec: 0, startAt: 0, expiry: 0,
      minOutPerFill: 1n, triggerOutPerFill: 0n, maxOutPerFill: 0n, maxFeeBps: 12,
    }, { maker: TAKER, epoch: `0x${'00'.repeat(32)}`, nonce: '1' })
    const orderHash = hashTypedData(orderTypedDataV3(order, 4663, ORDERS) as never)
    const wire = JSON.parse(JSON.stringify(order, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)))
    const onChain = await call(client, 'build_cancel_order', { hash: orderHash, wallet: TAKER, order: wire })
    assert.equal(onChain.isError, false, onChain.text)
    assert.deepEqual(api.seen.filter((s) => s.path.endsWith('/cancel-steps')).at(-1)!.body, { wallet: TAKER, order: wire })
    assert.deepEqual(onChain.body.transactions[0].does, { reads: `cancels order ${orderHash}` })
    // a cancel the API builds for another order than the hash named is refused
    const other = await call(client, 'build_cancel_order', { hash, wallet: TAKER, order: wire })
    assert.equal(other.body.code, 'build-mismatch')
    assert.equal((await call(client, 'build_cancel_all_orders', { wallet: TAKER, salt: `0x${'00'.repeat(32)}` })).body.code, 'bad-salt')
    const all = await call(client, 'build_cancel_all_orders', { wallet: TAKER, salt: `0x${'ab'.repeat(32)}` })
    assert.equal(all.body.transactions[0].to, ORDERS)
    // reading orders back needs the maker's signed-in wallet
    assert.equal((await call(client, 'list_orders')).body.code, 'sign-in-required')
  } finally {
    await close()
  }
})

test("a Book's act is built for the wallet named with no credential; Mancer's signed quotes and a Book's record need a sign-in", async () => {
  const { client, close } = await httpClient(configFor(api))
  try {
    const act = await call(client, 'build_book_act', { token: BOOK, action: 'arm', wallet: TAKER })
    assert.equal(act.isError, false, act.text)
    assert.deepEqual(api.seen.filter((s) => s.path === `/v1/books/${BOOK}/steps`).at(-1)!.body, { action: 'arm', wallet: TAKER })
    for (const [name, args] of [
      ['get_book_vault_quote', { token: BOOK, wallet: TAKER, purpose: 'trade', tokenIn: WETH, tokenOut: USDG }],
      ['build_book_settlement', { token: BOOK, wallet: TAKER }],
      ['create_book_draft', { factory: TAKER, name: 'A Book', symbol: 'BOOK', targets: [USDG] }],
      ['build_book_open', { draftId: '0'.repeat(32), wallet: TAKER, terms: { traders: [TAKER], durationSecs: 86_400 } }],
    ] as const) {
      assert.equal((await call(client, name, args as unknown as Record<string, unknown>)).body.code, 'sign-in-required', name)
    }
  } finally {
    await close()
  }
})

test("with an API key in the MCP request's header the account's tools are asked with it, and the API's word is the answer", async () => {
  const { client, close } = await httpClient(configFor(api), { authorization: `Bearer ${KEY}` })
  try {
    const r = await call(client, 'get_notifications')
    // a partner's key acts as no wallet: the API refuses it, and the refusal says how to sign in
    assert.equal(r.body.code, 'session-required')
    assert.match(r.body.hint, /sign_in/)
    assert.equal(api.seen.filter((s) => s.path === '/v1/me/notifications').at(-1)!.headers.authorization, `Bearer ${KEY}`)
    await call(client, 'get_quote', { tokenIn: WETH, tokenOut: USDG, amount: '1' })
    assert.equal(api.seen.filter((s) => s.path === '/v1/quote').at(-1)!.headers.authorization, `Bearer ${KEY}`)
  } finally {
    await close()
  }
  // a key from the server's own environment, as a local copy holds one
  const local = await httpClient(configFor(api, { MANCER_API_KEY: KEY }))
  try {
    await call(local.client, 'get_limits')
    assert.equal(api.seen.filter((s) => s.path === '/v1/limits').at(-1)!.headers.authorization, `Bearer ${KEY}`)
  } finally {
    await local.close()
  }
})

test('a signed transaction is sent only for Robinhood Chain, and its receipt read back', async () => {
  const { client, close } = await httpClient(configFor(api))
  try {
    const signer = privateKeyToAccount(generatePrivateKey())
    const other = await signer.signTransaction({ chainId: 1, to: TAKER, value: 1n, gas: 21_000n, maxFeePerGas: 1n, maxPriorityFeePerGas: 1n, nonce: 0, type: 'eip1559' })
    assert.equal((await call(client, 'send_signed_transaction', { signedTransaction: other })).body.code, 'wrong-chain')
    const ours = await signer.signTransaction({ chainId: 4663, to: TAKER, value: 1n, gas: 21_000n, maxFeePerGas: 1n, maxPriorityFeePerGas: 1n, nonce: 0, type: 'eip1559' })
    const sent = await call(client, 'send_signed_transaction', { signedTransaction: ours })
    assert.equal(sent.body.hash, `0x${'ab'.repeat(32)}`)
    assert.equal((api.seen.filter((s) => s.path === '/rpc').at(-1)!.body as { params: string[] }).params[0], ours)
    assert.equal((await call(client, 'send_signed_transaction', { signedTransaction: serializeTransaction({ chainId: 4663, to: TAKER, value: 1n, type: 'eip1559' }).slice(0, 10) })).body.code, 'bad-transaction')
    const receipt = await call(client, 'get_transaction_receipt', { hash: `0x${'ab'.repeat(32)}` })
    assert.deepEqual([receipt.body.status, receipt.body.block, receipt.body.gasUsed], ['success', '100', '21000'])
  } finally {
    await close()
  }
})

test("a refusal carries the API's envelope and nothing else of the answer; a tool's own fault carries no message", async () => {
  const log: string[] = []
  const leaky = await standIn({
    'GET /v1/quote': () => ({ status: 503, body: { error: 'quotes paused', code: 'quote-paused', retryable: true, stack: 'Error: at /srv/app.ts:12', secret: 'sk_live_x', upstream: 'https://rpc.example/key' }, headers: { 'retry-after': '2' } }),
    'GET /v1/tokens': () => ({ body: { tokens: [] } }),
  })
  const broken = await standIn({ 'GET /v1/quote': () => ({ body: { quote: { quotedAmountOut: 'not-a-number https://rpc.example/key', tx: { to: ROUTER, data: '0x' }, ready: { steps: [{ kind: 'swap', to: ROUTER, data: swapCalldata({ amountIn: 1n, minOut: 1n, recipient: TAKER }), value: '0' }] } } } }) })
  try {
    const a = await httpClient(configFor(leaky), {}, log)
    const paused = await call(a.client, 'get_quote', { tokenIn: WETH, tokenOut: USDG, amount: '0.01' })
    assert.deepEqual(Object.keys(paused.body).sort(), ['code', 'error', 'retryAfterSeconds', 'retryable', 'status', 'tool'])
    assert.deepEqual([paused.body.code, paused.body.retryable, paused.body.retryAfterSeconds], ['quote-paused', true, 2])
    assert.doesNotMatch(paused.text, /srv|sk_live|rpc\.example/)
    await a.close()
    const b = await httpClient(configFor(broken), {}, log)
    const r = await call(b.client, 'build_swap', { tokenIn: WETH, tokenOut: USDG, amount: '0.01', wallet: TAKER, trustQuote: true })
    assert.deepEqual(r.body, { error: 'internal error', code: 'internal-error', retryable: true, tool: 'build_swap' })
    assert.doesNotMatch(r.text, /rpc\.example|not-a-number|at \//)
    await b.close()
    assert.ok(log.length >= 1, 'the fault is logged')
    assert.ok(log.every((l) => !/rpc\.example|https?:\/\//.test(l)), `the log is scrubbed of URLs: ${log.join(' | ')}`)
    // an API that does not answer is named as such, never by its URL
    const gone = await httpClient({ ...configFor(leaky), apiUrl: 'http://127.0.0.1:1' })
    const unreachable = await call(gone.client, 'get_limits')
    assert.deepEqual([unreachable.body.code, unreachable.body.retryable], ['api-unreachable', true])
    assert.doesNotMatch(unreachable.text, /127\.0\.0\.1/)
    await gone.close()
  } finally {
    await leaky.close()
    await broken.close()
  }
})

test("this server's own bucket holds a caller's tool calls, and a key's are its own", async () => {
  const { client, close } = await httpClient(configFor(api))
  try {
    let limited: Awaited<ReturnType<typeof call>> | null = null
    for (let i = 0; i < 40 && !limited; i++) {
      const r = await call(client, 'get_limits')
      if (r.body.code === 'rate-limited') limited = r
    }
    assert.ok(limited, 'the bucket of 30 runs dry')
    assert.deepEqual([limited!.body.detail, limited!.body.retryable], [{ bucket: 'mcp' }, true])
    assert.ok(limited!.body.retryAfterSeconds >= 1)
  } finally {
    await close()
  }
  const keyed = await httpClient(configFor(api), { authorization: `Bearer ${KEY}` })
  try {
    for (let i = 0; i < 40; i++) assert.notEqual((await call(keyed.client, 'get_limits')).body.code, 'rate-limited', `keyed call ${i + 1}`)
  } finally {
    await keyed.close()
  }
})
