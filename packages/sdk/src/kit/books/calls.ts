// SPDX-License-Identifier: MIT
// Part of Mancer's contracts kit as the SDK uses it, mirrored with the rest of this repository at each release.
import { encodeFunctionData, type Abi, type Address, type Hex } from 'viem'
import type { OrderMessageV3 } from '../orders'
import { BOOK_ABIS } from './abis'
import { bookAbisFor, type BookDeployment } from './deployments'
import type { BookQuote, BookTradeIntent } from './typed-data'

export interface BookCall {
  address: Address
  abi: Abi
  functionName: string
  args: readonly unknown[]
  value: bigint
}

export function bookCallData(call: BookCall): { to: Address; data: Hex; value: bigint } {
  const data = encodeFunctionData({ abi: call.abi, functionName: call.functionName, args: call.args } as Parameters<typeof encodeFunctionData>[0])
  return { to: call.address, data, value: call.value }
}

function call(address: Address, abi: Abi, functionName: string, args: readonly unknown[], value = 0n): BookCall {
  return { address, abi, functionName, args, value }
}

export interface OpenBookParams {
  name: string
  symbol: string
  traders: readonly Address[]
  durationSecs: number

  lpFeeMode: 0 | 1
  startMcapUsd8: bigint
  gradMcapUsd8: bigint
  startTaxBps: number
  taxDecayPerMinBps: number
  windowSecs: number
  buysOnly: boolean
  bondAfterSecs: number
  guaranteedBond: boolean
  quote: Address
  venue: 0 | 1
  hook: Address
}

export function openBookCall(d: BookDeployment, p: OpenBookParams): BookCall {
  return call(d.factory.address, bookAbisFor(d).factory, 'openBook', [{
    name: p.name, symbol: p.symbol, traders: p.traders, durationSecs: p.durationSecs, lpFeeMode: p.lpFeeMode,
    startMcapUsd8: p.startMcapUsd8, gradMcapUsd8: p.gradMcapUsd8, startTaxBps: p.startTaxBps,
    taxDecayPerMinBps: p.taxDecayPerMinBps, windowSecs: p.windowSecs,
    buysOnly: p.buysOnly, bondAfterSecs: p.bondAfterSecs, guaranteedBond: p.guaranteedBond, quote: p.quote, venue: p.venue, hook: p.hook,
  }])
}

export function armCall(d: BookDeployment, bookId: bigint): BookCall {
  return call(d.pad.address, bookAbisFor(d).pad, 'arm', [bookId])
}

export function abortCall(d: BookDeployment, bookId: bigint): BookCall {
  return call(d.pad.address, bookAbisFor(d).pad, 'abort', [bookId])
}

export function buyEthCall(d: BookDeployment, bookId: bigint, minTokensOut: bigint, recipient: Address, ethIn: bigint): BookCall {
  return call(d.pad.address, bookAbisFor(d).pad, 'buyEth', [bookId, minTokensOut, recipient], ethIn)
}

export function buyCall(d: BookDeployment, bookId: bigint, quoteIn: bigint, minTokensOut: bigint, recipient: Address): BookCall {
  return call(d.pad.address, bookAbisFor(d).pad, 'buy', [bookId, quoteIn, minTokensOut, recipient])
}

export function sellCall(d: BookDeployment, bookId: bigint, tokensIn: bigint, minOut: bigint, payWith: 'eth' | 'quote'): BookCall {
  return call(d.pad.address, bookAbisFor(d).pad, payWith === 'eth' ? 'sellEth' : 'sell', [bookId, tokensIn, minOut])
}

export function graduateCall(d: BookDeployment, bookId: bigint): BookCall {
  return call(d.pad.address, bookAbisFor(d).pad, 'graduate', [bookId])
}

export function bondCall(d: BookDeployment, bookId: bigint): BookCall {
  return call(d.pad.address, bookAbisFor(d).pad, 'bond', [bookId])
}

function intentArg(intent: BookTradeIntent) {
  return {
    adapter: intent.adapter, tokenIn: intent.tokenIn, tokenOut: intent.tokenOut, amountIn: intent.amountIn, minOut: intent.minOut,
    nonce: intent.nonce, deadline: intent.deadline, route: intent.route, quoteSalt: intent.quoteSalt, mancerSig: intent.mancerSig,
  }
}

export function proposeTradeCall(d: BookDeployment, vault: Address, intent: BookTradeIntent): BookCall {
  return call(vault, bookAbisFor(d).account, 'proposeTrade', [intentArg(intent)])
}

