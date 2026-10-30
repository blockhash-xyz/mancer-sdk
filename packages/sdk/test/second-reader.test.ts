import test from 'node:test'
import assert from 'node:assert/strict'
import { encodeAbiParameters, encodeEventTopics, encodeFunctionData, erc20Abi, getAddress, hashTypedData, parseAbi, zeroAddress, type Address, type Hex, type PublicClient, type WalletClient } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { BOOK_DEPLOYMENTS } from '../src/kit/books/deployments'
import { MANCER_INTEGRATOR_FEE_DEPLOYMENTS } from '../src/kit/addresses'
import { ORDER_TYPEHASH_V3, type MancerOrderV3 } from '../src/kit/orders'
import { bookCallData, buyCall, buyEthCall, openBookCall } from '../src/kit/books/calls'
import { bookTokenAbi, bookOperatorNftAbi } from '../src/kit/books/abis'
import { mancerRouterAbi } from '../src/kit/abi'
import { loginMessage } from './fixtures/sign-in'
import { orderTypedDataV3 } from '../src/kit/site/order-typed-data'
import { Mancer, MancerCheckError, executedOf, checkBookSteps, checkDraftOpenSteps, checkOrderSetupSteps, checkSwapSteps, withRetry } from '../src/index'
import type { BookStepsResponse, DraftOpenStepsResponse, Quote, ReadySteps } from '../src/generated/openapi'
import { NOW, SIM_OK, TRUSTED, approveData, contractsAnswer, executeData, fakeChain, mockApi } from './helpers'

/**
 * The second reader's tests of wave 3's SDK (2026-10-30). Each builds an answer a hostile or broken API could send, that
 * the SDK's checks pass today, and that makes the bot sign something it did not ask for: a swap whose floor is dust and
 * whose legs pay a third party, a Book act that hands the bot's tokens, ether or trader seat to another address, an
 * order setup that grants the orders contract all but an unbounded allowance, an order whose hash the bot never made.
 * Each asserts what the SDK should do (refuse before signing), so each fails until its hole is closed.
 */

const ME = getAddress('0x' + '33'.repeat(20))
const ATTACKER = getAddress('0x' + '44'.repeat(20))
const VENUE = getAddress('0x' + '55'.repeat(20))
const INTEGRATOR_FEE = getAddress(MANCER_INTEGRATOR_FEE_DEPLOYMENTS[4663]!)
const PAY_ABI = parseAbi(['function pay(address token, address recipient, uint16 bps, bool native) returns (uint256)'])
const D = BOOK_DEPLOYMENTS[0]!

function ready(steps: ReadySteps['steps'], over: Partial<ReadySteps> = {}, wallet: Address = ME): ReadySteps {
  return { chainId: 4663, wallet: wallet.toLowerCase(), steps, simulation: SIM_OK as never, readAfter: null, ...over }
}
const step = (kind: string, to: Address, data: Hex, value = '0') => ({ kind, to: to.toLowerCase(), data, value, gas: '100000', why: '' })
const refusedBeforeSigning = (e: unknown) => e instanceof MancerCheckError

// a leg the router runs through the integrator fee contract, which pays `bps` of the router's allowance to `recipient`:
// the contract is active on the live router's allowlist since 2026-10-15
const feeLeg = (token: Address, recipient: Address, bps: number, amountIn = 0n) => ({
  target: INTEGRATOR_FEE,
  payload: encodeFunctionData({ abi: PAY_ABI, functionName: 'pay', args: [token, recipient, bps, false] }),
  tokenIn: token, tokenOut: token, amountIn, fund: 0,
})
const venueLeg = { target: VENUE, payload: '0x1234' as Hex, tokenIn: TRUSTED.usdg, tokenOut: TRUSTED.weth, amountIn: 0n, fund: 0 }

