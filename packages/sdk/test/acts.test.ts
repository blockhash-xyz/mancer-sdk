import test from 'node:test'
import assert from 'node:assert/strict'
import { encodeFunctionData, getAddress, keccak256, parseAbi, type Address, type Hex, type PublicClient, type WalletClient } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { BOOK_DEPLOYMENTS, type BookDeployment } from '../src/kit/books/deployments'
import { MANCER_INTEGRATOR_FEE_DEPLOYMENTS } from '../src/kit/addresses'
import { ORDER_TYPEHASH_V3 } from '../src/kit/orders'
import { bookCallData, openBookCall, proposeTradeCall, redeemCall } from '../src/kit/books/calls'
import { bookTokenAbi } from '../src/kit/books/abis'
import { bookTradeIntentFromQuote, parseBookQuote } from '../src/kit/books/typed-data'
import { Mancer, MancerCheckError, openBookParamsOf } from '../src/index'
import { NOW, SIM_OK, TRUSTED, approveData, codeAt, contractsAnswer, executeData, fakeChain, mockApi, venueLeg } from './helpers'

// The acts the second reader's findings reach through the client, end to end against a stand-in API and chain: a Book's
// act rebuilt from the bot's own arguments and its own node's reading of the Book; a vault quote's route read leg by
// leg and its floor held to the bot's rule; a draft's open held to the draft the bot made, and its bind kept on the API's
// own origin; an order setup's approval held to the allowance the bot's node reads; and a pair of orders that a retry
// never doubles.

const account = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d')
const session = `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: account.address.toLowerCase(), iat: 1, exp: 4_000_000_000 })).toString('base64url')}.x`
const ME = account.address
const ATTACKER = getAddress('0x' + '44'.repeat(20))
const BOOK = getAddress('0x' + 'aa'.repeat(20))
const VAULT = getAddress('0x' + 'bb'.repeat(20))
const OTHER_VAULT = getAddress('0x' + 'cc'.repeat(20))
const NFT = getAddress('0x' + 'dd'.repeat(20))
const K = BOOK_DEPLOYMENTS[0]!

/** The kit's deployment with every pinned code hash the stand-in chain's, which a test can match: what the bot's node
 * would read at a real deployment. */
const hashAt = (a: string) => keccak256(codeAt(a))
function standInDeployment(d: BookDeployment): BookDeployment {
  const pin = <T extends { address: Address; runtimeCodeHash: Hex }>(p: T): T => ({ ...p, runtimeCodeHash: hashAt(p.address) })
  return {
    ...d,
    factory: pin(d.factory), pad: pin(d.pad), settler: pin(d.settler), lpFees: pin(d.lpFees), locker: pin(d.locker), operatorNft: pin(d.operatorNft),
    ...(d.lockerV4 ? { lockerV4: pin(d.lockerV4) } : {}),
    adapters: { uniswap: pin(d.adapters.uniswap), ...(d.adapters.mancer ? { mancer: pin(d.adapters.mancer) } : {}) },
    bookTokenCodeHash: hashAt(BOOK), vaultCloneCodeHash: hashAt(VAULT),
  }
}
const D = standInDeployment(K)

function ready(steps: unknown[], over: Record<string, unknown> = {}) {
  return { chainId: 4663, wallet: ME.toLowerCase(), steps, simulation: SIM_OK, readAfter: null, ...over }
}
const step = (kind: string, to: Address, data: Hex, value = '0') => ({ kind, to: to.toLowerCase(), data, value, gas: '100000', why: '' })
const asStep = (kind: string, c: { to: Address; data: Hex; value: bigint }) => step(kind, c.to, c.data, c.value.toString())
const bookOf = (vault: Address = VAULT) => ({ token: BOOK.toLowerCase(), bookId: '7', factory: D.factory.address.toLowerCase(), vault: vault.toLowerCase(), phase: 'settled' })

