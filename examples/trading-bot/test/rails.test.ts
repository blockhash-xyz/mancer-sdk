// The agent's rails with the offline stub: a proposal over each rail is refused and nothing is built or sent, and one
// within them reaches the build with its exact amount and, in a dry run, is signed by nobody.
// Run: npm test
import test from 'node:test'
import assert from 'node:assert/strict'
import { parseEther, parseUnits } from 'viem'
import { Mancer, MancerCheckError, checkSwapSteps, pinnedContracts, type BuiltSwap } from '@blockhash/mancer-sdk'
import { proposeSwapTool, stubProposal } from '../model'
import { floorRule } from '../reference'
import { runRound, type Build, type Ledger, type Rails, type RoundDeps, type Trade, type WalletView } from '../rails'

const WALLET = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as const
const USDG = '0x5fc5360d0400a0fd4f2af552add042d716f1d168' as const
const MANCER = '0xc72f232a6869e6cf34dc06129affd07f8a2a246a' as const
const NOW = Date.UTC(2026, 9, 30, 12)
const HOUR = 3_600_000

// 1 ETH and 1,000 USDG worth 0.4 ETH: the wallet is worth 1.4 ETH, so a trade may be 0.028 ETH and a day's 0.14
const wallet: WalletView = {
  eth: parseEther('1'),
  tokens: [
    { symbol: 'USDG', address: USDG, balance: parseUnits('1000', 6), valueWei: parseEther('0.4') },
    { symbol: 'MANCER', address: MANCER, balance: 0n, valueWei: 0n },
  ],
}
const rails: Rails = { maxTradeBps: 200, dailyCapBps: 1_000, maxImpactBps: 100, slippageBps: 50, gasFloorWei: parseEther('0.002') }

/** A build as `buildSwap` returns one (its quote's price impact, its steps checked and simulated), and the bot's own
 * measure of its impact in the reference pool. */
const builtWith = (impact: number | undefined, referenceImpactBps: number | null = 3): Build => ({
  built: {
    quote: { amountOut: '1000000', fee: { bps: 2 }, latencyMs: 1, cached: false, ...(impact === undefined ? {} : { priceImpactBps: impact }) },
    minOut: 995_000n,
    checked: { steps: [{ kind: 'swap' }], simulation: { ok: true, block: 1 }, readings: [] },
  } as unknown as BuiltSwap,
  referenceImpactBps,
})

/** One round with the stub's proposal: what reached the build, and the result. */
async function round(proposal: unknown, over: Partial<RoundDeps> = {}) {
  const built: Trade[] = []
  const lines: string[] = []
  const result = await runRound({
    propose: stubProposal(JSON.stringify(proposal)),
    tokens: ['USDG', 'MANCER'],
    wallet,
    ledger: [],
    rails,
    nowMs: NOW,
    build: async (t) => {
      built.push(t)
      return builtWith(12)
    },
    send: null,
    log: (l) => lines.push(l),
    ...over,
  })
  return { result, built, lines }
}

const buy = (shareBps: number) => ({ token: 'USDG', side: 'buy', shareBps, reason: 'test' })

test('propose_swap offers only the tokens the bot lists', () => {
  const tool = proposeSwapTool(['USDG', 'MANCER'])
  assert.deepEqual(tool.input_schema.properties.token.enum, ['USDG', 'MANCER'])
  assert.equal(tool.input_schema.additionalProperties, false)
})

test('a token the bot does not list is refused', async () => {
  const r = await round({ token: 'PEPE', side: 'buy', shareBps: 10, reason: 'it is trending' })
  assert.equal(r.result.outcome, 'refused')
  assert.equal(r.result.outcome === 'refused' && r.result.refusal.rail, 'what it buys')
  assert.equal(r.built.length, 0, 'nothing was asked of Mancer')
})

test('a proposal outside the tool’s schema is refused', async () => {
  for (const bad of [{ ...buy(0) }, { ...buy(10), amountWei: '1' }, { ...buy(10), side: 'short' }, null]) {
    const r = await round(bad)
    assert.equal(r.result.outcome === 'refused' && r.result.refusal.rail, 'schema', JSON.stringify(bad))
    assert.equal(r.built.length, 0)
  }
})

test('a trade over the largest trade is refused', async () => {
  // 500 bps of the 0.998 ETH above the gas floor is 0.0499 ETH, over 2% of 1.4 ETH
  const r = await round(buy(500))
  assert.equal(r.result.outcome === 'refused' && r.result.refusal.rail, 'largest trade')
  assert.equal(r.built.length, 0)
})

test('a trade past the daily cap is refused, and a trade older than a day does not count', async () => {
  // 0.135 ETH traded in the last day and 0.00998 more passes 10% of 1.4 ETH
  const today: Ledger = [{ at: NOW - 2 * HOUR, valueWei: parseEther('0.135').toString() }]
  const r = await round(buy(100), { ledger: today })
  assert.equal(r.result.outcome === 'refused' && r.result.refusal.rail, 'daily cap')
  assert.equal(r.built.length, 0)
  const yesterday: Ledger = [{ at: NOW - 25 * HOUR, valueWei: parseEther('0.135').toString() }]
  assert.equal((await round(buy(100), { ledger: yesterday })).result.outcome, 'dry-run')
})

test('a wallet under its gas floor trades nothing', async () => {
  const poor = { ...wallet, eth: parseEther('0.001') }
  assert.equal(((await round(buy(100), { wallet: poor })).result as { refusal: { rail: string } }).refusal.rail, 'gas floor')
  const sale = { token: 'USDG', side: 'sell', shareBps: 100, reason: 'take profit' }
  assert.equal(((await round(sale, { wallet: poor })).result as { refusal: { rail: string } }).refusal.rail, 'gas floor')
})