const swapAsk = {
  wallet: ME, recipient: ME, tokenIn: TRUSTED.usdg, tokenOut: TRUSTED.weth, amountIn: 1_000_000n,
  nativeIn: false, nativeOut: false, minOut: 990n, maxFeeBps: 10, nowSec: NOW,
}
function quote(r: ReadySteps, over: Partial<Quote> = {}): Quote {
  return { amountOut: '1000', minOut: '995', fee: { bps: 10 }, latencyMs: 1, cached: false, tx: { to: TRUSTED.router, data: '0x', value: '0', approval: null }, ready: r, ...over } as Quote
}

// ----------------------------------------------------------------------------------------------------------- swaps

test('HIGH: a router call whose last leg pays 99.99% of the output to a stranger through the integrator fee contract is refused', () => {
  // the bot named its own floor (990) and no integrator fee; the plan swaps, then pays nearly all the WETH it holds to the
  // attacker, and delivers the rest, which still clears the floor when the swap paid more than the floor by that much
  const data = executeData({ legs: [venueLeg, feeLeg(TRUSTED.weth, ATTACKER, 9_999)] })
  const q = quote(ready([step('approval', TRUSTED.usdg, approveData(TRUSTED.allowanceTarget, 1_000_000n)), step('swap', TRUSTED.router, data)]))
  assert.throws(() => checkSwapSteps(q, swapAsk, TRUSTED), refusedBeforeSigning, 'a leg that pays a third party is no part of the swap the bot asked for')
})

test('HIGH: an input-side leg that pays part of the input to a stranger is refused', () => {
  const data = executeData({ legs: [feeLeg(TRUSTED.usdg, ATTACKER, 10_000, 4_000n), { ...venueLeg, amountIn: 0n }] })
  const q = quote(ready([step('approval', TRUSTED.usdg, approveData(TRUSTED.allowanceTarget, 1_000_000n)), step('swap', TRUSTED.router, data)]))
  assert.throws(() => checkSwapSteps(q, swapAsk, TRUSTED), refusedBeforeSigning)
})

const account = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d')
const session = `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: account.address.toLowerCase(), iat: 1, exp: 4_000_000_000 })).toString('base64url')}.x`

function standInWallet() {
  const sent: Array<{ to: string; data: string; value: bigint }> = []
  const wallet = {
    getChainId: async () => 4663,
    sendTransaction: async (tx: { to: string; data: string; value: bigint }) => {
      sent.push(tx)
      return (`0x${String(sent.length).padStart(64, '0')}`) as Hex
    },
  } as unknown as WalletClient
  const chain = {
    ...fakeChain({ ORDER_TYPEHASH: () => ORDER_TYPEHASH_V3, makerEpoch: () => `0x${'00'.repeat(32)}` }),
    waitForTransactionReceipt: async ({ hash }: { hash: Hex }) => ({ status: 'success', transactionHash: hash, logs: [] }),
  } as unknown as PublicClient
  return { wallet, chain, sent }
}

test("HIGH: with no minOut, the swap's floor is the API's own estimate, so a hostile quote sets it to dust and takes the rest", async () => {
  // the docs' own example swap names no floor of its own: `mancer.swap({ tokenIn, tokenOut, amountIn, slippageBps: 50 })`
  const steal = executeData({ minAmountOut: 1n, legs: [venueLeg, feeLeg(TRUSTED.weth, ATTACKER, 9_999)] })
  const answer = {
    quote: {
      amountOut: '1', quotedAmountOut: '1', minOut: '1', fee: { bps: 10, side: 'input' }, latencyMs: 3, cached: false,
      tx: { to: TRUSTED.router, data: steal, value: '0', approval: null },
      ready: {
        chainId: 4663, wallet: account.address.toLowerCase(), simulation: SIM_OK, readAfter: null,
        steps: [
          { kind: 'approval', to: TRUSTED.usdg.toLowerCase(), data: approveData(TRUSTED.allowanceTarget, 1_000_000n), value: '0', gas: '60000', why: '' },
          { kind: 'swap', to: TRUSTED.router.toLowerCase(), data: steal, value: '0', gas: '400000', why: '' },
        ],
      },
    },
  }
  const api = await mockApi({ 'GET /v1/contracts': () => ({ body: contractsAnswer() }), 'GET /v1/quote': () => ({ body: answer }) })
  const w = standInWallet()
  try {
    const m = new Mancer({ baseUrl: api.url, account, session, trusted: TRUSTED, publicClient: w.chain, walletClient: w.wallet })
    await assert.rejects(m.swap({ tokenIn: TRUSTED.usdg, tokenOut: TRUSTED.weth, amountIn: 1_000_000n, slippageBps: 50 }), refusedBeforeSigning,
      'a million units of USDG for a floor of one wei of WETH, on the API\'s word alone')
    assert.equal(w.sent.length, 0, 'nothing signed or sent')
  } finally {
    await api.close()
  }
})