function stand(routes: Parameters<typeof mockApi>[0], reads: Record<string, (args: readonly unknown[]) => unknown> = {}) {
  const sent: Array<{ to: string; data: string; value: bigint }> = []
  const wallet = {
    getChainId: async () => 4663,
    sendTransaction: async (tx: { to: string; data: string; value: bigint }) => {
      sent.push(tx)
      return (`0x${String(sent.length).padStart(64, '0')}`) as Hex
    },
  } as unknown as WalletClient
  const chain = {
    ...fakeChain({
      bookIdOfToken: ([t]) => (String(t).toLowerCase() === BOOK.toLowerCase() ? 7n : 0n),
      bookOf: () => [BOOK, VAULT, NFT],
      allowance: () => 0n,
      balanceOf: () => 25n,
      tradeNonce: () => 3n,
      ORDER_TYPEHASH: () => ORDER_TYPEHASH_V3,
      makerEpoch: () => `0x${'00'.repeat(32)}`,
      ...reads,
    }),
    waitForTransactionReceipt: async ({ hash }: { hash: Hex }) => ({ status: 'success', transactionHash: hash, logs: [] }),
  } as unknown as PublicClient
  return mockApi({ 'GET /v1/contracts': () => ({ body: contractsAnswer() }), ...routes }).then((api) => ({
    api, sent, m: new Mancer({ baseUrl: api.url, account, session, trusted: TRUSTED, bookDeployments: [D], publicClient: chain, walletClient: wallet }),
  }))
}

test("a Book's act is rebuilt from the bot's own arguments and node: the honest steps are sent, a stranger's are not", async () => {
  const redeem = bookCallData(redeemCall(D, 7n, 25n))
  let answer: unknown = { ...ready([step('approval', BOOK, approveData(D.settler.address, 25n)), asStep('redeem', redeem)]), action: 'redeem', book: bookOf() }
  const { api, m, sent } = await stand({ 'POST /v1/books/:token/steps': () => ({ body: answer }) })
  try {
    // 'all' is the balance the bot's own node reads (25), sent to the API resolved, and the approval is exact to it
    const r = await m.bookAct(BOOK, 'redeem', { amount: 'all' })
    assert.equal(sent.length, 2)
    assert.equal((api.seen.find((s) => s.path.endsWith('/steps'))!.body as { amount: string }).amount, '25')
    assert.equal(r.answer.book.vault, VAULT.toLowerCase())
    // the same act answered with the Book token sent to a stranger, a vault that is not the Book's, or a larger approval
    const transfer = encodeFunctionData({ abi: bookTokenAbi, functionName: 'transfer', args: [ATTACKER, 25n] })
    for (const hostile of [
      { ...ready([step('redeem', BOOK, transfer)]), action: 'redeem', book: bookOf() },
      { ...ready([step('approval', BOOK, approveData(D.settler.address, 25n)), asStep('redeem', redeem)]), action: 'redeem', book: bookOf(OTHER_VAULT) },
      { ...ready([step('approval', BOOK, approveData(D.settler.address, 1n << 127n)), asStep('redeem', redeem)]), action: 'redeem', book: bookOf() },
      { ...ready([step('approval', BOOK, approveData(D.settler.address, 25n)), asStep('redeem', bookCallData(redeemCall(D, 8n, 25n)))]), action: 'redeem', book: bookOf() },
    ]) {
      answer = hostile
      await assert.rejects(m.bookAct(BOOK, 'redeem', { amount: 25n }), (e) => e instanceof MancerCheckError)
    }
    assert.equal(sent.length, 2, 'nothing more was sent')
  } finally {
    await api.close()
  }
})

test("a Book is the one its factory names on the bot's node, and its contracts hold their reviewed code there", async () => {
  const { api, m } = await stand({ 'POST /v1/books/:token/steps': () => ({ body: {} }) }, { bookIdOfToken: () => 0n })
  try {
    await assert.rejects(m.bookSteps(BOOK, 'claim'), (e) => e instanceof MancerCheckError && /no factory this SDK pins/.test(e.reason))
    assert.equal(api.seen.filter((s) => s.path.endsWith('/steps')).length, 0)
  } finally {
    await api.close()
  }
  const wrong = await stand({}, {})
  try {
    // the kit's real code hashes: the stand-in chain's code is not the reviewed build
    const m = new Mancer({ baseUrl: wrong.api.url, account, session, trusted: TRUSTED, publicClient: (wrong.m as unknown as { publicClient: PublicClient }).publicClient })
    await assert.rejects(m.bookSteps(BOOK, 'claim'), (e) => e instanceof MancerCheckError && /reviewed build/.test(e.reason))
  } finally {
    await wrong.api.close()
  }
})

