import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { getAddress, keccak256, type Address, type Hex, type PublicClient, type WalletClient } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { BOOK_DEPLOYMENTS, type BookDeployment } from '../src/kit/books/deployments'
import { bookCallData, confirmTradeCall } from '../src/kit/books/calls'
import { Mancer, MancerCheckError, SDK_VERSION, checkSwapSteps } from '../src/index'
import type { Quote, ReadySteps } from '../src/generated/openapi'
import { NOW, SIM_OK, TRUSTED, approveData, codeAt, contractsAnswer, executeData, fakeChain, mockApi } from './helpers'

// Round three's floors and the venue table: a vault quote's and a pending trade's signed floor held to the bot's rule, a
// launch route's round-trip allowance sized by the bot's own reference, and the SDK saying when its venue table may be
// behind the router.

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
const AMOUNT_IN = 10n ** 18n
const DEADLINE = BigInt(NOW + 300)
const routeAt = (minOut: bigint) => executeData({ tokenIn: TRUSTED.usdg, tokenOut: TRUSTED.weth, amountIn: AMOUNT_IN, minAmountOut: minOut, recipient: VAULT, deadline: DEADLINE, feeBps: 2 })

async function stand(routes: Parameters<typeof mockApi>[0], reads: Record<string, (args: readonly unknown[]) => unknown> = {}) {
  const sent: unknown[] = []
  const wallet = {
    getChainId: async () => 4663,
    sendTransaction: async (tx: unknown) => {
      sent.push(tx)
      return (`0x${String(sent.length).padStart(64, '0')}`) as Hex
    },
  } as unknown as WalletClient
  const chain = {
    ...fakeChain({
      bookIdOfToken: ([t]) => (String(t).toLowerCase() === BOOK.toLowerCase() ? 7n : 0n),
      bookOf: () => [BOOK, VAULT, NFT],
      quoteExactInputSingle: () => [1_000n, 0n, 0, 0n],
      ...reads,
    }),
    waitForTransactionReceipt: async ({ hash }: { hash: Hex }) => ({ status: 'success', transactionHash: hash, logs: [] }),
  } as unknown as PublicClient
  const api = await mockApi({ 'GET /v1/contracts': () => ({ body: contractsAnswer() }), ...routes })
  return { api, sent, m: new Mancer({ baseUrl: api.url, account, session, trusted: TRUSTED, bookDeployments: [D], publicClient: chain, walletClient: wallet }) }
}

function vaultAnswer(minOut: bigint) {
  return {
    purpose: 'trade', preview: false, adapter: D.adapters.mancer!.address.toLowerCase(), tokenIn: TRUSTED.usdg.toLowerCase(), tokenOut: TRUSTED.weth.toLowerCase(),
    amountIn: AMOUNT_IN.toString(), minOut: minOut.toString(), route: routeAt(minOut), deadline: DEADLINE.toString(), salt: '5', signature: '0x12', digest: '0x34',
    intent: null, plan: null, simulation: { amountOut: '1000', proposeGas: null, executeGas: null, block: 1 }, vault: VAULT.toLowerCase(),
  }
}

test("with trustQuote, a vault quote of WETH against USDG signs a floor within the deviation of the bot's pool, or none", async () => {
  let minOut = 990n
  const { api, m } = await stand({ 'POST /v1/books/:token/vault-quote': () => ({ body: vaultAnswer(minOut) }) })
  const body = { purpose: 'trade' as const, tokenIn: TRUSTED.usdg, tokenOut: TRUSTED.weth, amountIn: AMOUNT_IN.toString() }
  try {
    // the pool on the bot's node pays 1,000: a floor of 990 is 100 bps under it, inside the default 300
    assert.equal((await m.vaultQuote(BOOK, body, { trustQuote: true })).minOut, '990')
    minOut = 960n
    await assert.rejects(m.vaultQuote(BOOK, body, { trustQuote: true }), (e) => e instanceof MancerCheckError && /the floor, 960, is more than 300 bps under the 1000/.test(e.reason))
    assert.equal((await m.vaultQuote(BOOK, body, { trustQuote: true, maxDeviationBps: 500 })).minOut, '960')
  } finally {
    await api.close()
  }
})