test("LOW: what a swap reports it did is the router's own Executed event, not one any contract of the route emitted", () => {
  // a route's middle token runs its own code inside the swap and can emit an `Executed` of the same shape first
  const topics = encodeEventTopics({ abi: mancerRouterAbi, eventName: 'Executed', args: { sender: ME, tokenIn: TRUSTED.usdg, tokenOut: TRUSTED.weth } })
  const data = (out: bigint) => encodeAbiParameters([{ type: 'uint256' }, { type: 'uint256' }, { type: 'address' }, { type: 'uint256' }, { type: 'uint16' }, { type: 'uint8' }, { type: 'uint256' }], [1_000_000n, out, TRUSTED.usdg, 1_000n, 10, 0, 1n])
  const forged = { address: ATTACKER, topics, data: data(10n ** 30n) }
  const real = { address: TRUSTED.router, topics, data: data(1n) }
  const read = executedOf({ logs: [forged, real] } as never)
  assert.equal(read?.amountOut, 1n, 'the forged log from another contract was read as the swap')
})

// ----------------------------------------------------------------------------------------------------------- Books

const BOOK = getAddress('0x' + 'aa'.repeat(20))
const VAULT = getAddress('0x' + 'bb'.repeat(20))
const ATTACKER_VAULT = getAddress('0x' + 'cc'.repeat(20))
function bookAnswer(steps: ReadySteps['steps'], action = 'redeem', vault: Address = VAULT): BookStepsResponse {
  return { ...ready(steps), action, book: { token: BOOK, bookId: '7', factory: D.factory.address, vault, phase: 'settled' as never } }
}
const asStep = (kind: string, c: { to: Address; data: Hex; value: bigint }) => step(kind, c.to, c.data, c.value.toString())

test("HIGH: a Book act whose step transfers the bot's Book tokens to a stranger is refused", () => {
  const data = encodeFunctionData({ abi: bookTokenAbi, functionName: 'transfer', args: [ATTACKER, 10n ** 24n] })
  assert.throws(() => checkBookSteps(bookAnswer([step('redeem', BOOK, data)]), { wallet: ME, token: BOOK, action: 'redeem' }), refusedBeforeSigning,
    "the Book's token is an allowed target for any calldata, so transfer(attacker, all) passes")
})

test("HIGH: a Book act whose step spends the bot's ether on another Book's raise, paid to a stranger, is refused", () => {
  // pad.buyEth(bookId, minTokensOut, recipient): the pad sends the tokens to `recipient` (TraderBookPad._buy)
  const c = bookCallData(buyEthCall(D, 999n, 0n, ATTACKER, 5n * 10n ** 18n))
  assert.throws(() => checkBookSteps(bookAnswer([asStep('redeem', c)]), { wallet: ME, token: BOOK, action: 'redeem' }), refusedBeforeSigning,
    'a step to the pad with 5 ETH, buying another Book for the attacker')
})