test('a build over the price impact rail by either measure, or by neither, is refused and not sent', async () => {
  // the quote's own measure over the rail; the reference pool's over it while the quote names none or less; no measure at all
  for (const [impact, own] of [[250, 3], [undefined, 180], [12, 180], [undefined, null]] as const) {
    let sends = 0
    const r = await round(buy(100), { build: async () => builtWith(impact, own), send: async () => { sends++; return [] } })
    assert.equal(r.result.outcome === 'refused' && r.result.refusal.rail, 'price impact', `${impact} ${own}`)
    assert.equal(sends, 0, 'nothing was signed')
  }
})

test('a build whose simulation fails is refused by the SDK’s own check, and not sent', async () => {
  const trusted = pinnedContracts(4663)!
  let sends = 0
  const r = await round(buy(100), {
    // the SDK's check of a swap's steps, on steps whose simulation reverted
    build: async (t) => {
      checkSwapSteps({
        amountOut: '1', fee: { bps: 2 }, latencyMs: 1, cached: false,
        ready: {
          chainId: 4663, wallet: WALLET.toLowerCase() as `0x${string}`, readAfter: null,
          steps: [{ kind: 'swap', to: trusted.router, data: '0x', value: t.amountIn.toString(), gas: null, why: 'the swap' }],
          simulation: { ok: false, block: 101_900_000, timestamp: 1, revert: { step: 0, kind: 'swap', error: 'TooLittleReceived', selector: null, args: [], message: 'reverted' } },
        },
      } as never, { wallet: WALLET, recipient: WALLET, tokenIn: trusted.weth, tokenOut: USDG, amountIn: t.amountIn, nativeIn: true, nativeOut: false, minOut: 1n, maxFeeBps: 2 }, trusted)
      throw new Error('unreachable: the check passed a failed simulation')
    },
    send: async () => { sends++; return [] },
  })
  assert.equal(r.result.outcome === 'refused' && r.result.refusal.rail, 'simulation')
  assert.match(r.result.outcome === 'refused' ? r.result.refusal.why : '', /TooLittleReceived/)
  assert.equal(sends, 0)
})

test('a proposal within every rail reaches the build with its exact amount, and a dry run signs nothing', async () => {
  const ledger: Ledger = []
  const r = await round(buy(100), { ledger })
  assert.equal(r.result.outcome, 'dry-run')
  assert.equal(r.built.length, 1)
  // 100 bps of the ether above the 0.002 floor
  assert.equal(r.built[0]!.amountIn, (parseEther('1') - parseEther('0.002')) / 100n)
  assert.equal(r.built[0]!.tokenIn, 'ETH')
  assert.equal(r.built[0]!.tokenOut, USDG)
  assert.equal(ledger.length, 0, 'a dry run books nothing against the daily cap')
  // a sale: a share of the token held, valued by its quote
  const s = await round({ token: 'USDG', side: 'sell', shareBps: 500, reason: 'trim' })
  assert.equal(s.result.outcome, 'dry-run')
  assert.equal(s.built[0]!.amountIn, parseUnits('50', 6))
  assert.equal(s.built[0]!.valueWei, parseEther('0.02'))
})

test('a sent trade is booked against the daily cap', async () => {
  const ledger: Ledger = []
  const r = await round(buy(100), { ledger, send: async () => ['0xabc'] })
  assert.equal(r.result.outcome, 'sent')
  assert.deepEqual(ledger, [{ at: NOW, valueWei: ((parseEther('1') - parseEther('0.002')) / 100n).toString() }])
})

test('a pair no pool prices names no floor of the API’s unless TRUST_QUOTE=1 says so', async () => {
  // a node on which no Uniswap V3 pool of the pair answers
  const mancer = new Mancer({ publicClient: { simulateContract: async () => { throw new Error('no pool') } } as never })
  await assert.rejects(floorRule(mancer, MANCER, 'ETH', 10n ** 18n, 50, false), (e) => e instanceof MancerCheckError && e.check === 'reference')
  const trusted = await floorRule(mancer, MANCER, 'ETH', 10n ** 18n, 50, true)
  assert.deepEqual(trusted.rule, { trustQuote: true })
  // a pool that answers names a reference with the operator's slippage, never trustQuote
  const priced = new Mancer({ publicClient: { simulateContract: async () => ({ result: [5n * 10n ** 14n, 0n, 0, 0n] }) } as never })
  const rule = (await floorRule(priced, MANCER, 'ETH', 10n ** 18n, 50, true)).rule
  assert.equal(rule.maxSlippageBps, 50)
  assert.equal(typeof rule.reference, 'function')
  assert.equal(rule.trustQuote, undefined)
})

test('a trade the bot’s own reference cannot price is refused: no floor is taken on the API’s word', async () => {
  // a sale of a holding nothing on the bot's node prices
  const unpriced = { ...wallet, tokens: [{ symbol: 'USDG', address: USDG, balance: parseUnits('1000', 6), valueWei: null }] }
  const s = await round({ token: 'USDG', side: 'sell', shareBps: 100, reason: 'trim' }, { wallet: unpriced })
  assert.equal(s.result.outcome === 'refused' && s.result.refusal.rail, 'reference')
  assert.equal(s.built.length, 0)
  // a build whose floor no reference sets (agent.ts throws this where TRUST_QUOTE is not 1)
  const b = await round(buy(100), { build: async () => { throw new MancerCheckError('reference', 'no Uniswap V3 pool prices the trade') } })
  assert.equal(b.result.outcome === 'refused' && b.result.refusal.rail, 'reference')
})