export function confirmTradeCall(d: BookDeployment, vault: Address, intent: BookTradeIntent): BookCall {
  return call(vault, bookAbisFor(d).account, 'confirmTrade', [intentArg(intent)])
}

export function executeTradeCall(d: BookDeployment, vault: Address): BookCall {
  return call(vault, bookAbisFor(d).account, 'executeTrade', [])
}

export interface BookOrderIntentArg {
  spender: Address
  order: OrderMessageV3
  nonce: bigint
  deadline: bigint
  quoteSalt: bigint
  mancerSig: Hex
}

export function proposeOrderCall(d: BookDeployment, vault: Address, intent: BookOrderIntentArg): BookCall {
  return call(vault, bookAbisFor(d).account, 'proposeOrder', [intent])
}

export function confirmOrderCall(d: BookDeployment, vault: Address, intent: BookOrderIntentArg): BookCall {
  return call(vault, bookAbisFor(d).account, 'confirmOrder', [intent])
}

export function cancelOrderCall(d: BookDeployment, vault: Address, spender: Address, orderHash: Hex): BookCall {
  return call(vault, bookAbisFor(d).account, 'cancelOrder', [spender, orderHash])
}

export function revokeOrdersCall(d: BookDeployment, vault: Address): BookCall {
  return call(vault, bookAbisFor(d).account, 'revokeOrders', [])
}

export function revokeAllowanceCall(d: BookDeployment, vault: Address, spender: Address, token: Address): BookCall {
  return call(vault, bookAbisFor(d).account, 'revokeAllowance', [spender, token])
}

export function syncTrackedCall(d: BookDeployment, vault: Address, tokens: readonly Address[]): BookCall {
  return call(vault, bookAbisFor(d).account, 'syncTracked', [tokens])
}

export function syncTaxCall(d: BookDeployment, vault: Address): BookCall {
  return call(vault, bookAbisFor(d).account, 'syncTax', [])
}

export function stakeCall(d: BookDeployment, bookId: bigint, amount: bigint): BookCall {
  return call(d.lpFees.address, bookAbisFor(d).lpFees, 'stake', [bookId, amount])
}

export function unstakeCall(d: BookDeployment, bookId: bigint, amount: bigint): BookCall {
  return call(d.lpFees.address, bookAbisFor(d).lpFees, 'unstake', [bookId, amount])
}

export function claimFeesCall(d: BookDeployment, bookId: bigint): BookCall {
  return call(d.lpFees.address, bookAbisFor(d).lpFees, 'claim', [bookId])
}

export function harvestCall(d: BookDeployment, bookId: bigint): BookCall {
  return call(d.lpFees.address, bookAbisFor(d).lpFees, 'harvest', [bookId])
}

export function sweepUnownedCall(d: BookDeployment, bookId: bigint): BookCall {
  return call(d.lpFees.address, bookAbisFor(d).lpFees, 'sweepUnowned', [bookId])
}

function quoteArg(q: BookQuote) {
  return { adapter: q.adapter, tokenIn: q.tokenIn, tokenOut: q.tokenOut, amountIn: q.amountIn, minOut: q.minOut, route: q.route, deadline: q.deadline, salt: q.salt, signature: q.signature }
}

export function liquidateCall(d: BookDeployment, bookId: bigint, quotes: readonly BookQuote[]): BookCall {
  return call(d.settler.address, bookAbisFor(d).settler, 'liquidate', [bookId, quotes.map(quoteArg)])
}

export function sweepLeftoverCall(d: BookDeployment, bookId: bigint, q: BookQuote): BookCall {
  return call(d.settler.address, bookAbisFor(d).settler, 'sweepLeftover', [bookId, quoteArg(q)])
}

export function redeemCall(d: BookDeployment, bookId: bigint, amount: bigint): BookCall {
  return call(d.settler.address, bookAbisFor(d).settler, 'redeem', [bookId, amount])
}

export function claimCreatorCutCall(d: BookDeployment, bookId: bigint): BookCall {
  return call(d.settler.address, bookAbisFor(d).settler, 'claimCreatorCut', [bookId])
}

export function claimCloseFeeCall(d: BookDeployment, recipient: Address): BookCall {
  return call(d.settler.address, bookAbisFor(d).settler, 'claimCloseFee', [recipient])
}

export function approveCall(token: Address, spender: Address, amount: bigint): BookCall {
  return call(token, BOOK_ABIS.books.bookToken, 'approve', [spender, amount])
}