test("HIGH: a Book act whose steps approve the bot's base pair to the pad and buy for a stranger with it are refused", () => {
  const mancerToken = getAddress('0x' + '9a'.repeat(20))
  const approve = encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [D.pad.address, (1n << 128n) - 1n] })
  const buy = bookCallData(buyCall(D, 999n, 10n ** 24n, 0n, ATTACKER))
  assert.throws(() => checkBookSteps(bookAnswer([step('approval', mancerToken, approve), asStep('stake', buy)], 'stake'), { wallet: ME, token: BOOK, action: 'stake' }), refusedBeforeSigning,
    'an approval of 2^128-1 of a token the act does not spend, and a buy paid to the attacker')
})

test("HIGH: a Book act whose steps run the bot's own tokens through a pinned Books adapter, on a route that pays a stranger, are refused", () => {
  // MancerRouterAdapter.swapFromBook takes its caller as the Book (`book == msg.sender`), pulls `amountIn` of it and runs
  // the route; its floor is the calldata's own, and the route's legs are anyone's
  const adapter = D.adapters.mancer!.address
  const approve = encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [adapter, 10n ** 24n] })
  const route = executeData({ amountIn: 10n ** 24n, minAmountOut: 1n, recipient: ME, legs: [feeLeg(TRUSTED.usdg, ATTACKER, 10_000, 10n ** 24n - 1n), { ...venueLeg, amountIn: 0n }] })
  const swap = encodeFunctionData({
    abi: parseAbi(['function swapFromBook(address book, address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut, bytes route) returns (uint256)']),
    functionName: 'swapFromBook', args: [ME, TRUSTED.usdg, TRUSTED.weth, 10n ** 24n, 1n, route],
  })
  assert.throws(() => checkBookSteps(bookAnswer([step('approval', TRUSTED.usdg, approve), step('syncTax', adapter, swap)], 'syncTax'), { wallet: ME, token: BOOK, action: 'syncTax' }), refusedBeforeSigning)
})

test("MEDIUM: a vault trade's route whose leg pays most of what the vault sells to a stranger is refused", async () => {
  // the vault quote is held to the kit's vaultRouteMismatch, which reads the plan's ends and never its legs; with no floor
  // of the bot's own the floor is the answer's, so a quote of one unit and a fee leg empty the vault's sale
  const amountIn = 10n ** 21n
  const route = executeData({ tokenIn: TRUSTED.usdg, tokenOut: TRUSTED.weth, amountIn, minAmountOut: 1n, recipient: VAULT, deadline: BigInt(NOW + 300),
    legs: [feeLeg(TRUSTED.usdg, ATTACKER, 10_000, amountIn - 1_000n), { ...venueLeg, amountIn: 0n }] })
  const answer = {
    purpose: 'trade', preview: false, adapter: D.adapters.mancer!.address, tokenIn: TRUSTED.usdg, tokenOut: TRUSTED.weth, amountIn: amountIn.toString(), minOut: '1',
    route, deadline: String(NOW + 300), salt: '1', signature: '0x12', digest: '0x34', intent: null, plan: null, simulation: null, vault: VAULT,
  }
  const api = await mockApi({ 'POST /v1/books/:token/vault-quote': () => ({ body: answer }) })
  try {
    const m = new Mancer({ baseUrl: api.url, account, session, trusted: TRUSTED, publicClient: fakeChain() })
    await assert.rejects(m.vaultQuote(BOOK, { purpose: 'trade', tokenIn: TRUSTED.usdg, tokenOut: TRUSTED.weth, amountIn: amountIn.toString() }), refusedBeforeSigning)
  } finally {
    await api.close()
  }
})

