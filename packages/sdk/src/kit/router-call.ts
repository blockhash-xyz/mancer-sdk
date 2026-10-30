// SPDX-License-Identifier: MIT
// Part of Mancer's contracts kit as the SDK uses it, mirrored with the rest of this repository at each release.
import { decodeFunctionData, zeroAddress, type Address, type Hex } from 'viem'
import { mancerRouterAbi } from './abi'

export interface RouterCallExpectation {

  tokenIn: Address

  tokenOut: Address
  amountIn: bigint

  recipient: Address

  minOut: bigint
  nativeIn: boolean
  nativeOut: boolean

  value: bigint

  maxFeeBps?: number

  maxDeadlineSec?: number

  nowSec?: number
}

const MAX_PLAN_LEGS = 16
const ROUTER_FEE_CAP_BPS = 100
const DEFAULT_MAX_DEADLINE_SEC = 3_600

function same(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}

export function routerCallMismatch(data: Hex, e: RouterCallExpectation): string | null {
  let decoded: ReturnType<typeof decodeFunctionData<typeof mancerRouterAbi>>
  try {
    decoded = decodeFunctionData({ abi: mancerRouterAbi, data })
  } catch {
    return 'calldata is not a Mancer router call'
  }
  const now = e.nowSec ?? Math.floor(Date.now() / 1000)
  const wantIn = e.nativeIn ? zeroAddress : e.tokenIn
  const wantOut = e.nativeOut ? zeroAddress : e.tokenOut
  const feeCap = Math.min(e.maxFeeBps ?? ROUTER_FEE_CAP_BPS, ROUTER_FEE_CAP_BPS)
  const valueOk = e.nativeIn ? e.value === e.amountIn : e.value === 0n
  if (!valueOk) return e.nativeIn ? 'value does not equal the ETH amount' : 'call carries ETH for a token swap'

  const common = (s: {
    tokenIn: Address
    tokenOut: Address
    amountIn: bigint
    minAmountOut: bigint
    recipient: Address
    deadline: bigint
    feeBps: number
  }): string | null => {
    if (!same(s.tokenIn, wantIn)) return 'tokenIn differs from the token you spend'
    if (!same(s.tokenOut, wantOut)) return 'tokenOut differs from the token you receive'
    if (s.amountIn !== e.amountIn) return 'amountIn differs from the amount you entered'
    if (!(same(s.recipient, e.recipient) || same(s.recipient, zeroAddress))) return 'recipient is not your wallet'
    if (s.minAmountOut < e.minOut) return 'on-chain floor is below the minimum shown'
    if (s.minAmountOut === 0n) return 'on-chain floor is zero'
    if (s.deadline <= BigInt(now)) return 'deadline has already passed'
    if (s.deadline > BigInt(now + (e.maxDeadlineSec ?? DEFAULT_MAX_DEADLINE_SEC))) return 'deadline too far in the future'
    if (s.feeBps > feeCap) return 'fee exceeds the disclosed cap'
    return null
  }

  if (decoded.functionName === 'execute') {
    const p = decoded.args[0]
    const why = common(p)
    if (why) return why
    if (p.legs.length === 0 || p.legs.length > MAX_PLAN_LEGS) return 'plan has an impossible leg count'
    return null
  }
  if (decoded.functionName === 'swap') {
    return common(decoded.args[0])
  }
  if (decoded.functionName === 'swapVia') {
    return common(decoded.args[0])
  }
  return 'calldata is not a swap'
}

export interface RouterCallReading {

  entry: 'execute' | 'swap' | 'swapVia'

  spends: { token: Address | null; amount: bigint }

  delivers: { token: Address | null; atLeast: bigint }

  recipient: Address | 'sender'

  deadline: bigint

  fee: { bps: number; side: 'input' | 'output' | 'mid'; asset: Address | null }

  legs: number
  targets: Address[]
}

const FEE_SIDES = ['input', 'output', 'mid'] as const
const nativeOrToken = (a: Address): Address | null => (same(a, zeroAddress) ? null : a)

export function decodeRouterCall(data: Hex): RouterCallReading | null {
  let decoded: ReturnType<typeof decodeFunctionData<typeof mancerRouterAbi>>
  try {
    decoded = decodeFunctionData({ abi: mancerRouterAbi, data })
  } catch {
    return null
  }
  const recipientOf = (r: Address): Address | 'sender' => (same(r, zeroAddress) ? 'sender' : r)
  if (decoded.functionName === 'execute') {
    const p = decoded.args[0]
    const side = FEE_SIDES[p.feeMode]
    if (!side) return null
    const asset = side === 'input' ? p.tokenIn : side === 'output' ? p.tokenOut : p.feeAsset
    return {
      entry: 'execute',
      spends: { token: nativeOrToken(p.tokenIn), amount: p.amountIn },
      delivers: { token: nativeOrToken(p.tokenOut), atLeast: p.minAmountOut },
      recipient: recipientOf(p.recipient),
      deadline: p.deadline,
      fee: { bps: p.feeBps, side, asset: nativeOrToken(asset) },
      legs: p.legs.length,
      targets: p.legs.map((l) => l.target),
    }
  }
  if (decoded.functionName === 'swap') {
    const s = decoded.args[0]
    const side = s.feeOnOutput ? 'output' : 'input'
    return {
      entry: 'swap',
      spends: { token: nativeOrToken(s.tokenIn), amount: s.amountIn },
      delivers: { token: nativeOrToken(s.tokenOut), atLeast: s.minAmountOut },
      recipient: recipientOf(s.recipient),
      deadline: s.deadline,
      fee: { bps: s.feeBps, side, asset: nativeOrToken(s.feeOnOutput ? s.tokenOut : s.tokenIn) },
      legs: 1,
      targets: [s.target],
    }
  }
  if (decoded.functionName === 'swapVia') {
    const s = decoded.args[0]
    return {
      entry: 'swapVia',
      spends: { token: nativeOrToken(s.tokenIn), amount: s.amountIn },
      delivers: { token: nativeOrToken(s.tokenOut), atLeast: s.minAmountOut },
      recipient: recipientOf(s.recipient),
      deadline: s.deadline,
      fee: { bps: s.feeBps, side: 'mid', asset: nativeOrToken(s.cash) },
      legs: 2,
      targets: [s.targetA, s.targetB],
    }
  }
  return null
}

export function checkRouterCall(data: Hex, e: RouterCallExpectation): { reading: RouterCallReading | null; mismatch: string | null } {
  return { reading: decodeRouterCall(data), mismatch: routerCallMismatch(data, e) }
}
