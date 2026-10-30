import test from 'node:test'
import assert from 'node:assert/strict'
import { encodeAbiParameters, encodeFunctionData, getAddress, keccak256, parseAbi, type Address, type Hex, type PublicClient, type WalletClient } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { BOOK_DEPLOYMENTS, type BookDeployment } from '../src/kit/books/deployments'
import { ROUTER_ADDRESS_THIS, ROUTER_MSG_SENDER } from '../src/kit/router-legs'
import { bookCallData, confirmTradeCall } from '../src/kit/books/calls'
import { liveAmountAdapterAbi, swapRouter02Abi, universalRouterAbi } from '../src/kit/abi'
import { Mancer, MancerCheckError, checkSwapSteps } from '../src/index'
import type { Quote, ReadySteps } from '../src/generated/openapi'
import { NOW, SIM_OK, SWAP_ROUTER_02, TRUSTED, approveData, codeAt, contractsAnswer, executeData, fakeChain, mockApi } from './helpers'

/**
 * The second reader's second pass over wave 3's SDK (2026-10-30), on the fixes. The leg reader holds every recipient a
 * venue's call names to the router or the caller, but a leg can still leave the output where anyone may take it (a
 * router's own balance, an adapter's public `clear`), or burn it; a vault quote's ether-against-the-dollar guard reads
 * the API's simulation and not the floor it signs; and a co-trader's pending trade is confirmed at any floor. Each test
 * asserts the refusal, so each fails until its hole is closed. Every loss here is bounded by the floor the caller chose:
 * within that floor a hostile API can always route through a pool or a V4 hook of its own, which no leg reader stops.
 */

const ME = getAddress('0x' + '33'.repeat(20))
const OTHER = getAddress('0x' + '77'.repeat(20))
const UNIVERSAL_ROUTER = getAddress('0x8876789976decbfcbbbe364623c63652db8c0904')
const LIVE_AMOUNT = getAddress('0xec5100c67fb12368abf74a6020e21b545a5da93c')
const SUSHI_V3 = getAddress('0x1e406484f1f204b23ce84b9901c0171a738fd406')
const ORIGINAL_V3 = parseAbi(['function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)'])

function ready(steps: ReadySteps['steps'], over: Partial<ReadySteps> = {}): ReadySteps {
  return { chainId: 4663, wallet: ME.toLowerCase(), steps, simulation: SIM_OK as never, readAfter: null, ...over }
}
const step = (kind: string, to: Address, data: Hex, value = '0') => ({ kind, to: to.toLowerCase(), data, value, gas: '100000', why: '' })
function quote(r: ReadySteps): Quote {
  return { amountOut: '1000', minOut: '995', fee: { bps: 10 }, latencyMs: 1, cached: false, tx: { to: TRUSTED.router, data: '0x', value: '0', approval: null }, ready: r } as Quote
}
const swapAsk = { wallet: ME, recipient: ME, tokenIn: TRUSTED.usdg, tokenOut: TRUSTED.weth, amountIn: 1_000_000n, nativeIn: false, nativeOut: false, minOut: 990n, maxFeeBps: 10, nowSec: NOW }
/** A plain swap whose one leg is `leg`: the exact approval, then the router call. */
const swapWith = (leg: Record<string, unknown>) => quote(ready([
  step('approval', TRUSTED.usdg, approveData(TRUSTED.allowanceTarget, 1_000_000n)),
  step('swap', TRUSTED.router, executeData({ legs: [leg] })),
]))
const refused = (e: unknown) => e instanceof MancerCheckError
const sr02Single = (recipient: Address, amountIn = 0n) => encodeFunctionData({ abi: swapRouter02Abi, functionName: 'exactInputSingle', args: [{ tokenIn: TRUSTED.usdg, tokenOut: TRUSTED.weth, fee: 500, recipient, amountIn, amountOutMinimum: 0n, sqrtPriceLimitX96: 0n }] })

// ------------------------------------------------------------------------------------------- outputs left to anyone

test("LOW: a SwapRouter02 multicall whose swap lands at SwapRouter02 with nothing after it to pay it on is refused", () => {
  // the WETH rests in SwapRouter02, whose sweepToken pays whoever calls it; the router delivers what is left of the floor
  const payload = encodeFunctionData({ abi: swapRouter02Abi, functionName: 'multicall', args: [[sr02Single(ROUTER_ADDRESS_THIS)]] })
  assert.throws(() => checkSwapSteps(swapWith({ target: SWAP_ROUTER_02, payload, tokenIn: TRUSTED.usdg, tokenOut: TRUSTED.weth, amountIn: 0n, fund: 0 }), swapAsk, TRUSTED), refused)
})