test("HIGH: a Book act whose step hands the bot's trader seat (the operator NFT) to a stranger is refused", () => {
  const give = encodeFunctionData({ abi: bookOperatorNftAbi, functionName: 'transferFrom', args: [ME, ATTACKER, 7n] })
  const all = encodeFunctionData({ abi: bookOperatorNftAbi, functionName: 'setApprovalForAll', args: [ATTACKER, true] })
  assert.throws(() => checkBookSteps(bookAnswer([step('claim', D.operatorNft.address, give)], 'claim'), { wallet: ME, token: BOOK, action: 'claim' }), refusedBeforeSigning)
  assert.throws(() => checkBookSteps(bookAnswer([step('claim', D.operatorNft.address, all)], 'claim'), { wallet: ME, token: BOOK, action: 'claim' }), refusedBeforeSigning)
})

test("HIGH: a Book act that sends ether to a vault the answer names (not the Book's own) is refused", () => {
  // a vault's receive() wraps any ether and credits it to that vault: the answer's `book.vault` is held to the vaults'
  // code hash alone (Mancer.bookSteps), never to the Book asked for, so it can name the attacker's own Book's vault
  assert.throws(() => checkBookSteps(bookAnswer([step('redeem', ATTACKER_VAULT, '0x', (3n * 10n ** 18n).toString())], 'redeem', ATTACKER_VAULT), { wallet: ME, token: BOOK, action: 'redeem' }), refusedBeforeSigning)
})

test("HIGH: a draft's open whose step buys another Book for a stranger with the bot's ether is refused", () => {
  const open = bookCallData(openBookCall(D, {
    name: 'Mine', symbol: 'MINE', traders: [ME], durationSecs: 604_800, lpFeeMode: 0, startMcapUsd8: 0n, gradMcapUsd8: 0n, startTaxBps: 0,
    taxDecayPerMinBps: 0, windowSecs: 0, buysOnly: false, bondAfterSecs: 0, guaranteedBond: false, quote: zeroAddress, venue: 0, hook: zeroAddress,
  }))
  const steal = bookCallData(buyEthCall(D, 999n, 0n, ATTACKER, 5n * 10n ** 18n))
  const answer = { ...ready([asStep('open', open), asStep('open', steal)]), draft: { id: 'd'.repeat(32), factory: D.factory.address }, bind: { method: 'PATCH', path: '/v1/books/drafts/x' } } as unknown as DraftOpenStepsResponse
  assert.throws(() => checkDraftOpenSteps(answer, { wallet: ME, draftId: 'd'.repeat(32) }), refusedBeforeSigning)
})

test("MEDIUM: a draft's open that names traders the bot did not name is refused", async () => {
  // the bot asks for itself as the Book's one trader; the open's calldata names the attacker; the check never reads it
  const open = bookCallData(openBookCall(D, {
    name: 'Mine', symbol: 'MINE', traders: [ATTACKER], durationSecs: 604_800, lpFeeMode: 0, startMcapUsd8: 0n, gradMcapUsd8: 0n, startTaxBps: 0,
    taxDecayPerMinBps: 0, windowSecs: 0, buysOnly: false, bondAfterSecs: 0, guaranteedBond: false, quote: zeroAddress, venue: 0, hook: zeroAddress,
  }))
  const id = 'e'.repeat(32)
  const api = await mockApi({
    'POST /v1/books/drafts/:id/steps': () => ({ body: { ...ready([asStep('open', open)], {}, account.address), draft: { id, factory: D.factory.address }, bind: { method: 'PATCH', path: `/v1/books/drafts/${id}` } } }),
    'PATCH /v1/books/drafts/:id': () => ({ body: { draft: { id } } }),
  })
  const w = standInWallet()
  try {
    const m = new Mancer({ baseUrl: api.url, account, session, trusted: TRUSTED, publicClient: w.chain, walletClient: w.wallet })
    await assert.rejects(m.openBookFromDraft(id, { traders: [account.address], durationSecs: 604_800 } as never), refusedBeforeSigning)
    assert.equal(w.sent.length, 0)
  } finally {
    await api.close()
  }
})

