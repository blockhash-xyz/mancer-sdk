import { getAddress, type Address, type PublicClient } from 'viem'
import type { TrustedContracts } from './contracts'
import { MancerCheckError } from './errors'
import { MAINNET_UNISWAP_V3, quoterV2Abi } from './shared'

/**
 * Where a signed floor comes from: never from the API's word alone unless the caller chose it. A swap, a vault quote, a
 * proposal and a confirmation of a vault trade, and a signed sweep each name one rule, and the floor they sign is held to
 * it. Within that floor a hostile or wrong quote can still route through a pool that pays the floor and no more: the
 * floor is the boundary, so it comes from a price the caller trusts.
 */

/** What an order's output should be, by a price the caller trusts: raw units of `tokenOut` for `amountIn`. */
export type ReferenceFn = (q: { tokenIn: Address; tokenOut: Address; amountIn: bigint }) => Promise<bigint>

/**
 * Name exactly one:
 * - `minOut`: a floor of your own, in raw units of the output;
 * - `reference` with `maxSlippageBps`: a function of yours that says what the output should be, and how far under it
 *   the floor may sit (`poolReference()` reads one from a Uniswap pool on your own node);
 * - `trustQuote: true`: the floor is Mancer's own. A wrong quote is then a wrong floor. For WETH against USDG the SDK
 *   still sets the floor beside a Uniswap pool on your own node, and refuses one more than `maxDeviationBps` under it.
 */
export interface FloorRule {
  minOut?: bigint
  reference?: ReferenceFn
  /** How far under the reference the floor may sit, in basis points. */
  maxSlippageBps?: number
  trustQuote?: true
  /** With `trustQuote`, how far under your node's pool a WETH/USDG floor may sit. Default 300. */
  maxDeviationBps?: number
}

const BPS = 10_000n
/** The fee tier of the deepest Uniswap V3 pool of WETH against USDG on Robinhood Chain (0x52e65b17…): `poolReference`'s. */
export const WETH_USDG_POOL_FEE = 100
/** With `trustQuote`, how far under the pool a WETH/USDG floor may sit unless the caller names another bound. */
export const DEFAULT_MAX_DEVIATION_BPS = 300

