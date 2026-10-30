// A price the bot can justify without Mancer's word, read through the bot's own RPC: the floor rule every swap and
// vault trade names to the SDK. Ether against the dollar is the SDK's own `poolReference()` (Uniswap V3's WETH/USDG pool);
// any other pair is the best of Uniswap V3's fee tiers by its QuoterV2. A pair no pool prices is refused, unless the
// operator's TRUST_QUOTE=1 lets Mancer's own quote set the floor. An API that answered a wrong quote is then a build the
// SDK refuses, never a swap at a wrong price.
import { parseAbi, type Address } from 'viem'
import { ETH, MancerCheckError, WETH_USDG_POOL_FEE, type FloorRule, type Mancer, type ReferenceFn, type TokenRef } from '@blockhash/mancer-sdk'
import { show } from './tokens'

/** Uniswap V3's QuoterV2 on Robinhood Chain. */
const QUOTER_V2 = '0x33e885eD0Ec9bF04EcfB19341582aADCb4c8A9E7' as const
const QUOTER_ABI = parseAbi([
  'struct QuoteExactInputSingleParams { address tokenIn; address tokenOut; uint256 amountIn; uint24 fee; uint160 sqrtPriceLimitX96; }',
  'function quoteExactInputSingle(QuoteExactInputSingleParams params) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
])
const FEE_TIERS = [100, 500, 3_000, 10_000] as const

/** A pair's reference: the function the SDK asks, what it last answered, and the pool it read. */
export interface Reference {
  fn: ReferenceFn
  /** Which pool: `the SDK's poolReference (Uniswap V3's 0.01% WETH/USDG pool)` and the like. */
  label: () => string
  /** The fee tier it read, in hundredths of a basis point. */
  fee: number | null
  /** What it last said the output should be. */
  last: bigint | null
}

const tokenOf = (mancer: Mancer, t: TokenRef): Address => (t === ETH ? mancer.pinned.weth : t)
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

/** One fee tier's quote on the bot's node, or null where no pool of the tier fills the amount. */
async function tierOut(mancer: Mancer, a: Address, b: Address, amountIn: bigint, fee: number): Promise<bigint | null> {
  try {
    const { result } = await mancer.publicClient.simulateContract({ address: QUOTER_V2, abi: QUOTER_ABI, functionName: 'quoteExactInputSingle', args: [{ tokenIn: a, tokenOut: b, amountIn, fee, sqrtPriceLimitX96: 0n }] })
    return result[0] > 0n ? result[0] : null
  } catch {
    return null
  }
}

/** The pair's reference on the bot's own node. */
export function referenceFor(mancer: Mancer, tokenIn: TokenRef, tokenOut: TokenRef): Reference {
  const a = tokenOf(mancer, tokenIn), b = tokenOf(mancer, tokenOut)
  const { weth, usdg } = mancer.pinned
  const hub = (same(a, weth) && same(b, usdg)) || (same(a, usdg) && same(b, weth))
  const ref: Reference = {
    fee: hub ? WETH_USDG_POOL_FEE : null,
    last: null,
    label: () => (hub ? "the SDK's poolReference, Uniswap V3's 0.01% WETH/USDG pool" : `Uniswap V3's ${(ref.fee ?? 0) / 10_000}% pool of the pair`),
    fn: async (q) => {
      if (hub) return (ref.last = await mancer.poolReference()(q))
      const outs = await Promise.all(FEE_TIERS.map(async (fee) => ({ fee, out: await tierOut(mancer, q.tokenIn, q.tokenOut, q.amountIn, fee) })))
      const best = outs.reduce<{ fee: number; out: bigint } | null>((m, o) => (o.out !== null && (!m || o.out > m.out) ? { fee: o.fee, out: o.out } : m), null)
      if (!best) throw new MancerCheckError('reference', "no Uniswap V3 pool prices the pair on this node: name a floor of your own, or set TRUST_QUOTE=1 to take Mancer's quote")
      ref.fee = best.fee
      return (ref.last = best.out)
    },
  }
  return ref
}

/** The floor rule a trade names, and a line saying what set it, read once the SDK has asked the reference. */
export async function floorRule(mancer: Mancer, tokenIn: TokenRef, tokenOut: TokenRef, amountIn: bigint, slippageBps: number, trustQuote: boolean): Promise<{ rule: FloorRule; ref: Reference | null; why: () => Promise<string> }> {
  const ref = referenceFor(mancer, tokenIn, tokenOut)
  const priced = await ref.fn({ tokenIn: tokenOf(mancer, tokenIn), tokenOut: tokenOf(mancer, tokenOut), amountIn }).then(() => true, (e) => {
    if (!trustQuote) throw e
    return false
  })
  if (priced) return { rule: { reference: ref.fn, maxSlippageBps: slippageBps }, ref, why: async () => `${ref.label()}, which pays ${await show(mancer, tokenOut, ref.last ?? 0n)} on this node, less ${slippageBps} bps` }
  return { rule: { trustQuote: true }, ref: null, why: async () => `Mancer's quote less ${slippageBps} bps, which TRUST_QUOTE=1 allows` }
}

/** What the order's size costs in the reference's own pool, in basis points: its rate set beside a thousandth's. */
export async function referenceImpactBps(mancer: Mancer, tokenIn: TokenRef, tokenOut: TokenRef, amountIn: bigint, ref: Reference): Promise<number | null> {
  if (ref.fee === null || ref.last === null) return null
  const slice = amountIn / 1_000n > 0n ? amountIn / 1_000n : 1n
  const small = await tierOut(mancer, tokenOf(mancer, tokenIn), tokenOf(mancer, tokenOut), slice, ref.fee)
  if (!small) return null
  const bps = 10_000n - (ref.last * slice * 10_000n) / (small * amountIn)
  return Number(bps > 0n ? bps : 0n)
}
