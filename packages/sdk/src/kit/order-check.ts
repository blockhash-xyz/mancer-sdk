// SPDX-License-Identifier: MIT
// Part of Mancer's contracts kit as the SDK uses it, mirrored with the rest of this repository at each release.
import { getAddress, isAddress, type Address, type Hex } from 'viem'
import { ORDER_EIP712_TYPES_V3, ZERO_OCO_GROUP, defaultFillWindowSec } from './orders'

export interface OrderReading {

  contract: Address
  chainId: number
  maker: Address

  spends: { token: Address; perFill: bigint; fills: number; total: bigint }

  receives: { token: Address; atLeastPerFill: bigint; atMostPerFill: bigint | null }

  triggerOutPerFill: bigint | null

  schedule: { everySec: number; fillWindowSec: number; startAt: number; expiry: number }

  maxFeeBps: number
  epoch: Hex
  nonce: bigint

  ocoGroup: Hex | null
}

export interface OrderExpectation {

  contract: Address
  chainId: number
  maker: Address
  tokenIn: Address
  tokenOut: Address
  amountPerFill: bigint
  totalFills: number

  minOutPerFill: bigint

  maxFeeBps: number

  triggerOutPerFill?: bigint

  maxOutPerFill?: bigint

  everySec?: number

  fillWindowSec?: number

  startAt?: number

  expiry?: number

  ocoGroup?: Hex | null

  epoch?: Hex
}

interface TypedOrder {
  domain?: { name?: unknown; version?: unknown; chainId?: unknown; verifyingContract?: unknown; salt?: unknown }
  types?: Record<string, readonly { name: string; type: string }[]>
  primaryType?: unknown
  message?: Record<string, unknown>
}

const BYTES32 = /^0x[0-9a-fA-F]{64}$/

function big(v: unknown): bigint | null {
  if (typeof v === 'bigint') return v >= 0n ? v : null
  if (typeof v === 'number') return Number.isSafeInteger(v) && v >= 0 ? BigInt(v) : null
  if (typeof v === 'string' && /^(0|[1-9]\d*)$/.test(v)) return BigInt(v)
  return null
}

function int(v: unknown): number | null {
  const b = big(v)
  return b !== null && b <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(b) : null
}

function addr(v: unknown): Address | null {
  return typeof v === 'string' && isAddress(v, { strict: false }) ? getAddress(v) : null
}

function same(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}

function isV3OrderType(types: TypedOrder['types']): boolean {
  if (!types || typeof types !== 'object') return false
  const order = types.Order
  const want = ORDER_EIP712_TYPES_V3.Order
  if (!Array.isArray(order) || order.length !== want.length) return false
  if (!order.every((f, i) => f?.name === want[i]!.name && f?.type === want[i]!.type)) return false

  if (!Object.keys(types).every((k) => k === 'Order' || k === 'EIP712Domain')) return false

  const domain = types.EIP712Domain
  if (domain === undefined) return true
  const full = [{ name: 'name', type: 'string' }, { name: 'version', type: 'string' }, { name: 'chainId', type: 'uint256' }, { name: 'verifyingContract', type: 'address' }]
  return Array.isArray(domain) && domain.length === full.length && domain.every((f, i) => f?.name === full[i]!.name && f?.type === full[i]!.type)
}