test("LOW: a draft's bind path on another host is not sent the bot's credential", async () => {
  const thief = await mockApi({ 'PATCH /steal': () => ({ body: {} }) })
  const id = 'f'.repeat(32)
  const open = bookCallData(openBookCall(D, {
    name: 'Mine', symbol: 'MINE', traders: [account.address], durationSecs: 604_800, lpFeeMode: 0, startMcapUsd8: 0n, gradMcapUsd8: 0n, startTaxBps: 0,
    taxDecayPerMinBps: 0, windowSecs: 0, buysOnly: false, bondAfterSecs: 0, guaranteedBond: false, quote: zeroAddress, venue: 0, hook: zeroAddress,
  }))
  const api = await mockApi({
    'POST /v1/books/drafts/:id/steps': () => ({ body: { ...ready([asStep('open', open)], {}, account.address), draft: { id, factory: D.factory.address }, bind: { method: 'PATCH', path: `${thief.url}/steal` } } }),
  })
  const w = standInWallet()
  try {
    const m = new Mancer({ baseUrl: api.url, account, session, trusted: TRUSTED, publicClient: w.chain, walletClient: w.wallet })
    await m.openBookFromDraft(id, { traders: [account.address], durationSecs: 604_800 } as never).catch(() => null)
    const stolen = thief.seen.find((s) => s.path === '/steal')
    assert.equal(stolen?.headers.authorization, undefined, "the session token was sent to the host the answer's bind.path named")
  } finally {
    await api.close()
    await thief.close()
  }
})

// ------------------------------------------------------------------------------------------------------------ orders

test("MEDIUM: an order setup's approval is not sized by the API's own count of open pulls up to 2^128", () => {
  const setup = { tokenIn: TRUSTED.usdg, amountPerFill: 1_000n, totalFills: 1, wallet: ME, nativeIn: false }
  const openPulls = (1n << 127n).toString()
  const need = { book: TRUSTED.orders.toLowerCase(), pull: '1000', openPulls, openPullsOf: 'maker', allowance: '0', held: '0' }
  const r = Object.assign(ready([step('approval', TRUSTED.usdg, approveData(TRUSTED.orders, 1_000n + (1n << 127n)))]), { need })
  // 1.7e38 units of USDG approved to the orders contract: every order the wallet ever signed and cancelled by signature
  // alone (the SDK's default cancel) stays fillable by any executor the contract allows
  assert.throws(() => checkOrderSetupSteps({ ready: r }, setup, TRUSTED), refusedBeforeSigning)
})

async function orderStand(post: (body: { order: MancerOrderV3 }) => { status?: number; body: unknown }) {
  const posted: MancerOrderV3[] = []
  const api = await mockApi({
    'GET /v1/contracts': () => ({ body: contractsAnswer() }),
    'GET /v1/order-fee': (r) => ({ body: { tokenIn: r.query.get('tokenIn'), tokenOut: r.query.get('tokenOut'), baseFeeBps: 15, swapFeeBps: 0, feeBps: 15, tier: 'other' } }),
    'POST /v1/orders': (r) => {
      posted.push((r.body as { order: MancerOrderV3 }).order)
      return post(r.body as { order: MancerOrderV3 })
    },
  })
  const w = standInWallet()
  const m = new Mancer({ baseUrl: api.url, account, session, trusted: TRUSTED, publicClient: w.chain, walletClient: w.wallet })
  return { api, m, posted }
}

test("MEDIUM: a placed order's hash is the one the bot signed, not the API's word", async () => {
  // the API answers another order's hash; the bot's later cancelOrders([hash]) and cancelOrderOnChain(hash) then cancel
  // that other order, and the one it signed stays live
  const other = `0x${'ee'.repeat(32)}` as Hex
  const { api, m, posted } = await orderStand(() => ({ status: 201, body: { hash: other, existing: false } }))
  try {
    const placed = await m.placeLimit({ tokenIn: TRUSTED.weth, tokenOut: TRUSTED.usdg, amountIn: 10n ** 16n, minOut: 30_000_000n }, { setup: false }).catch((e) => e)
    if (placed instanceof Error) {
      assert.ok(placed instanceof MancerCheckError)
      return
    }
    const signed = hashTypedData(orderTypedDataV3(posted[0]!, 4663, TRUSTED.orders) as never)
    assert.equal(placed.hash, signed, 'the hash handed back is the hash of the order the bot signed')
  } finally {
    await api.close()
  }
})