test("LOW: a Universal Router V4 swap that TAKEs its output to the Universal Router and never sweeps it is refused", () => {
  // SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE(WETH, ADDRESS_THIS, 0): the output rests in the Universal Router, whose SWEEP
  // command pays anyone
  const take = encodeAbiParameters([{ type: 'address' }, { type: 'address' }, { type: 'uint256' }], [TRUSTED.weth, ROUTER_ADDRESS_THIS, 0n])
  const v4 = encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes[]' }], ['0x060c0e', ['0x00', '0x00', take]])
  const payload = encodeFunctionData({ abi: universalRouterAbi, functionName: 'execute', args: ['0x10', [v4], BigInt(NOW + 600)] })
  assert.throws(() => checkSwapSteps(swapWith({ target: UNIVERSAL_ROUTER, payload, tokenIn: TRUSTED.usdg, tokenOut: TRUSTED.weth, amountIn: 0n, fund: 2 }), swapAsk, TRUSTED), refused)
})

test("LOW: a Universal Router UNWRAP_WETH to the Universal Router with no SWEEP after it is refused", () => {
  const unwrap = encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [ROUTER_ADDRESS_THIS, 0n])
  const payload = encodeFunctionData({ abi: universalRouterAbi, functionName: 'execute', args: ['0x0c', [unwrap], BigInt(NOW + 600)] })
  assert.throws(() => checkSwapSteps(swapWith({ target: UNIVERSAL_ROUTER, payload, tokenIn: TRUSTED.weth, tokenOut: TRUSTED.weth, amountIn: 0n, fund: 2 }), swapAsk, TRUSTED), refused)
})

test("LOW: a leg that transfers its input to a router venue and calls it to do nothing is refused", () => {
  // fund 1 (Transfer) hands the leg's USDG to the Universal Router, whose execute with no commands succeeds and spends
  // none of it: the USDG rests in the Universal Router for anyone's SWEEP. The reader reads no command, so no recipient
  const payload = encodeFunctionData({ abi: universalRouterAbi, functionName: 'execute', args: ['0x', [], BigInt(NOW + 600)] })
  assert.throws(() => checkSwapSteps(swapWith({ target: UNIVERSAL_ROUTER, payload, tokenIn: TRUSTED.usdg, tokenOut: TRUSTED.weth, amountIn: 4_000n, fund: 1 }), swapAsk, TRUSTED), refused)
  // and SwapRouter02 the same way, its multicall a wrapETH of nothing
  const wrap = encodeFunctionData({ abi: swapRouter02Abi, functionName: 'wrapETH', args: [0n] })
  const sr = encodeFunctionData({ abi: swapRouter02Abi, functionName: 'multicall', args: [[wrap]] })
  assert.throws(() => checkSwapSteps(swapWith({ target: SWAP_ROUTER_02, payload: sr, tokenIn: TRUSTED.usdg, tokenOut: TRUSTED.weth, amountIn: 4_000n, fund: 1 }), swapAsk, TRUSTED), refused)
})

test("LOW: a LiveAmountAdapter call that names another output than its venue pays is refused", () => {
  // the venue pays WETH to its caller (0x…01, the adapter); the adapter returns its two named tokens, USDG and OTHER, to
  // the router, and the WETH rests in the adapter, whose clear(token) pays whoever calls it
  const inner = sr02Single(ROUTER_MSG_SENDER)
  const payload = encodeFunctionData({ abi: liveAmountAdapterAbi, functionName: 'callWithLiveAmount', args: [SWAP_ROUTER_02, inner, 132n, TRUSTED.usdg, OTHER] })
  assert.throws(() => checkSwapSteps(swapWith({ target: LIVE_AMOUNT, payload, tokenIn: TRUSTED.usdg, tokenOut: TRUSTED.weth, amountIn: 0n, fund: 0 }), swapAsk, TRUSTED), refused)
})

test("LOW: a LiveAmountAdapter call whose amount offset is its venue call's recipient word is refused", () => {
  // the reader reads the recipient as the router; the adapter then writes the live amount over that word (offset 100,
  // where the amount is at 132), and the venue pays address(amount)
  const inner = sr02Single(TRUSTED.router, 1_000_000n)
  const payload = encodeFunctionData({ abi: liveAmountAdapterAbi, functionName: 'callWithLiveAmount', args: [SWAP_ROUTER_02, inner, 100n, TRUSTED.usdg, TRUSTED.weth] })
  assert.throws(() => checkSwapSteps(swapWith({ target: LIVE_AMOUNT, payload, tokenIn: TRUSTED.usdg, tokenOut: TRUSTED.weth, amountIn: 1_000_000n, fund: 0 }), swapAsk, TRUSTED), refused)
})

test("LOW: address(1) is the caller only to a router that reads it so: to an original-V3 fork it is address(1), and the output is lost", () => {
  const payload = encodeFunctionData({ abi: ORIGINAL_V3, functionName: 'exactInputSingle', args: [{ tokenIn: TRUSTED.usdg, tokenOut: TRUSTED.weth, fee: 500, recipient: ROUTER_MSG_SENDER, deadline: BigInt(NOW + 600), amountIn: 0n, amountOutMinimum: 0n, sqrtPriceLimitX96: 0n }] })
  assert.throws(() => checkSwapSteps(swapWith({ target: SUSHI_V3, payload, tokenIn: TRUSTED.usdg, tokenOut: TRUSTED.weth, amountIn: 0n, fund: 0 }), swapAsk, TRUSTED), refused)
})