test("a co-trader's pending trade is confirmed where its floor meets the bot's rule, and refused under it", async () => {
  let floor = 995n
  const pending = () => [D.adapters.mancer!.address, TRUSTED.usdg, TRUSTED.weth, AMOUNT_IN, floor, routeAt(floor), 3n, DEADLINE, 5n, '0x12'] as const
  const answer = () => {
    const p = pending()
    const c = bookCallData(confirmTradeCall(D, VAULT, { adapter: p[0], tokenIn: p[1], tokenOut: p[2], amountIn: p[3], minOut: p[4], route: p[5], nonce: p[6], deadline: p[7], quoteSalt: p[8], mancerSig: p[9] }))
    return {
      chainId: 4663, wallet: account.address.toLowerCase(), simulation: SIM_OK, readAfter: null,
      steps: [{ kind: 'confirmTrade', to: c.to.toLowerCase(), data: c.data, value: '0', gas: '100000', why: '' }],
      action: 'confirmTrade', book: { token: BOOK.toLowerCase(), bookId: '7', factory: D.factory.address.toLowerCase(), vault: VAULT.toLowerCase(), phase: 'trading' },
    }
  }
  const { api, m, sent } = await stand({ 'POST /v1/books/:token/steps': () => ({ body: answer() }) }, { pending: () => pending() })
  try {
    await assert.rejects(m.bookAct(BOOK, 'confirmTrade'), (e) => e instanceof MancerCheckError && /name the floor/.test(e.reason))
    await m.bookAct(BOOK, 'confirmTrade', { minOut: 990n })
    assert.equal(sent.length, 1)
    floor = 900n
    await assert.rejects(m.bookAct(BOOK, 'confirmTrade', { minOut: 990n }), (e) => e instanceof MancerCheckError && /the signed floor, 900, is under the 990 you named/.test(e.reason))
    await assert.rejects(m.bookAct(BOOK, 'executeTrade', { trustQuote: true }), (e) => e instanceof MancerCheckError && /more than 300 bps under/.test(e.reason))
    assert.equal(sent.length, 1)
  } finally {
    await api.close()
  }
})

/** A Mancer whose launch stack is read as trusted: the stand-in chain holds none of its reviewed code. */
class LaunchStandIn extends Mancer {
  override async trustedLaunchStack() {
    return (await this.trustedContracts()).launch!
  }
}

