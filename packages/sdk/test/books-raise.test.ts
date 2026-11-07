import test from 'node:test'
import assert from 'node:assert/strict'
import { encodeFunctionResult, getAddress, keccak256, type Address, type Hex, type PublicClient, type WalletClient } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { BOOK_ABIS } from '../src/kit/books/abis'
import { BOOK_DEPLOYMENTS, BOOK_SHARED, type BookDeployment } from '../src/kit/books/deployments'
import { ORDER_TYPEHASH_V3 } from '../src/kit/orders'
import { bookCallData, buyCall, buyEthCall, liquidateCall, openBookCall, sellCall, syncTrackedCall } from '../src/kit/books/calls'
import { parseBookQuote } from '../src/kit/books/typed-data'
import { Mancer, MancerCheckError, openBookParamsOf } from '../src/index'
import { NOW, SIM_OK, TRUSTED, approveData, codeAt, contractsAnswer, executeData, fakeChain, mockApi } from './helpers'

// A raise trade on a Book's curve, a settlement and a draft's open as checked steps, end to end against a stand-in API
// and chain: each step rebuilt with the kit's builders from the Book the bot's own node reads, its floor held to the
// bot's rule, and the curve's own answer read by a simulation on the bot's node.

const account = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d')
const session = `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: account.address.toLowerCase(), iat: 1, exp: 4_000_000_000 })).toString('base64url')}.x`
const ME = account.address
const ATTACKER = getAddress('0x' + '44'.repeat(20))
const BOOK = getAddress('0x' + 'aa'.repeat(20))
const VAULT = getAddress('0x' + 'bb'.repeat(20))
const NFT = getAddress('0x' + 'dd'.repeat(20))
const LISTED = getAddress('0x' + 'ee'.repeat(20))
const K = BOOK_DEPLOYMENTS[0]!
const WETH = getAddress(BOOK_SHARED.weth)

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
// the stand-in opens new Books whichever stack the kit's launch factory names: the client trusts it alone
const D: BookDeployment = { ...standInDeployment(K), opensNewBooks: true }

const ready = (steps: unknown[], over: Record<string, unknown> = {}) => ({ chainId: 4663, wallet: ME.toLowerCase(), steps, simulation: SIM_OK, readAfter: null, ...over })
const asStep = (kind: string, c: { to: Address; data: Hex; value: bigint }) => ({ kind, to: c.to.toLowerCase(), data: c.data, value: c.value.toString(), gas: '100000', why: '' })
const approvalStep = (token: Address, spender: Address, amount: bigint) => ({ kind: 'approval', to: token.toLowerCase(), data: approveData(spender, amount), value: '0', gas: '100000', why: '' })

function stand(routes: Parameters<typeof mockApi>[0], reads: Record<string, (args: readonly unknown[]) => unknown> = {}, simulate?: (calls: { to: Address; data: Hex; value?: bigint }[]) => unknown) {
  const sent: Array<{ to: string; data: string; value: bigint }> = []
  const simulated: { to: Address; data: Hex; value?: bigint }[][] = []
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
      quoteOf: () => WETH,
      allowance: () => 0n,
      balanceOf: () => 25n,
      tradeNonce: () => 3n,
      trackedTokens: () => [TRUSTED.usdg, WETH],
      ORDER_TYPEHASH: () => ORDER_TYPEHASH_V3,
      makerEpoch: () => `0x${'00'.repeat(32)}`,
      ...reads,
    }),
    getBlock: async () => ({ number: 100n, timestamp: BigInt(NOW) }),
    simulateBlocks: async ({ blocks }: { blocks: { calls: { to: Address; data: Hex; value?: bigint }[] }[] }) => {
      simulated.push(blocks[0]!.calls)
      return [simulate ? simulate(blocks[0]!.calls) : { calls: blocks[0]!.calls.map(() => ({ status: 'success', data: '0x' })) }]
    },
    waitForTransactionReceipt: async ({ hash }: { hash: Hex }) => ({ status: 'success', transactionHash: hash, logs: [] }),
  } as unknown as PublicClient
  return mockApi({ 'GET /v1/contracts': () => ({ body: contractsAnswer() }), ...routes }).then((api) => ({
    api, sent, simulated, m: new Mancer({ baseUrl: api.url, account, session, trusted: TRUSTED, bookDeployments: [D], publicClient: chain, walletClient: wallet }),
  }))
}

