// SPDX-License-Identifier: MIT
// Part of Mancer's contracts kit as the SDK uses it, mirrored with the rest of this repository at each release.
import { decodeFunctionData, zeroAddress, type Address, type Hex } from 'viem'
import { mancerRouterAbi } from '../abi'
import { BOOK_SHARED, bookAbisFor, bookPadKind, bookSettlesInChosenAsset, type BookDeployment } from './deployments'
import type { BookCall } from './calls'
import type { BookQuote } from './typed-data'

function same(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}

export interface BookTx {
  to: Address
  data: Hex
  value: bigint
}

export interface CurveCallExpectation {
  deployment: Pick<BookDeployment, 'abiSet' | 'pad'>
  bookId: bigint

  quote: Address
  side: 'buy' | 'sell'

  payWith: 'eth' | 'quote'

  wallet: Address

  amountIn: bigint

  minOut: bigint
}

export function curveCallMismatch(tx: BookTx, e: CurveCallExpectation): string | null {
  if (!same(tx.to, e.deployment.pad.address)) return "not this Book's pad"
  if (e.payWith === 'eth' && !same(e.quote, BOOK_SHARED.weth)) return "this Book's base pair is not ETH"
  let d: { functionName: string; args?: readonly unknown[] }
  try {
    d = decodeFunctionData({ abi: bookAbisFor(e.deployment).pad, data: tx.data })
  } catch {
    return 'calldata is not a raise trade'
  }
  const args = (d.args ?? []) as readonly unknown[]
  if (e.side === 'buy') {
    if (e.payWith === 'eth') {
      if (d.functionName !== 'buyEth') return 'not an ETH buy on the curve'
      const [bookId, minTokensOut, recipient] = args as [bigint, bigint, Address]
      if (bookId !== e.bookId) return 'a different Book'
      if (!same(recipient, e.wallet)) return 'recipient is not your wallet'
      if (minTokensOut < e.minOut) return 'floor is below the minimum shown'
      if (minTokensOut === 0n) return 'floor is zero'
      if (tx.value !== e.amountIn) return 'value does not equal the ETH amount'
      return null
    }
    if (d.functionName !== 'buy') return "not a buy in this Book's base pair"
    const [bookId, quoteIn, minTokensOut, recipient] = args as [bigint, bigint, bigint, Address]
    if (bookId !== e.bookId) return 'a different Book'
    if (quoteIn !== e.amountIn) return 'amount differs from the amount you entered'
    if (!same(recipient, e.wallet)) return 'recipient is not your wallet'
    if (minTokensOut < e.minOut) return 'floor is below the minimum shown'
    if (minTokensOut === 0n) return 'floor is zero'
    if (tx.value !== 0n) return 'call carries ETH for a buy in the base pair'
    return null
  }
  const want = e.payWith === 'eth' ? 'sellEth' : 'sell'
  if (d.functionName !== want) return e.payWith === 'eth' ? 'not a sale for ETH on the curve' : "not a sale for this Book's base pair on the curve"
  const [bookId, tokensIn, minOut, recipient] = args as [bigint, bigint, bigint, Address | undefined]
  if (bookId !== e.bookId) return 'a different Book'
  if (tokensIn !== e.amountIn) return 'amount differs from the amount you entered'
  if (minOut < e.minOut) return 'floor is below the minimum shown'
  if (minOut === 0n) return 'floor is zero'
  if (bookPadKind(e.deployment) === 'claims' && (recipient === undefined || !same(recipient, e.wallet))) return 'recipient is not your wallet'
  if (tx.value !== 0n) return 'call carries ETH for a sale'
  return null
}

const erc20Approve = [{
  type: 'function', name: 'approve', stateMutability: 'nonpayable',
  inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }],
}] as const

export function approvalCallMismatch(tx: BookTx, e: { token: Address; spender: Address; amount: bigint }): string | null {
  if (!same(tx.to, e.token)) return 'not an approval of the token shown'
  if (tx.value !== 0n) return 'an approval carries ETH'
  let d: { functionName: string; args?: readonly unknown[] }
  try {
    d = decodeFunctionData({ abi: erc20Approve, data: tx.data })
  } catch {
    return 'calldata is not an approval'
  }
  const [spender, amount] = (d.args ?? []) as readonly [Address, bigint]
  if (!same(spender, e.spender)) return 'the approval is to another spender'
  if (amount !== e.amount) return 'the approval is not for the exact amount'
  return null
}

export function bookCallMismatch(tx: BookTx, call: BookCall): string | null {
  if (!same(tx.to, call.address)) return 'not the contract shown'
  if (tx.value !== call.value) return 'the ether carried differs from what was shown'
  let d: { functionName: string; args?: readonly unknown[] }
  try {
    d = decodeFunctionData({ abi: call.abi, data: tx.data })
  } catch {
    return `calldata is not ${call.functionName}`
  }
  if (d.functionName !== call.functionName) return `calldata is not ${call.functionName}`
  if (!sameValue(d.args ?? [], call.args)) return `${call.functionName}'s arguments differ from what was shown`
  return null
}

const HEX_VALUE = /^0x[0-9a-fA-F]*$/

function sameValue(a: unknown, b: unknown): boolean {
  if (typeof a === 'string' && typeof b === 'string') return HEX_VALUE.test(a) && HEX_VALUE.test(b) ? a.toLowerCase() === b.toLowerCase() : a === b
  if ((typeof a === 'bigint' || typeof a === 'number') && (typeof b === 'bigint' || typeof b === 'number')) return BigInt(a) === BigInt(b)
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((x, i) => sameValue(x, b[i]))
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keys = Object.keys(b as Record<string, unknown>)
    if (keys.length !== Object.keys(a as Record<string, unknown>).length) return false
    return keys.every((k) => sameValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
  }
  return a === b
}