test("a launch route's round-trip allowance is sized by the bot's own reference, never by the quote's word", async () => {
  const launch = TRUSTED.launch!
  const tx = (kind: 'approval' | 'swap', to: Address, data: Hex) => ({ chain: 'robinhood' as const, chainId: 4663 as const, kind, to, data, value: '0' })
  const envelope = (roundTrip: bigint) => {
    const transactions = [tx('approval', TRUSTED.usdg, approveData(launch.allowanceTarget, 1_000_000n)), tx('approval', TRUSTED.weth, approveData(launch.pads[0]!.adapter, roundTrip)), tx('swap', launch.coordinator, executeData({ feeBps: 2, minAmountOut: 995n }))]
    return {
      quote: {
        amountOut: '100000', quotedAmountOut: '100000', minOut: '995', fee: { bps: 2, side: 'input' }, latencyMs: 1, cached: false,
        tx: { to: launch.coordinator, data: transactions[2]!.data, value: '0', approval: null },
        execution: {
          version: 1, taker: account.address, recipient: account.address, entrypoint: 'launch-coordinator',
          requirements: [
            { kind: 'erc20-allowance', token: TRUSTED.usdg, spender: launch.allowanceTarget, amount: '1000000' },
            { kind: 'erc20-allowance', token: TRUSTED.weth, spender: launch.pads[0]!.adapter, amount: roundTrip.toString() },
          ],
          transactions,
        },
        ready: { chainId: 4663, wallet: account.address.toLowerCase(), simulation: SIM_OK, readAfter: null, steps: transactions.map((t) => ({ kind: t.kind, to: t.to.toLowerCase(), data: t.data, value: '0', gas: '100000', why: '' })) },
      },
    }
  }
  let roundTrip = 1_500n
  const api = await mockApi({ 'GET /v1/contracts': () => ({ body: contractsAnswer() }), 'GET /v1/quote': () => ({ body: envelope(roundTrip) }) })
  try {
    const m = new LaunchStandIn({ baseUrl: api.url, account, session, trusted: TRUSTED, publicClient: fakeChain() })
    const ask = { tokenIn: TRUSTED.usdg, tokenOut: TRUSTED.weth, amountIn: 1_000_000n, reference: async () => 1_000n, maxSlippageBps: 100 }
    // the quote names 100,000 out; the bot's reference names 1,000, so the round trip may reach 2,000
    assert.equal((await m.buildSwap(ask)).minOut, 990n)
    roundTrip = 2_001n
    await assert.rejects(m.buildSwap(ask), (e) => e instanceof MancerCheckError && /round-trip allowance is over the cap/.test(e.reason))
  } finally {
    await api.close()
  }
})

test("a leg to a contract the SDK's venue table does not name says the table may be behind the router, with the SDK's version", () => {
  const ME = getAddress('0x' + '33'.repeat(20))
  const leg = { target: getAddress('0x' + '93'.repeat(20)), payload: '0x12345678' as Hex, tokenIn: TRUSTED.usdg, tokenOut: TRUSTED.weth, amountIn: 0n, fund: 0 }
  const ready: ReadySteps = { chainId: 4663, wallet: ME.toLowerCase(), simulation: SIM_OK as never, readAfter: null, steps: [
    { kind: 'approval', to: TRUSTED.usdg.toLowerCase(), data: approveData(TRUSTED.allowanceTarget, 1_000_000n), value: '0', gas: '1', why: '' },
    { kind: 'swap', to: TRUSTED.router.toLowerCase(), data: executeData({ legs: [leg] }), value: '0', gas: '1', why: '' },
  ] }
  const q = { amountOut: '1000', minOut: '995', fee: { bps: 10 }, latencyMs: 1, cached: false, tx: { to: TRUSTED.router, data: '0x', value: '0', approval: null }, ready } as Quote
  const ask = { wallet: ME, recipient: ME, tokenIn: TRUSTED.usdg, tokenOut: TRUSTED.weth, amountIn: 1_000_000n, nativeIn: false, nativeOut: false, minOut: 990n, maxFeeBps: 10, nowSec: NOW }
  assert.throws(() => checkSwapSteps(q, ask, TRUSTED), (e) => e instanceof MancerCheckError && e.reason.includes(`update @blockhash/mancer-sdk (this is ${SDK_VERSION})`) && /venueTableDrift/.test(e.reason))
})

test("the SDK's version is its package's, and venueTableDrift reads the router through the bot's own node", async () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
  assert.equal(SDK_VERSION, pkg.version)
  const NEW = getAddress('0x' + '92'.repeat(20))
  const chain = {
    getBlockNumber: async () => 50_000_000n,
    getLogs: async ({ event }: { event: { name: string } }) => (event.name === 'CallSet' ? [{ args: { target: NEW, selector: '0xdeadbeef', allowed: true } }] : []),
    readContract: async ({ args }: { args: readonly string[] }) => args.length === 1 || args[1] !== '0xffffffff',
  } as unknown as PublicClient
  const m = new Mancer({ trusted: TRUSTED, publicClient: chain })
  const drift = await m.venueTableDrift()
  assert.deepEqual(drift.unknown, [{ target: NEW, selector: '0xdeadbeef' }])
  assert.equal(m.version, SDK_VERSION)
})