test('LOW: withRetry around placeLimit sends the same order again, never a second order with a fresh nonce', async () => {
  // a broken API rests the order, then answers 503 retryable: the bot's documented retry places a second, distinct order
  let n = 0
  const { api, m, posted } = await orderStand((b) => {
    n += 1
    if (n === 1) return { status: 503, body: { error: 'the order book did not answer', code: 'store-unavailable', retryable: true, retryAfterSeconds: 0 } }
    return { status: 201, body: { hash: hashTypedData(orderTypedDataV3(b.order, 4663, TRUSTED.orders) as never), existing: false } }
  })
  try {
    await withRetry(() => m.placeLimit({ tokenIn: TRUSTED.weth, tokenOut: TRUSTED.usdg, amountIn: 10n ** 16n, minOut: 30_000_000n }, { setup: false }), { sleep: async () => {} })
    assert.equal(posted.length, 2)
    assert.equal(posted[1]!.nonce, posted[0]!.nonce, 'a retry of the same act signs the same order, so the book holds one')
  } finally {
    await api.close()
  }
})

test('LOW: withRetry around createBookDraft sends the same Idempotency-Key again, so a retry saves one draft', async () => {
  const keys: string[] = []
  const api = await mockApi({
    'POST /v1/books/drafts': (r) => {
      keys.push(String(r.headers['idempotency-key']))
      if (keys.length === 1) return { status: 503, body: { error: 'the store did not answer', code: 'store-unavailable', retryable: true, retryAfterSeconds: 0 } }
      return { status: 201, body: { draft: { id: 'a'.repeat(32) } } }
    },
  })
  try {
    const m = new Mancer({ baseUrl: api.url, account, session, trusted: TRUSTED, publicClient: fakeChain() })
    await withRetry(() => m.createBookDraft({ factory: D.factory.address, name: 'Test', symbol: 'TST', targets: [] } as never), { sleep: async () => {} })
    assert.equal(keys.length, 2)
    assert.equal(keys[1], keys[0], "a retry of the documented helper mints a fresh key, so the API's idempotency never applies")
  } finally {
    await api.close()
  }
})

// ----------------------------------------------------------------------------------------------------------- sign-in


test("LOW: a client pointed at a host that is not Mancer's API signs no mancer.xyz sign-in for it", async () => {
  // a lookalike API (a typo'd baseUrl, a "proxy" a bot is told to use) relays Mancer's own nonce and message: the SDK names
  // mancer.xyz whatever host it talks to, so the lookalike gets a real Mancer session for the bot's wallet
  let verified = 0
  const lookalike = await mockApi({
    'GET /auth/nonce': (r) => ({ body: { nonce: 'ab'.repeat(16), message: loginMessage(r.query.get('address')!, 'ab'.repeat(16), Math.floor(Date.now() / 1000)) } }),
    'POST /auth/verify': (r) => {
      verified += 1
      const now = Math.floor(Date.now() / 1000)
      const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
      return { body: { token: `${b64({ alg: 'HS256' })}.${b64({ sub: (r.body as { address: string }).address.toLowerCase(), iat: now, exp: now + 86_400 })}.x`, account: account.address } }
    },
  })
  try {
    const m = new Mancer({ baseUrl: lookalike.url, account, trusted: TRUSTED, publicClient: fakeChain() })
    await m.signIn().catch(() => null)
    assert.equal(verified, 0, "the wallet signed Mancer's sign-in and handed it to a host that is not Mancer's")
  } finally {
    await lookalike.close()
  }
})

// ------------------------------------------------------------------------------------------------------- the stream

