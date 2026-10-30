// The agent's rails: what a model's proposal must pass before anything reaches Mancer, and what its build must pass
// before anything is signed. The numbers are the operator's (config.ts), never the model's. No fetch and no chain here:
// the round's reads and acts are handed in, so a test runs it with stand-ins.
import { formatEther } from 'viem'
import { MancerCheckError, type BuiltSwap, type TokenRef } from '@blockhash/mancer-sdk'

export interface Rails {
  /** The most one trade may be worth, in basis points of the wallet's value. */
  maxTradeBps: number
  /** The most the last 24 hours' trades and this one may be worth together, in basis points of the wallet's value. */
  dailyCapBps: number
  /** The most price impact a build may carry; a build that carries no measure is refused too. */
  maxImpactBps: number
  slippageBps: number
  /** The least ether the wallet keeps for gas, in wei. */
  gasFloorWei: bigint
}

/** What the wallet holds, valued in ether wei, each token at what its whole balance sells for now by the bot's own
 * reference; null where no reference prices it. */
export interface WalletView {
  eth: bigint
  tokens: { symbol: string; address: `0x${string}`; balance: bigint; valueWei: bigint | null }[]
}

/** `propose_swap` as the docs' AI agents page defines it. */
export interface Proposal {
  token: string
  side: 'buy' | 'sell'
  shareBps: number
  reason: string
}

/** A trade a proposal passed the rails as: the amounts in raw units, from the wallet's own balances. */
export interface Trade {
  tokenIn: TokenRef
  tokenOut: TokenRef
  amountIn: bigint
  valueWei: bigint
  proposal: Proposal
}

export type Refusal = { rail: string; why: string }
export type Ledger = { at: number; valueWei: string }[]

const DAY_MS = 86_400_000
const eth = (wei: bigint) => `${formatEther(wei)} ETH`

/** The model's answer read as a proposal, or why it is none: a token from the list, a side, a share, a reason. */
export function readProposal(input: unknown, tokens: readonly string[]): Proposal | Refusal {
  const p = input as Partial<Proposal> | null
  if (!p || typeof p !== 'object') return { rail: 'schema', why: 'the model proposed nothing' }
  const extra = Object.keys(p).filter((k) => !['token', 'side', 'shareBps', 'reason'].includes(k))
  if (extra.length) return { rail: 'schema', why: `the proposal names fields the tool has not: ${extra.join(', ')}` }
  if (typeof p.token !== 'string' || !tokens.includes(p.token)) return { rail: 'what it buys', why: `${String(p.token)} is not one of ${tokens.join(', ')}` }
  if (p.side !== 'buy' && p.side !== 'sell') return { rail: 'schema', why: 'the side is buy or sell' }
  if (!Number.isInteger(p.shareBps) || p.shareBps! < 1 || p.shareBps! > 10_000) return { rail: 'schema', why: 'shareBps is a whole number of 1 to 10,000' }
  if (typeof p.reason !== 'string' || p.reason.length > 280) return { rail: 'schema', why: 'the reason is one sentence of 280 characters at most' }
  return p as Proposal
}

/** The rails on a proposal, before Mancer is asked for anything: its size, the day's total and the gas floor. */
export function checkProposal(p: Proposal, w: WalletView, ledger: Ledger, rails: Rails, nowMs: number): Trade | Refusal {
  const token = w.tokens.find((t) => t.symbol === p.token)
  if (!token) return { rail: 'what it buys', why: `${p.token} is not in the wallet's view` }
  if (p.side === 'sell' && token.valueWei === null) return { rail: 'reference', why: `nothing on the bot's node prices its ${p.token}, so no rail can size the sale` }
  const worth = w.eth + w.tokens.reduce((sum, t) => sum + (t.valueWei ?? 0n), 0n)
  const share = (x: bigint) => (x * BigInt(p.shareBps)) / 10_000n
  // a buy spends a share of the ether the wallet can spend above its gas floor; a sale, a share of the token held
  const spendable = w.eth > rails.gasFloorWei ? w.eth - rails.gasFloorWei : 0n
  const trade: Trade = p.side === 'buy'
    ? { tokenIn: 'ETH', tokenOut: token.address, amountIn: share(spendable), valueWei: share(spendable), proposal: p }
    : { tokenIn: token.address, tokenOut: 'ETH', amountIn: share(token.balance), valueWei: share(token.valueWei ?? 0n), proposal: p }
  if (trade.amountIn <= 0n) return { rail: p.side === 'buy' ? 'gas floor' : 'holdings', why: p.side === 'buy' ? 'no ether above the gas floor' : `the wallet holds no ${p.token}` }
  if (p.side === 'sell' && w.eth < rails.gasFloorWei) return { rail: 'gas floor', why: 'the wallet holds less ether than its gas floor' }
  const most = (worth * BigInt(rails.maxTradeBps)) / 10_000n
  if (trade.valueWei > most) return { rail: 'largest trade', why: `worth ${eth(trade.valueWei)}, over ${rails.maxTradeBps / 100}% of the wallet's ${eth(worth)} (${eth(most)})` }
  const today = ledger.filter((e) => nowMs - e.at < DAY_MS).reduce((sum, e) => sum + BigInt(e.valueWei), 0n)
  const cap = (worth * BigInt(rails.dailyCapBps)) / 10_000n
  if (today + trade.valueWei > cap) return { rail: 'daily cap', why: `${eth(today)} traded in 24 hours, and ${eth(trade.valueWei)} more passes ${rails.dailyCapBps / 100}% of the wallet (${eth(cap)})` }
  return trade
}