const ROUTER_MAX_LEGS = 16
const ROUTER_FEE_CAP_BPS = 100
const EXECUTE_SELECTOR = '0x85e6ff1e'

export interface VaultRouteExpectation {
  vault: Address
  bookToken: Address
  tokenIn: Address
  tokenOut: Address
  amountIn: bigint

  minOut: bigint

  deadline: bigint

  maxLegs?: number

  maxRouteBytes?: number
}

export function vaultRouteMismatch(route: Hex, e: VaultRouteExpectation): string | null {
  if (!/^0x(?:[0-9a-fA-F]{2})*$/.test(route)) return 'route is not hex'
  if (route.slice(0, 10).toLowerCase() !== EXECUTE_SELECTOR) return 'route is not a MancerRouter execute call'
  if (e.maxRouteBytes !== undefined && (route.length - 2) / 2 > e.maxRouteBytes) return 'route is longer than this Book allows'
  let d: { functionName: string; args?: readonly unknown[] }
  try {
    d = decodeFunctionData({ abi: mancerRouterAbi, data: route })
  } catch {
    return 'route is not a MancerRouter execute call'
  }
  if (d.functionName !== 'execute') return 'route is not a MancerRouter execute call'
  const p = (d.args as readonly [{
    tokenIn: Address; tokenOut: Address; amountIn: bigint; minAmountOut: bigint; recipient: Address; deadline: bigint
    feeBps: number; feeMode: number; feeAsset: Address; legs: readonly { tokenIn: Address; tokenOut: Address }[]
  }])[0]
  if (same(p.tokenIn, zeroAddress)) return 'the plan spends native ether'
  if (same(p.tokenOut, zeroAddress)) return 'the plan pays out native ether'
  if (!same(p.tokenIn, e.tokenIn)) return 'tokenIn differs from the quote'
  if (!same(p.tokenOut, e.tokenOut)) return 'tokenOut differs from the quote'
  if (p.amountIn !== e.amountIn) return 'amountIn differs from the quote'
  if (!same(p.recipient, e.vault)) return 'recipient is not the vault'
  if (e.minOut === 0n || p.minAmountOut === 0n) return 'floor is zero'
  if (p.minAmountOut < e.minOut) return "on-chain floor is below the quote's"
  if (p.deadline !== e.deadline) return 'deadline differs from the signed deadline'
  if (p.feeBps > ROUTER_FEE_CAP_BPS) return "fee exceeds the router's cap"
  const maxLegs = Math.min(e.maxLegs ?? ROUTER_MAX_LEGS, ROUTER_MAX_LEGS)
  if (p.legs.length === 0 || p.legs.length > ROUTER_MAX_LEGS) return 'plan has an impossible leg count'
  if (p.legs.length > maxLegs) return 'plan has more legs than this Book allows'
  if (same(p.tokenIn, e.bookToken) || same(p.tokenOut, e.bookToken)) return 'the plan trades the Book token'
  if (same(p.feeAsset, e.bookToken)) return 'the plan takes its fee in the Book token'
  for (const leg of p.legs) {
    if (same(leg.tokenIn, e.bookToken) || same(leg.tokenOut, e.bookToken)) return 'a leg trades the Book token'
  }
  return null
}

export interface LiquidationCallExpectation {
  deployment: BookDeployment
  bookId: bigint
  bookToken: Address
  quotes: readonly BookQuote[]

  asset?: Address
}

export function liquidationCallMismatch(tx: BookTx, e: LiquidationCallExpectation): string | null {
  const dep = e.deployment
  if (!same(tx.to, dep.settler.address)) return "not this Book's settler"
  if (tx.value !== 0n) return 'call carries ETH'
  let d: { functionName: string; args?: readonly unknown[] }
  try {
    d = decodeFunctionData({ abi: bookAbisFor(dep).settler, data: tx.data })
  } catch {
    return 'calldata is not a liquidation'
  }
  if (d.functionName !== 'liquidate') return 'calldata is not a liquidation'
  const args = (d.args ?? []) as readonly unknown[]
  if (args[0] !== e.bookId) return 'a different Book'
  const mancer = dep.adapters.mancer?.address
  if (!mancer) return 'the deployment lists no Mancer adapter'
  const asset = e.asset ?? BOOK_SHARED.weth
  if (!same(asset, BOOK_SHARED.weth) && !bookSettlesInChosenAsset(dep)) return 'this settler settles every Book in WETH'
  const quotes = args[1] as readonly BookQuote[]
  if (quotes.length !== e.quotes.length) return 'not the sales shown'
  for (let i = 0; i < quotes.length; i++) {
    const q = quotes[i]!
    const shown = e.quotes[i]!
    if (!same(q.adapter, mancer)) return 'a sale is not on the Mancer adapter'
    if (!same(q.tokenOut, asset)) return same(asset, BOOK_SHARED.weth) ? 'a sale does not pay WETH' : "a sale does not pay the Book's settlement asset"
    if (same(q.tokenIn, asset) || same(q.tokenIn, e.bookToken)) return same(asset, BOOK_SHARED.weth) ? 'a sale sells WETH or the Book token' : "a sale sells the Book's settlement asset or the Book token"
    if (q.minOut === 0n) return 'a sale has no floor'
    if (
      !same(q.adapter, shown.adapter) || !same(q.tokenIn, shown.tokenIn) || !same(q.tokenOut, shown.tokenOut)
      || q.amountIn !== shown.amountIn || q.minOut !== shown.minOut || q.route.toLowerCase() !== shown.route.toLowerCase()
      || q.deadline !== shown.deadline || q.salt !== shown.salt || q.signature.toLowerCase() !== shown.signature.toLowerCase()
    ) return 'a sale differs from the one shown'
  }
  return null
}