test("LOW: an event the API sends malformed, or a handler that throws once, does not silence every later event", async () => {
  // AccountStream chains each delivery on one promise; one rejection (a seq that is no number, BigInt('x'), or the bot's own
  // handler throwing) leaves the chain rejected, so no later event is handed on, nothing says so, and the rejection is
  // unhandled
  const topic = `account:${account.address.toLowerCase()}`
  let push: (name: string, payload: unknown) => void = () => {}
  const factory = () => {
    const listeners: Record<string, Array<(e: { data?: unknown }) => void>> = {}
    const emit = (type: string, e: { data?: unknown } = {}) => (listeners[type] ?? []).forEach((l) => l(e))
    let joinRef: string | null = null
    push = (name, payload) => emit('message', { data: JSON.stringify([joinRef, null, topic, name, payload]) })
    queueMicrotask(() => emit('open'))
    return {
      readyState: 1,
      send: (raw: string) => {
        const f = JSON.parse(raw) as [string, string, string, string, unknown]
        if (f[3] === 'phx_join') {
          joinRef = f[0]
          queueMicrotask(() => emit('message', { data: JSON.stringify([joinRef, f[1], topic, 'phx_reply', { status: 'ok', response: { head: '0' } }]) }))
        }
      },
      close: () => {},
      addEventListener: (type: string, l: (e: { data?: unknown }) => void) => { (listeners[type] ??= []).push(l) },
    }
  }
  const api = await mockApi({ 'POST /v1/me/stream-ticket': () => ({ body: { ticket: 't', topic, expiresAt: '', sessionExpiresAt: '', socket: '', head: '0' } }) })
  const seen: string[] = []
  const unhandled: unknown[] = []
  const onUnhandled = (e: unknown) => { unhandled.push(e) }
  process.on('unhandledRejection', onUnhandled)
  try {
    const m = new Mancer({ baseUrl: api.url, account, session, trusted: TRUSTED, publicClient: fakeChain() })
    const stream = await m.streamEvents({ since: '0', webSocket: factory as never, onEvent: (e) => { seen.push(e.seq) } })
    const ev = (seq: string) => ({ seq, kind: 'order.filled', account: account.address.toLowerCase(), wallet: account.address.toLowerCase(), key: `0x${'aa'.repeat(32)}`, at: '', data: {} })
    push('event', ev('not-a-number'))
    push('event', ev('2'))
    await new Promise((r) => setTimeout(r, 200))
    stream.stop()
    assert.deepEqual(seen, ['2'], 'the event after a malformed one is never handed on')
    assert.equal(unhandled.length, 0, 'the stream left a rejection nobody handles, which ends a Node process by default')
  } finally {
    process.off('unhandledRejection', onUnhandled)
    await api.close()
  }
})

// ----------------------------------------------------------------------------------------------- launch envelopes

test("LOW: a router envelope's input approval is held to the amount spent, as the plain swap's is", () => {
  const execution = {
    version: 1 as const, taker: ME, recipient: ME, entrypoint: 'router' as const,
    requirements: [{ kind: 'erc20-allowance' as const, token: TRUSTED.usdg, spender: TRUSTED.allowanceTarget, amount: ((1n << 128n) - 1n).toString() }],
    transactions: [
      { chain: 'robinhood' as const, chainId: 4663 as const, kind: 'approval' as const, to: TRUSTED.usdg, data: approveData(TRUSTED.allowanceTarget, (1n << 128n) - 1n), value: '0' },
      { chain: 'robinhood' as const, chainId: 4663 as const, kind: 'swap' as const, to: TRUSTED.router, data: executeData(), value: '0' },
    ],
  }
  const q = quote(ready(execution.transactions.map((t) => step(t.kind, t.to, t.data))), { execution } as never)
  assert.throws(() => checkSwapSteps(q, swapAsk, TRUSTED), refusedBeforeSigning, 'an approval of 2^128-1 rides in an envelope where the plain path holds it to the amount')
})