/** A build, and the bot's own measure of its price impact: what its size costs in the reference's own pool. */
export interface Build {
  built: BuiltSwap
  referenceImpactBps: number | null
}

/** The rails on a build, before it is signed: its price impact, the larger of the quote's own measure and the bot's; a
 * build neither measures is refused. The SDK has already held its steps to the trade asked and refused a failed simulation. */
export function checkBuild(b: Build, rails: Rails): Refusal | null {
  const measures = [b.built.quote.priceImpactBps, b.referenceImpactBps].filter((x): x is number => typeof x === 'number')
  if (!measures.length) return { rail: 'price impact', why: "neither the quote nor the bot's reference measures it" }
  const impact = Math.max(...measures)
  if (impact > rails.maxImpactBps) return { rail: 'price impact', why: `${impact} bps, over the ${rails.maxImpactBps} bps rail` }
  return null
}

export interface RoundDeps {
  propose: () => Promise<unknown>
  tokens: readonly string[]
  wallet: WalletView
  ledger: Ledger
  rails: Rails
  nowMs: number
  /** Mancer's build at the bot's own floor, checked by the SDK (`mancer.buildSwap` with `minOut`), and the bot's own
   * measure of its price impact. */
  build: (t: Trade) => Promise<Build>
  /** Signs and sends a build's steps; null for a dry run. */
  send: ((built: BuiltSwap) => Promise<string[]>) | null
  log: (line: string) => void
}

export type RoundResult =
  | { outcome: 'refused'; refusal: Refusal; proposal: Proposal | null }
  | { outcome: 'dry-run' | 'sent'; trade: Trade; built: BuiltSwap; hashes: string[] }

/** One round: the model proposes, the rails check, Mancer builds, the SDK checks and simulates, the rails check the build,
 * and only then is anything signed. Each refusal is a reason the model can be told. */
export async function runRound(d: RoundDeps): Promise<RoundResult> {
  const read = readProposal(await d.propose(), d.tokens)
  if ('rail' in read) return refused(d, read, null)
  d.log(`the model proposes: ${read.side} ${read.token} with ${read.shareBps} bps of the holding, "${read.reason.slice(0, 280)}"`)
  const trade = checkProposal(read, d.wallet, d.ledger, d.rails, d.nowMs)
  if ('rail' in trade) return refused(d, trade, read)
  d.log(`the rails pass it: worth ${eth(trade.valueWei)}, inside the largest trade (${d.rails.maxTradeBps / 100}%), the daily cap (${d.rails.dailyCapBps / 100}%) and the gas floor`)
  let b: Build
  try {
    b = await d.build(trade)
  } catch (e) {
    if (e instanceof MancerCheckError) return refused(d, { rail: ['simulation', 'reference'].includes(e.check) ? e.check : `the SDK's ${e.check} check`, why: e.reason }, read)
    throw e
  }
  const built = b.built
  const sim = built.checked.simulation
  d.log(`Mancer built it: ${built.checked.steps.length} step${built.checked.steps.length === 1 ? '' : 's'}, simulated from the wallet at block ${sim.block}; the SDK held them to the trade and the floor`)
  const wrong = checkBuild(b, d.rails)
  if (wrong) return refused(d, wrong, read)
  const bps = (x: number | null | undefined) => (typeof x === 'number' ? `${x} bps` : 'unmeasured')
  d.log(`price impact: ${bps(built.quote.priceImpactBps)} by the quote, ${bps(b.referenceImpactBps)} in the bot's reference pool, inside the ${d.rails.maxImpactBps} bps rail`)
  if (!d.send) {
    d.log('dry run: nothing signed (AGENT_SEND=1 signs and sends)')
    return { outcome: 'dry-run', trade, built, hashes: [] }
  }
  const hashes = await d.send(built)
  d.ledger.push({ at: d.nowMs, valueWei: trade.valueWei.toString() })
  return { outcome: 'sent', trade, built, hashes }
}

function refused(d: RoundDeps, refusal: Refusal, proposal: Proposal | null): RoundResult {
  d.log(`refused by the ${refusal.rail} rail: ${refusal.why}`)
  return { outcome: 'refused', refusal, proposal }
}