// a vault trade's route: the router's execute paying the vault, through Mancer's own routing
function vaultAnswer(over: { legs?: unknown[]; minOut?: string; vault?: Address } = {}) {
  const amountIn = 10n ** 18n
  const deadline = BigInt(NOW + 300)
  const route = executeData({
    tokenIn: TRUSTED.usdg, tokenOut: TRUSTED.weth, amountIn, minAmountOut: BigInt(over.minOut ?? '990'), recipient: VAULT, deadline, feeBps: 2,
    ...(over.legs ? { legs: over.legs } : {}),
  })
  return {
    purpose: 'trade', preview: false, adapter: D.adapters.mancer!.address.toLowerCase(), tokenIn: TRUSTED.usdg.toLowerCase(), tokenOut: TRUSTED.weth.toLowerCase(),
    amountIn: amountIn.toString(), minOut: over.minOut ?? '990', route, deadline: deadline.toString(), salt: '5', signature: '0x12', digest: '0x34',
    intent: null, plan: null, simulation: { amountOut: '1000', proposeGas: null, executeGas: null, block: 1 }, vault: (over.vault ?? VAULT).toLowerCase(),
  }
}

test("a vault quote's route is read leg by leg, and its floor is held to the bot's rule; its proposal is the kit's own call", async () => {
  let answer: unknown = vaultAnswer()
  let steps: unknown = null
  const { api, m, sent } = await stand({
    'POST /v1/books/:token/vault-quote': () => ({ body: answer }),
    'POST /v1/books/:token/steps': () => ({ body: steps }),
  })
  const body = { tokenIn: TRUSTED.usdg, tokenOut: TRUSTED.weth, amountIn: (10n ** 18n).toString() }
  try {
    await assert.rejects(m.vaultQuote(BOOK, { purpose: 'trade', ...body }), /name the floor/)
    assert.equal((await m.vaultQuote(BOOK, { purpose: 'trade', ...body }, { minOut: 990n })).minOut, '990')
    await assert.rejects(m.vaultQuote(BOOK, { purpose: 'trade', ...body }, { minOut: 991n }), /under the 991 you named/)
    await assert.rejects(m.vaultQuote(BOOK, { purpose: 'trade', ...body }, { reference: async () => 1_100n, maxSlippageBps: 100 }), /under the 1089 you named/)
    const pay = parseAbi(['function pay(address token, address recipient, uint16 bps, bool native) returns (uint256)'])
    answer = vaultAnswer({ legs: [venueLeg(), { target: getAddress(MANCER_INTEGRATOR_FEE_DEPLOYMENTS[4663]!), payload: encodeFunctionData({ abi: pay, functionName: 'pay', args: [TRUSTED.weth, ATTACKER, 9_999, false] }), tokenIn: TRUSTED.weth, tokenOut: TRUSTED.weth, amountIn: 0n, fund: 0 }] })
    await assert.rejects(m.vaultQuote(BOOK, { purpose: 'trade', ...body }, { minOut: 990n }), /integrator fee nobody asked for/)
    answer = vaultAnswer({ legs: [venueLeg({ recipient: ATTACKER })] })
    await assert.rejects(m.vaultQuote(BOOK, { purpose: 'trade', ...body }, { minOut: 990n }), /neither the router nor the caller/)
    answer = vaultAnswer({ vault: OTHER_VAULT })
    await assert.rejects(m.vaultQuote(BOOK, { purpose: 'trade', ...body }, { minOut: 990n }), /another vault/)
    // the proposal: the kit's proposeTrade on the quote, at the vault's nonce as the bot's node reads it (3)
    answer = vaultAnswer()
    const q = parseBookQuote(vaultAnswer())
    steps = { ...ready([asStep('proposeTrade', bookCallData(proposeTradeCall(D, VAULT, bookTradeIntentFromQuote(q, 3n))))]), action: 'proposeTrade', book: bookOf() }
    await m.proposeVaultTrade(BOOK, body, { minOut: 990n })
    assert.equal(sent.length, 1)
    steps = { ...ready([asStep('proposeTrade', bookCallData(proposeTradeCall(D, VAULT, bookTradeIntentFromQuote(q, 4n))))]), action: 'proposeTrade', book: bookOf() }
    await assert.rejects(m.proposeVaultTrade(BOOK, body, { minOut: 990n }), /not the act's own call/)
    assert.equal(sent.length, 1)
  } finally {
    await api.close()
  }
})

const terms = { traders: [ME], durationSecs: 604_800 }
const openOf = (traders: Address[], name = 'Mine', symbol = 'MINE') => bookCallData(openBookCall(D, openBookParamsOf({ ...terms, traders }, { name, symbol })))

test("a draft's open is held to the draft the bot saved: its name, ticker, factory and traders, and its bind on the API's own path", async () => {
  const id = 'e'.repeat(32)
  let open = openOf([ME])
  let bind = { method: 'PATCH', path: `/v1/books/drafts/${id}` }
  const { api, m, sent } = await stand({
    'POST /v1/books/drafts': () => ({ status: 201, body: { draft: { id } } }),
    'POST /v1/books/drafts/:id/steps': () => ({ body: { ...ready([asStep('open', open)]), draft: { id, factory: D.factory.address.toLowerCase(), name: 'Mine', symbol: 'MINE' }, bind } }),
    'PATCH /v1/books/drafts/:id': () => ({ body: { draft: { id, state: 'sent' } } }),
  })
  try {
    await m.createBookDraft({ factory: D.factory.address, name: 'Mine', symbol: 'MINE', targets: [] } as never)
    // the API names the attacker as the Book's trader: refused, nothing signed
    open = openOf([ATTACKER])
    await assert.rejects(m.openBookFromDraft(id, terms as never), (e) => e instanceof MancerCheckError && /not the act's own call/.test(e.reason))
    // another ticker in the calldata than the draft's
    open = openOf([ME], 'Mine', 'MIN3')
    await assert.rejects(m.openBookFromDraft(id, terms as never), /not the act's own call/)
    // a bind path the answer names elsewhere, by an absolute URL, or by another draft's path
    open = openOf([ME])
    for (const path of ['https://evil.example/steal', `//evil.example/v1/books/drafts/${id}`, `/v1/books/drafts/${'f'.repeat(32)}`]) {
      bind = { method: 'PATCH', path }
      await assert.rejects(m.openBookFromDraft(id, terms as never), /bind is not this draft's own path/)
    }
    assert.equal(sent.length, 0)
    bind = { method: 'PATCH', path: `/v1/books/drafts/${id}` }
    const r = await m.openBookFromDraft(id, terms as never)
    assert.equal(sent.length, 1)
    assert.equal((r.draft as { draft: { state: string } } | null)?.draft.state, 'sent')
    // a draft this client did not save names its own name and ticker
    await assert.rejects(m.openBookFromDraft('a'.repeat(32), terms as never), /name the draft's name and symbol/)
  } finally {
    await api.close()
  }
})

test("the client's requests go to the API's own origin alone, whatever path an answer names", async () => {
  const { api, m } = await stand({})
  try {
    for (const path of ['https://evil.example/x', '//evil.example/x', '/\\evil.example/x', 'v1/limits']) {
      await assert.rejects(m.request('GET', path), (e) => e instanceof MancerCheckError && e.check === 'request')
    }
    assert.equal(api.seen.length, 0)
  } finally {
    await api.close()
  }
})

test("an order's setup approval is held to the allowance the bot's own node reads plus the order's pull", async () => {
  let allowance = 0n
  const { api, m } = await stand({
    'GET /v1/orders/setup': () => ({ body: { ready: ready([step('approval', TRUSTED.usdg, approveData(TRUSTED.orders, 3_000n))]) } }),
  }, { allowance: () => allowance })
  try {
    await assert.rejects(m.orderSetup({ tokenIn: TRUSTED.usdg, tokenOut: TRUSTED.weth, amountPerFill: 1_000n, totalFills: 2 }), /allowance your node reads/)
    allowance = 1_000n
    assert.ok(await m.orderSetup({ tokenIn: TRUSTED.usdg, tokenOut: TRUSTED.weth, amountPerFill: 1_000n, totalFills: 2 }))
  } finally {
    await api.close()
  }
})

test('a one-cancels-the-other pair asked again after its stop failed places the stop alone, in the same group', async () => {
  const posted: Array<{ ocoGroup: string; triggerOutPerFill: string }> = []
  let failStop = true
  const { api, m } = await stand({
    'GET /v1/order-fee': () => ({ body: { feeBps: 15, baseFeeBps: 15, swapFeeBps: 0, tier: 'other' } }),
    'POST /v1/orders': async (r) => {
      const { order } = r.body as { order: { ocoGroup: string; triggerOutPerFill: string } }
      posted.push(order)
      if (order.triggerOutPerFill !== '0' && failStop) {
        failStop = false
        return { status: 503, body: { error: 'the order book did not answer', code: 'store-unavailable', retryable: true, retryAfterSeconds: 0 } }
      }
      const { hashTypedData } = await import('viem')
      const { orderTypedDataV3 } = await import('../src/kit/site/order-typed-data')
      return { status: 201, body: { hash: hashTypedData(orderTypedDataV3(order as never, 4663, TRUSTED.orders) as never), existing: false } }
    },
  })
  const pair = {
    takeProfit: { tokenIn: TRUSTED.weth, tokenOut: TRUSTED.usdg, amountIn: 10n ** 16n, minOut: 40_000_000n },
    stop: { tokenIn: TRUSTED.weth, tokenOut: TRUSTED.usdg, amountIn: 10n ** 16n, trigger: 20_000_000n, minOut: 19_000_000n },
  }
  try {
    const first = await m.placeOco(pair, { setup: false }).catch((e: unknown) => e as Error & { partial?: unknown })
    assert.ok(first instanceof Error && first.partial, 'the take-profit rests alone and the error carries it')
    const r = await m.placeOco(pair, { setup: false })
    assert.equal(posted.length, 3, 'the take-profit once, the stop twice (the same signed stop)')
    assert.equal(posted[1]!.ocoGroup, posted[0]!.ocoGroup)
    assert.equal(posted[2]!.ocoGroup, posted[0]!.ocoGroup)
    assert.deepEqual(posted[2], posted[1])
    assert.equal(r.stop.order.ocoGroup, posted[0]!.ocoGroup)
  } finally {
    await api.close()
  }
})

test("an order's fee is the API's word only under the most the published schedule charges any pair", async () => {
  let fee = 500
  const { api, m } = await stand({
    'GET /v1/order-fee': () => ({ body: { feeBps: fee, baseFeeBps: 10, swapFeeBps: fee - 10, tier: 'other' } }),
    'POST /v1/orders': async (r) => {
      const { order } = r.body as { order: never }
      const { hashTypedData } = await import('viem')
      const { orderTypedDataV3 } = await import('../src/kit/site/order-typed-data')
      return { status: 201, body: { hash: hashTypedData(orderTypedDataV3(order, 4663, TRUSTED.orders) as never), existing: false } }
    },
  })
  const limit = { tokenIn: TRUSTED.weth, tokenOut: TRUSTED.usdg, amountIn: 10n ** 16n, minOut: 30_000_000n }
  try {
    await assert.rejects(m.placeLimit(limit, { setup: false }), (e) => e instanceof MancerCheckError && /over the 60 the published schedule charges any pair/.test(e.reason))
    // named by the bot, it is the bot's own word
    assert.equal((await m.placeLimit({ ...limit, maxFeeBps: 500 }, { setup: false })).order.maxFeeBps, 500)
    fee = 12
    assert.equal((await m.placeLimit({ ...limit, minOut: 30_000_001n }, { setup: false })).order.maxFeeBps, 12)
  } finally {
    await api.close()
  }
})