export function readOrderTypedData(typed: unknown): OrderReading | null {
  if (!typed || typeof typed !== 'object') return null
  const t = typed as TypedOrder
  const d = t.domain
  if (!d || d.name !== 'Mancer Orders' || d.version !== '3' || d.salt !== undefined) return null
  const chainId = int(d.chainId)
  const contract = addr(d.verifyingContract)
  if (chainId === null || !contract) return null
  if (t.primaryType !== 'Order' || !isV3OrderType(t.types)) return null
  const m = t.message
  if (!m || typeof m !== 'object') return null
  const maker = addr(m.maker), tokenIn = addr(m.tokenIn), tokenOut = addr(m.tokenOut)
  const amountPerFill = big(m.amountPerFill), totalFills = int(m.totalFills), everySec = int(m.everySec)
  const fillWindowSec = int(m.fillWindowSec), startAt = int(m.startAt), expiry = int(m.expiry)
  const minOut = big(m.minOutPerFill), trigger = big(m.triggerOutPerFill), maxOut = big(m.maxOutPerFill)
  const maxFeeBps = int(m.maxFeeBps), nonce = big(m.nonce)
  const epoch = typeof m.epoch === 'string' && BYTES32.test(m.epoch) ? (m.epoch.toLowerCase() as Hex) : null
  const group = m.ocoGroup === undefined ? ZERO_OCO_GROUP : typeof m.ocoGroup === 'string' && BYTES32.test(m.ocoGroup) ? (m.ocoGroup.toLowerCase() as Hex) : null
  if (!maker || !tokenIn || !tokenOut || amountPerFill === null || totalFills === null || everySec === null) return null
  if (fillWindowSec === null || startAt === null || expiry === null || minOut === null || trigger === null) return null
  if (maxOut === null || maxFeeBps === null || nonce === null || !epoch || !group) return null
  return {
    contract,
    chainId,
    maker,
    spends: { token: tokenIn, perFill: amountPerFill, fills: totalFills, total: amountPerFill * BigInt(totalFills) },
    receives: { token: tokenOut, atLeastPerFill: minOut, atMostPerFill: maxOut === 0n ? null : maxOut },
    triggerOutPerFill: trigger === 0n ? null : trigger,
    schedule: { everySec, fillWindowSec, startAt, expiry },
    maxFeeBps,
    epoch,
    nonce,
    ocoGroup: same(group, ZERO_OCO_GROUP) ? null : group,
  }
}

export function orderTypedDataMismatch(typed: unknown, e: OrderExpectation): string | null {
  const r = readOrderTypedData(typed)
  if (!r) return 'typed data is not a Mancer Orders V3 order'
  if (r.chainId !== e.chainId) return 'the order is for another chain'
  if (!same(r.contract, e.contract)) return 'the order binds another orders contract'
  if (!same(r.maker, e.maker)) return 'maker is not your wallet'
  if (!same(r.spends.token, e.tokenIn)) return 'tokenIn differs from the token you spend'
  if (!same(r.receives.token, e.tokenOut)) return 'tokenOut differs from the token you receive'
  if (same(r.spends.token, r.receives.token)) return 'the order spends and receives one token'
  if (r.spends.perFill !== e.amountPerFill || r.spends.perFill === 0n) return 'amountPerFill differs from the amount you entered'
  if (r.spends.fills !== e.totalFills || r.spends.fills < 1) return 'totalFills differs from the fills you asked for'
  if (r.receives.atLeastPerFill < e.minOutPerFill) return 'minOutPerFill is below the floor you asked for'
  if ((r.triggerOutPerFill ?? 0n) !== (e.triggerOutPerFill ?? 0n)) return 'the stop trigger differs from the one you set'
  if ((r.receives.atMostPerFill ?? 0n) !== (e.maxOutPerFill ?? 0n)) return 'the price cap differs from the one you set'
  if (r.receives.atMostPerFill !== null && r.receives.atMostPerFill < r.receives.atLeastPerFill) return 'the price cap is under the floor'
  if (r.maxFeeBps > e.maxFeeBps) return 'maxFeeBps exceeds the fee you accept'
  const everySec = e.everySec ?? 0
  if (r.schedule.everySec !== everySec) return 'everySec differs from the schedule you asked for'
  if (r.spends.fills > 1 && r.schedule.everySec === 0) return 'a schedule of several fills has no gap between them'
  const window = e.fillWindowSec ?? (r.spends.fills > 1 ? defaultFillWindowSec(r.schedule.everySec) : 0)
  if (r.schedule.fillWindowSec !== window) return 'fillWindowSec differs from the window you asked for'
  if (r.schedule.startAt !== (e.startAt ?? 0)) return 'startAt differs from the start you asked for'
  if (r.schedule.expiry !== (e.expiry ?? 0)) return 'expiry differs from the expiry you asked for'
  const group = e.ocoGroup ?? null
  if ((r.ocoGroup ?? '') !== (group && !same(group, ZERO_OCO_GROUP) ? group.toLowerCase() : '')) return 'the order is in another one-cancels-the-other group'
  if (e.epoch !== undefined && !same(r.epoch, e.epoch)) return "epoch is not the maker's current epoch"
  return null
}