/** Which floor rule is named, or a refusal where none is, or more than one. */
export function floorKind(r: FloorRule, check: string): 'minOut' | 'reference' | 'trust' {
  const named = (r.minOut !== undefined ? 1 : 0) + (r.reference !== undefined ? 1 : 0) + (r.trustQuote !== undefined ? 1 : 0)
  if (named === 0) {
    throw new MancerCheckError(check, "name the floor: minOut, a reference with maxSlippageBps, or trustQuote: true. A floor from the API's word alone is never signed unless you choose it")
  }
  if (named > 1) throw new MancerCheckError(check, 'name one of minOut, reference and trustQuote')
  if (r.maxDeviationBps !== undefined && (!Number.isInteger(r.maxDeviationBps) || r.maxDeviationBps < 1 || r.maxDeviationBps > 5_000)) {
    throw new MancerCheckError(check, 'maxDeviationBps is a whole number of 1 to 5,000')
  }
  if (r.minOut !== undefined) {
    if (typeof r.minOut !== 'bigint' || r.minOut <= 0n) throw new MancerCheckError(check, 'minOut is raw units above zero')
    return 'minOut'
  }
  if (r.reference !== undefined) {
    if (typeof r.reference !== 'function') throw new MancerCheckError(check, 'a reference is a function that names the output it expects')
    if (!Number.isInteger(r.maxSlippageBps) || r.maxSlippageBps! < 1 || r.maxSlippageBps! > 5_000) throw new MancerCheckError(check, 'a reference names maxSlippageBps, a whole number of 1 to 5,000')
    return 'reference'
  }
  if (r.trustQuote !== true) throw new MancerCheckError(check, 'trustQuote is true or absent')
  return 'trust'
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

export function isWethUsdg(q: { tokenIn: Address; tokenOut: Address }, t: Pick<TrustedContracts, 'weth' | 'usdg'>): boolean {
  return (same(q.tokenIn, t.weth) && same(q.tokenOut, t.usdg)) || (same(q.tokenIn, t.usdg) && same(q.tokenOut, t.weth))
}

/** What the deepest Uniswap V3 WETH/USDG pool pays for an order, by Uniswap's QuoterV2 at its pinned address, read on the
 * caller's own node. */
export async function wethUsdgPoolOut(chain: Pick<PublicClient, 'readContract'>, t: Pick<TrustedContracts, 'weth' | 'usdg'>, q: { tokenIn: Address; tokenOut: Address; amountIn: bigint }): Promise<bigint> {
  if (!isWethUsdg(q, t)) throw new MancerCheckError('reference', 'poolReference prices WETH against USDG alone: name a reference of your own for this pair')
  if (q.amountIn <= 0n) throw new MancerCheckError('reference', 'amountIn is above zero')
  const [out] = (await chain.readContract({
    address: getAddress(MAINNET_UNISWAP_V3.quoterV2),
    abi: quoterV2Abi,
    functionName: 'quoteExactInputSingle',
    args: [{ tokenIn: getAddress(q.tokenIn), tokenOut: getAddress(q.tokenOut), amountIn: q.amountIn, fee: WETH_USDG_POOL_FEE, sqrtPriceLimitX96: 0n }],
  })) as readonly [bigint, bigint, number, bigint]
  if (typeof out !== 'bigint' || out <= 0n) throw new MancerCheckError('reference', 'the Uniswap pool on your node pays nothing for that order')
  return out
}

/** The floor a rule names before the API is asked, with the reference's own answer: the caller's `minOut`, or the
 * reference's answer less its slippage; null for `trustQuote`, whose floor is the quote's. */
export async function namedFloor(check: string, rule: FloorRule, q: { tokenIn: Address; tokenOut: Address; amountIn: bigint }): Promise<{ floor: bigint; reference: bigint | null } | null> {
  const kind = floorKind(rule, check)
  if (kind === 'minOut') return { floor: rule.minOut!, reference: null }
  if (kind === 'trust') return null
  const want = await rule.reference!({ tokenIn: q.tokenIn, tokenOut: q.tokenOut, amountIn: q.amountIn })
  if (typeof want !== 'bigint' || want <= 0n) throw new MancerCheckError(check, 'the reference names no output above zero')
  const floor = (want * (BPS - BigInt(rule.maxSlippageBps!))) / BPS
  if (floor <= 0n) throw new MancerCheckError(check, 'the floor under the reference is zero')
  return { floor, reference: want }
}

/** With `trustQuote`, the floor a quote names for WETH against USDG set beside the pool on the caller's node: under it by
 * more than `maxDeviationBps` is refused. Every other pair's floor is the quote's word, as the caller chose. */
export async function floorBesidePool(
  check: string,
  rule: FloorRule,
  chain: Pick<PublicClient, 'readContract'>,
  t: Pick<TrustedContracts, 'weth' | 'usdg'>,
  q: { tokenIn: Address; tokenOut: Address; amountIn: bigint },
  floor: bigint,
): Promise<void> {
  if (!isWethUsdg(q, t)) return
  const pool = await wethUsdgPoolOut(chain, t, q)
  const most = BigInt(rule.maxDeviationBps ?? DEFAULT_MAX_DEVIATION_BPS)
  if (floor * BPS < pool * (BPS - most)) throw new MancerCheckError(check, `the floor, ${floor}, is more than ${most} bps under the ${pool} the Uniswap pool on your node pays`)
}

/** A signed floor (a vault trade's `minOut`, a pending trade's, a sweep's) held to the rule the caller named: at least
 * the floor it names, or with `trustQuote` beside the pool. */
export async function holdSignedFloor(
  check: string,
  rule: FloorRule,
  chain: Pick<PublicClient, 'readContract'>,
  t: Pick<TrustedContracts, 'weth' | 'usdg'>,
  q: { tokenIn: Address; tokenOut: Address; amountIn: bigint },
  signed: bigint,
): Promise<void> {
  if (signed <= 0n) throw new MancerCheckError(check, 'the signed floor is zero')
  const named = await namedFloor(check, rule, q)
  if (named) {
    if (signed < named.floor) throw new MancerCheckError(check, `the signed floor, ${signed}, is under the ${named.floor} you named`)
    return
  }
  await floorBesidePool(check, rule, chain, t, q, signed)
}