// ------------------------------------------------------------------------------------------------------------ Books

const account = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d')
const session = `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: account.address.toLowerCase(), iat: 1, exp: 4_000_000_000 })).toString('base64url')}.x`
const BOOK = getAddress('0x' + 'aa'.repeat(20))
const VAULT = getAddress('0x' + 'bb'.repeat(20))
const NFT = getAddress('0x' + 'dd'.repeat(20))
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
const D = standInDeployment(BOOK_DEPLOYMENTS[0]!)

// a vault trade of dollars for ether whose signed floor is one wei: the route the router runs, paying the vault
const AMOUNT_IN = 10n ** 18n
const DEADLINE = BigInt(NOW + 300)
const dustRoute = executeData({ tokenIn: TRUSTED.usdg, tokenOut: TRUSTED.weth, amountIn: AMOUNT_IN, minAmountOut: 1n, recipient: VAULT, deadline: DEADLINE, feeBps: 2 })

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
      // Uniswap's QuoterV2 on the bot's node: 1,000 units of WETH for the order
      quoteExactInputSingle: () => [1_000n, 0n, 0, 0n],
      ...reads,
    }),
    estimateGas: async () => 100_000n,
    waitForTransactionReceipt: async ({ hash }: { hash: Hex }) => ({ status: 'success', transactionHash: hash, logs: [] }),
  } as unknown as PublicClient
  return mockApi({ 'GET /v1/contracts': () => ({ body: contractsAnswer() }), ...routes }).then((api) => ({
    api, sent, m: new Mancer({ baseUrl: api.url, account, session, trusted: TRUSTED, bookDeployments: [D], publicClient: chain, walletClient: wallet }),
  }))
}

test("MEDIUM: with trustQuote, a vault trade of WETH against USDG is held beside the pool by the floor it signs, not by the API's simulation", async () => {
  // the docs: "With trustQuote, a quote of WETH against USDG is still set beside the Uniswap pool on your node, and
  // refused more than maxDeviationBps under it". The vault path sets the answer's `simulation.amountOut` beside the pool
  // (1,000, level with it) and signs whatever `minOut` says (one wei): the vault's sale has no floor
  const answer = {
    purpose: 'trade', preview: false, adapter: D.adapters.mancer!.address.toLowerCase(), tokenIn: TRUSTED.usdg.toLowerCase(), tokenOut: TRUSTED.weth.toLowerCase(),
    amountIn: AMOUNT_IN.toString(), minOut: '1', route: dustRoute, deadline: DEADLINE.toString(), salt: '5', signature: '0x12', digest: '0x34',
    intent: null, plan: null, simulation: { amountOut: '1000', proposeGas: null, executeGas: null, block: 1 }, vault: VAULT.toLowerCase(),
  }
  const { api, m } = await stand({ 'POST /v1/books/:token/vault-quote': () => ({ body: answer }) })
  try {
    await assert.rejects(m.vaultQuote(BOOK, { purpose: 'trade', tokenIn: TRUSTED.usdg, tokenOut: TRUSTED.weth, amountIn: AMOUNT_IN.toString() }, { trustQuote: true }), refused,
      "a floor of one wei for a sale the bot's own pool prices at 1,000")
  } finally {
    await api.close()
  }
})

test("LOW: a co-trader's pending trade is confirmed only under a floor rule of the bot's own, as a proposal is", async () => {
  // proposeVaultTrade needs minOut, a reference or trustQuote; confirmTrade signs whatever floor the pending trade carries
  const pending = [D.adapters.mancer!.address, TRUSTED.usdg, TRUSTED.weth, AMOUNT_IN, 1n, dustRoute, 3n, DEADLINE, 5n, '0x12'] as const
  const confirm = bookCallData(confirmTradeCall(D, VAULT, { adapter: pending[0], tokenIn: pending[1], tokenOut: pending[2], amountIn: pending[3], minOut: pending[4], route: pending[5], nonce: pending[6], deadline: pending[7], quoteSalt: pending[8], mancerSig: pending[9] }))
  const steps = { ...ready([step('confirmTrade', confirm.to, confirm.data)], { wallet: account.address.toLowerCase() } as never), action: 'confirmTrade', book: { token: BOOK.toLowerCase(), bookId: '7', factory: D.factory.address.toLowerCase(), vault: VAULT.toLowerCase(), phase: 'trading' } }
  const { api, m, sent } = await stand({ 'POST /v1/books/:token/steps': () => ({ body: steps }) }, { pending: () => pending })
  try {
    await assert.rejects(m.bookAct(BOOK, 'confirmTrade'), refused, "the bot confirmed a sale of 1e18 units for one wei")
    assert.equal(sent.length, 0)
  } finally {
    await api.close()
  }
})