function raiseAnswer(steps: unknown[], over: Record<string, unknown> = {}) {
  return {
    head: { block: 100, timestamp: NOW }, deployment: { factory: D.factory.address.toLowerCase(), abiSet: 'books', label: 'books' }, bookId: '7', side: 'buy', payWith: 'eth',
    quote: { token: WETH.toLowerCase(), symbol: 'WETH', decimals: 18, isWeth: true, usd8: null, source: 'eth-usd-feed' }, amountIn: '1000', taxBps: 100, taxQuote: '10', curveQuote: '990',
    amountOut: '5000', minOut: '4950', ready: ready(steps), ...over,
  }
}

test("a raise buy is the kit's own pad call from the bot's wallet, at a floor held to the bot's rule", async () => {
  const honest = bookCallData(buyEthCall(D, 7n, 4950n, ME, 1000n))
  let answer: unknown = raiseAnswer([asStep('buy', honest)])
  const { api, m, sent } = await stand({ 'GET /v1/books/:token/raise-quote': () => ({ body: answer }) })
  try {
    await assert.rejects(m.raiseSteps(BOOK, { side: 'buy', amountIn: 1000n }), /name the floor/)
    const r = await m.raiseSteps(BOOK, { side: 'buy', amountIn: 1000n, minOut: 4900n })
    assert.equal(r.minOut, 4950n)
    assert.equal(r.payWith, 'eth', 'a WETH Book pays with ether by default')
    const asked = api.seen.find((s) => s.path.endsWith('/raise-quote'))!
    assert.equal(asked.query.get('taker'), ME)
    assert.equal(asked.query.get('steps'), '1')
    await m.sendSteps(r.checked)
    assert.equal(sent.length, 1)
    // a floor under the bot's own, a buy paying a stranger, another Book's id, and another amount: refused, nothing sent
    await assert.rejects(m.raiseSteps(BOOK, { side: 'buy', amountIn: 1000n, minOut: 4951n }), (e) => e instanceof MancerCheckError && /under the 4951 you named/.test(e.reason))
    answer = raiseAnswer([asStep('buy', bookCallData(buyEthCall(D, 7n, 4950n, ATTACKER, 1000n)))])
    await assert.rejects(m.raiseSteps(BOOK, { side: 'buy', amountIn: 1000n, trustQuote: true }), /not the act's own call/)
    answer = raiseAnswer([asStep('buy', honest)], { bookId: '8' })
    await assert.rejects(m.raiseSteps(BOOK, { side: 'buy', amountIn: 1000n, trustQuote: true }), /another Book id/)
    answer = raiseAnswer([asStep('buy', honest)], { amountIn: '999' })
    await assert.rejects(m.raiseSteps(BOOK, { side: 'buy', amountIn: 1000n, trustQuote: true }), /another amount/)
    answer = raiseAnswer([asStep('buy', bookCallData(buyEthCall(D, 7n, 4950n, ME, 1000n)))], { minOut: '4950', ready: { error: 'the steps could not be built', code: 'steps-unavailable' } })
    await assert.rejects(m.raiseSteps(BOOK, { side: 'buy', amountIn: 1000n, trustQuote: true }), /built no steps/)
    assert.equal(sent.length, 1)
  } finally {
    await api.close()
  }
})

test('a raise in a listed base pair takes an exact approval of the pair, and a sale an exact approval of the Book token', async () => {
  const buy = bookCallData(buyCall(D, 7n, 1000n, 4950n, ME))
  let answer: unknown = raiseAnswer([approvalStep(LISTED, D.pad.address, 1000n), asStep('buy', buy)], { payWith: 'quote', quote: { token: LISTED.toLowerCase(), symbol: 'L', decimals: 18, isWeth: false, usd8: null, source: 'fixed' } })
  const { api, m } = await stand({ 'GET /v1/books/:token/raise-quote': () => ({ body: answer }) }, { quoteOf: () => LISTED })
  try {
    await assert.rejects(m.raiseSteps(BOOK, { side: 'buy', amountIn: 1000n, payWith: 'eth', trustQuote: true }), /raises in .* not ether/)
    const r = await m.raiseSteps(BOOK, { side: 'buy', amountIn: 1000n, trustQuote: true })
    assert.equal(r.checked.steps.length, 2)
    answer = raiseAnswer([approvalStep(LISTED, D.pad.address, 1n << 200n), asStep('buy', buy)], { payWith: 'quote', quote: { token: LISTED.toLowerCase() } })
    await assert.rejects(m.raiseSteps(BOOK, { side: 'buy', amountIn: 1000n, trustQuote: true }), /approval is not of exactly/)
    const sell = bookCallData(sellCall(D, 7n, 20n, 15n, 'quote'))
    answer = raiseAnswer([approvalStep(BOOK, D.pad.address, 20n), asStep('sell', sell)], { side: 'sell', payWith: 'quote', amountIn: '20', minOut: '15', quote: { token: LISTED.toLowerCase() } })
    const s = await m.raiseSteps(BOOK, { side: 'sell', amountIn: 20n, minOut: 15n })
    assert.equal(s.checked.steps.length, 2)
  } finally {
    await api.close()
  }
})

test("the curve's own answer is read by a simulation of the kit's call on the bot's node, with a floor of one unit", async () => {
  const pad = BOOK_ABIS.books.pad
  let reverted = false
  const { api, m, simulated } = await stand({}, {}, (calls) => ({
    calls: calls.map((_c, i) => (reverted ? { status: 'failure', data: '0x' } : { status: 'success', data: i === calls.length - 1 ? encodeFunctionResult({ abi: pad, functionName: 'buyEth', result: 5_123n }) : '0x' })),
  }))
  try {
    assert.equal(await m.curveOut(BOOK, { side: 'buy', amountIn: 1000n }), 5_123n)
    const [call] = simulated[0]!
    assert.equal(call!.data, bookCallData(buyEthCall(D, 7n, 1n, ME, 1000n)).data, 'the kit call at a floor of one unit, paying the bot')
    assert.equal(call!.value, 1000n)
    reverted = true
    await assert.rejects(m.curveOut(BOOK, { side: 'buy', amountIn: 1000n }), /does not run from the wallet on your node/)
    assert.equal(api.seen.filter((s) => s.path.includes('/books/')).length, 0, 'the curve is read from the chain alone')
  } finally {
    await api.close()
  }
})

function saleQuote(over: { tokenIn?: Address; recipient?: Address } = {}) {
  const deadline = BigInt(NOW + 300)
  const tokenIn = over.tokenIn ?? TRUSTED.usdg
  const route = executeData({ tokenIn, tokenOut: WETH, amountIn: 1_000_000n, minAmountOut: 990n, recipient: over.recipient ?? VAULT, deadline, feeBps: 2 })
  return { adapter: D.adapters.mancer!.address.toLowerCase(), tokenIn: tokenIn.toLowerCase(), tokenOut: WETH.toLowerCase(), amountIn: '1000000', minOut: '990', route, deadline: deadline.toString(), salt: '9', signature: '0x12' }
}

test("a settlement is the vault's sync of what the bot's node reads it tracking, then the settler's liquidate on the signed sales", async () => {
  const sync = bookCallData(syncTrackedCall(D, VAULT, [TRUSTED.usdg, WETH]))
  const answerOf = (quotes: ReturnType<typeof saleQuote>[], over: Record<string, unknown> = {}) => ({
    head: { block: 1, timestamp: NOW }, bookId: '7', vault: VAULT.toLowerCase(), quotes, unquoted: [], preSync: { to: VAULT.toLowerCase(), data: sync.data },
    ready: ready([asStep('syncTracked', sync), asStep('liquidate', bookCallData(liquidateCall(D, 7n, quotes.map((q) => parseBookQuote(q)))))]), ...over,
  })
  let answer: unknown = answerOf([saleQuote()])
  const { api, m, sent } = await stand({ 'POST /v1/books/:token/liquidation-quotes': () => ({ body: answer }) })
  try {
    const r = await m.settleSteps(BOOK, { slippageBps: 100 })
    assert.equal(r.checked.steps.length, 2)
    assert.equal(api.seen.find((s) => s.path.endsWith('/liquidation-quotes'))!.query.get('steps'), '1')
    // a sale of the Book's own token, a sale paying a stranger, another vault: refused
    answer = answerOf([saleQuote({ tokenIn: BOOK })])
    await assert.rejects(m.settleSteps(BOOK), (e) => e instanceof MancerCheckError)
    answer = answerOf([saleQuote({ recipient: ATTACKER })])
    await assert.rejects(m.settleSteps(BOOK), (e) => e instanceof MancerCheckError)
    answer = answerOf([saleQuote()], { vault: ATTACKER.toLowerCase() })
    await assert.rejects(m.settleSteps(BOOK), /another Book or vault/)
    // a sync of tokens the vault does not track by the bot's node
    answer = answerOf([saleQuote()], { ready: ready([asStep('syncTracked', bookCallData(syncTrackedCall(D, VAULT, [ATTACKER]))), asStep('liquidate', bookCallData(liquidateCall(D, 7n, [parseBookQuote(saleQuote())])))]) })
    await assert.rejects(m.settleSteps(BOOK), /not the act's own call/)
    assert.equal(sent.length, 0)
  } finally {
    await api.close()
  }
})

test("a draft's open is built and checked without being sent, and the vault's pending trade is read on the bot's node", async () => {
  const id = 'e'.repeat(32)
  const terms = { traders: [ME], durationSecs: 604_800 }
  const open = bookCallData(openBookCall(D, openBookParamsOf(terms, { name: 'Mine', symbol: 'MINE' })))
  const { api, m, sent } = await stand({
    'POST /v1/books/drafts/:id/steps': () => ({ body: { ...ready([asStep('open', open)]), draft: { id, factory: D.factory.address.toLowerCase(), name: 'Mine', symbol: 'MINE' }, bind: { method: 'PATCH', path: `/v1/books/drafts/${id}` } } }),
  }, {
    pending: () => [D.adapters.mancer!.address, TRUSTED.usdg, WETH, 10n, 9n, '0x', 4n, BigInt(NOW + 60), 5n, '0x12'],
  })
  try {
    const r = await m.bookOpenSteps(id, terms as never, { name: 'Mine', symbol: 'MINE' })
    assert.equal(r.path, `/v1/books/drafts/${id}`)
    assert.equal(r.checked.steps.length, 1)
    assert.equal(sent.length, 0, 'built, not sent')
    const p = await m.vaultPending(BOOK)
    assert.equal(p.book.vault, VAULT)
    assert.equal(p.pending?.amountIn, 10n)
    assert.equal(p.pending?.quoteSalt, 5n)
  } finally {
    await api.close()
  }
  // the raise's tax and base pair, as the pad answers them on the bot's node
  const taxed = await stand({}, { currentTaxBps: () => 450n, quoteOf: () => LISTED })
  try {
    const b = await taxed.m.bookOf(BOOK)
    assert.equal(b.taxBps, 450)
    assert.equal(b.quote, LISTED)
  } finally {
    await taxed.api.close()
  }
  // a confirmation held to the pending trade the bot read: another trade pending on its node is refused, nothing asked
  const other = await stand({ 'POST /v1/books/:token/steps': () => ({ body: {} }) }, {
    pending: () => [D.adapters.mancer!.address, TRUSTED.usdg, WETH, 10n, 9n, '0x', 4n, BigInt(NOW + 60), 6n, '0x12'],
  })
  try {
    await assert.rejects(
      other.m.bookSteps(BOOK, 'confirmTrade', { minOut: 1n, expectPending: { salt: 5n, tokenIn: TRUSTED.usdg, tokenOut: WETH, amountIn: 10n, minOut: 9n } }),
      (e) => e instanceof MancerCheckError && /another pending trade than the one you read/.test(e.reason),
    )
    assert.equal(other.api.seen.filter((s) => s.path.endsWith('/steps')).length, 0)
  } finally {
    await other.api.close()
  }
  const none = await stand({}, { pending: () => ['0x0000000000000000000000000000000000000000', TRUSTED.usdg, WETH, 0n, 0n, '0x', 0n, 0n, 0n, '0x'] })
  try {
    assert.equal((await none.m.vaultPending(BOOK)).pending, null)
  } finally {
    await none.api.close()
  }
})
