// SPDX-License-Identifier: MIT
// Part of Mancer's contracts kit as the SDK uses it, mirrored with the rest of this repository at each release.
import type { Address, Hex, TypedDataDomain } from 'viem'
import { keccak256, toBytes } from 'viem'

export interface MancerOrderV2 {
  maker: Address
  tokenIn: Address
  tokenOut: Address

  amountPerFill: string
  totalFills: number

  everySec: number

  startAt: number

  expiry: number

  minOutPerFill: string

  triggerOutPerFill: string

  maxOutPerFill: string

  maxFeeBps: number

  epoch: string

  nonce: string

  ocoGroup?: Hex
}

export interface MancerOrderV3 extends Omit<MancerOrderV2, 'epoch'> {
  fillWindowSec: number
  epoch: Hex
}

export type MancerOrder = MancerOrderV2 | MancerOrderV3

export const ZERO_OCO_GROUP = `0x${'0'.repeat(64)}` as Hex

export type OrderStatus = 'open' | 'filled' | 'cancelled' | 'expired'

export type OrderExecutorBlockerCode =
  | 'market-data'
  | 'no-route'
  | 'reference-price'
  | 'price-impact'
  | 'unpriceable'
  | 'uneconomic'
  | 'simulation'

  | 'pool-fee'

  | 'sell-blocked'

  | 'maker-funds'

  | 'floor'

  | 'better-route'

  | 'search-incomplete'

export interface OrderExecutorBlocker {
  code: OrderExecutorBlockerCode
  message: string
  observedAt: number

  poolFeeBps?: number
  amountOut?: string
  referenceOut?: string
  marginalOut?: string
  maxImpactPct?: number
  referenceAgeSec?: number
  feeUsd?: number
  gasUsd?: number
  minimumFeeUsd?: number

  barOut?: string
}

export interface OrderRecord {
  hash: Hex

  contract: Address
  maker: Address
  order: MancerOrder
  signature: Hex
  createdAt: number
  status: OrderStatus

  fillsDone: number

  executionsDone?: number
  nextDueAt: number

  executorBlocker?: OrderExecutorBlocker | null

  ocoGroup?: string | null
}

export const ORDER_EIP712_TYPES = {
  Order: [
    { name: 'maker', type: 'address' },
    { name: 'tokenIn', type: 'address' },
    { name: 'tokenOut', type: 'address' },
    { name: 'amountPerFill', type: 'uint128' },
    { name: 'totalFills', type: 'uint32' },
    { name: 'everySec', type: 'uint32' },
    { name: 'startAt', type: 'uint40' },
    { name: 'expiry', type: 'uint40' },
    { name: 'minOutPerFill', type: 'uint128' },
    { name: 'triggerOutPerFill', type: 'uint128' },
    { name: 'maxOutPerFill', type: 'uint128' },
    { name: 'maxFeeBps', type: 'uint16' },
    { name: 'epoch', type: 'uint64' },
    { name: 'nonce', type: 'uint256' },
    { name: 'ocoGroup', type: 'bytes32' },
  ],
} as const

export const ORDER_EIP712_TYPES_V3 = {
  Order: [
    { name: 'maker', type: 'address' },
    { name: 'tokenIn', type: 'address' },
    { name: 'tokenOut', type: 'address' },
    { name: 'amountPerFill', type: 'uint128' },
    { name: 'totalFills', type: 'uint32' },
    { name: 'everySec', type: 'uint32' },
    { name: 'fillWindowSec', type: 'uint32' },
    { name: 'startAt', type: 'uint40' },
    { name: 'expiry', type: 'uint40' },
    { name: 'minOutPerFill', type: 'uint128' },
    { name: 'triggerOutPerFill', type: 'uint128' },
    { name: 'maxOutPerFill', type: 'uint128' },
    { name: 'maxFeeBps', type: 'uint16' },
    { name: 'epoch', type: 'bytes32' },
    { name: 'nonce', type: 'uint256' },
    { name: 'ocoGroup', type: 'bytes32' },
  ],
} as const

export const ORDER_EIP712_TYPES_V1 = {
  Order: [
    { name: 'maker', type: 'address' },
    { name: 'tokenIn', type: 'address' },
    { name: 'tokenOut', type: 'address' },
    { name: 'amountPerFill', type: 'uint128' },
    { name: 'totalFills', type: 'uint32' },
    { name: 'everySec', type: 'uint32' },
    { name: 'startAt', type: 'uint40' },
    { name: 'expiry', type: 'uint40' },
    { name: 'minOutPerFill', type: 'uint128' },
    { name: 'triggerOutPerFill', type: 'uint128' },
    { name: 'maxOutPerFill', type: 'uint128' },
    { name: 'maxFeeBps', type: 'uint16' },
    { name: 'epoch', type: 'uint64' },
    { name: 'nonce', type: 'uint256' },
  ],
} as const

export type OrdersGeneration = 'v1' | 'v2' | 'v3'

const orderTypeString = (fields: readonly { name: string; type: string }[]) =>
  `Order(${fields.map((f) => `${f.type} ${f.name}`).join(',')})`

export const ORDER_TYPEHASH_V1: Hex = keccak256(toBytes(orderTypeString(ORDER_EIP712_TYPES_V1.Order)))
export const ORDER_TYPEHASH_V2: Hex = keccak256(toBytes(orderTypeString(ORDER_EIP712_TYPES.Order)))
export const ORDER_TYPEHASH_V3: Hex = keccak256(toBytes(orderTypeString(ORDER_EIP712_TYPES_V3.Order)))

export function ordersGenerationForTypehash(typehash: string): OrdersGeneration | null {
  const h = typehash.toLowerCase()
  if (h === ORDER_TYPEHASH_V3) return 'v3'
  if (h === ORDER_TYPEHASH_V2) return 'v2'
  if (h === ORDER_TYPEHASH_V1) return 'v1'
  return null
}

export function orderTypesFor(gen: OrdersGeneration) {
  if (gen === 'v3') return ORDER_EIP712_TYPES_V3
  return gen === 'v2' ? ORDER_EIP712_TYPES : ORDER_EIP712_TYPES_V1
}

export function ordersDomain(chainId: number, verifyingContract: Address): TypedDataDomain {
  return { name: 'Mancer Orders', version: '1', chainId, verifyingContract }
}

export function ordersDomainV3(chainId: number, verifyingContract: Address): TypedDataDomain {
  return { name: 'Mancer Orders', version: '3', chainId, verifyingContract }
}

export function ordersDomainFor(gen: OrdersGeneration, chainId: number, verifyingContract: Address): TypedDataDomain {
  return gen === 'v3' ? ordersDomainV3(chainId, verifyingContract) : ordersDomain(chainId, verifyingContract)
}

export function isMancerOrderV3(o: MancerOrder): o is MancerOrderV3 {
  return Object.prototype.hasOwnProperty.call(o, 'fillWindowSec')
}

export function defaultFillWindowSec(everySec: number): number {
  if (!Number.isInteger(everySec) || everySec <= 0) return 0
  return Math.min(everySec, Math.max(30, Math.min(300, Math.floor((everySec * 2) / 5))))
}

export interface V3SchedulePosition {

  open: boolean

  nextDueAt: number

  fillableNow: boolean

  scheduledSlotsDone: number
}

export function v3SchedulePosition(
  o: MancerOrderV3,
  state: { fillsDone: number; nextDueAt: number; cancelled?: boolean },
  nowSec: number,
): V3SchedulePosition {
  const done = Math.max(0, Math.trunc(state.fillsDone))
  const start = Math.max(0, Math.trunc(o.startAt))
  const persistedDue = Math.max(0, Math.trunc(state.nextDueAt))
  if (state.cancelled || done >= o.totalFills || (o.expiry !== 0 && nowSec > o.expiry)) {
    return { open: false, nextDueAt: 0, fillableNow: false, scheduledSlotsDone: done }
  }
  let due = persistedDue !== 0 ? persistedDue : start
  if (o.expiry !== 0 && due > o.expiry) {
    return { open: false, nextDueAt: 0, fillableNow: false, scheduledSlotsDone: done }
  }
  if (nowSec < due) {
    return { open: true, nextDueAt: due, fillableNow: false, scheduledSlotsDone: done }
  }
  if (o.totalFills === 1 || due === 0) {
    return { open: true, nextDueAt: due, fillableNow: true, scheduledSlotsDone: done }
  }

  const elapsed = Math.floor((nowSec - due) / o.everySec)
  const slots = 1 + elapsed
  const remaining = o.totalFills - done
  if (slots > remaining) {
    return { open: false, nextDueAt: 0, fillableNow: false, scheduledSlotsDone: o.totalFills }
  }
  const currentSlotAt = due + elapsed * o.everySec
  if (nowSec - currentSlotAt >= o.fillWindowSec) {
    const nextWindowAt = currentSlotAt + o.everySec
    if (slots === remaining || (o.expiry !== 0 && nextWindowAt > o.expiry)) {
      return { open: false, nextDueAt: 0, fillableNow: false, scheduledSlotsDone: done + slots }
    }
    return {
      open: true,
      nextDueAt: nextWindowAt,
      fillableNow: false,
      scheduledSlotsDone: done + slots,
    }
  }
  return {
    open: true,
    nextDueAt: currentSlotAt,
    fillableNow: true,
    scheduledSlotsDone: done + elapsed,
  }
}

export function orderToAbi(o: MancerOrderV2) {
  return {
    maker: o.maker,
    tokenIn: o.tokenIn,
    tokenOut: o.tokenOut,
    amountPerFill: BigInt(o.amountPerFill),
    totalFills: o.totalFills,
    everySec: o.everySec,
    startAt: o.startAt,
    expiry: o.expiry,
    minOutPerFill: BigInt(o.minOutPerFill),
    triggerOutPerFill: BigInt(o.triggerOutPerFill),
    maxOutPerFill: BigInt(o.maxOutPerFill ?? '0'),
    maxFeeBps: o.maxFeeBps,
    epoch: BigInt(o.epoch),
    nonce: BigInt(o.nonce),
    ocoGroup: (o.ocoGroup && /^0x[0-9a-fA-F]{64}$/.test(o.ocoGroup) ? o.ocoGroup : ZERO_OCO_GROUP) as Hex,
  } as const
}

export function orderToAbiV3(o: MancerOrderV3) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(o.epoch)) throw new Error('V3 order epoch must be bytes32')
  return {
    maker: o.maker,
    tokenIn: o.tokenIn,
    tokenOut: o.tokenOut,
    amountPerFill: BigInt(o.amountPerFill),
    totalFills: o.totalFills,
    everySec: o.everySec,
    fillWindowSec: o.fillWindowSec,
    startAt: o.startAt,
    expiry: o.expiry,
    minOutPerFill: BigInt(o.minOutPerFill),
    triggerOutPerFill: BigInt(o.triggerOutPerFill),
    maxOutPerFill: BigInt(o.maxOutPerFill ?? '0'),
    maxFeeBps: o.maxFeeBps,
    epoch: o.epoch,
    nonce: BigInt(o.nonce),
    ocoGroup: (o.ocoGroup && /^0x[0-9a-fA-F]{64}$/.test(o.ocoGroup) ? o.ocoGroup : ZERO_OCO_GROUP) as Hex,
  } as const
}

export type OrderMessageV2 = ReturnType<typeof orderToAbi>
export type OrderMessageV1 = Omit<OrderMessageV2, 'ocoGroup'>
export type OrderMessageV3 = ReturnType<typeof orderToAbiV3>
export function orderMessageFor(o: MancerOrder, gen: OrdersGeneration): OrderMessageV1 | OrderMessageV2 | OrderMessageV3 {
  if (gen === 'v3') {
    if (!isMancerOrderV3(o)) throw new Error('V3 order requires fillWindowSec and bytes32 epoch')
    return orderToAbiV3(o)
  }
  if (isMancerOrderV3(o)) throw new Error('legacy order cannot carry the V3 tuple')
  const m = orderToAbi(o)
  if (gen === 'v2') return m
  const { ocoGroup: _unsigned, ...v1 } = m
  return v1
}

export function orderToAbiFor(o: MancerOrder, gen: OrdersGeneration): OrderMessageV1 | OrderMessageV2 | OrderMessageV3 {
  return orderMessageFor(o, gen)
}

export function cancelOrdersMessage(
  hashes: string[],
  chainId: number,
  contract: string,
  issuedAtSec: number,
): string {
  const n = hashes.length
  return [
    `mancer.xyz wants to cancel ${n === 1 ? 'an order' : `${n} orders`}.`,
    '',
    ...hashes.map((h) => `Order: ${h.toLowerCase()}`),
    `Chain ID: ${chainId}`,
    `Contract: ${contract.toLowerCase()}`,
    `Issued At: ${new Date(issuedAtSec * 1000).toISOString()}`,
  ].join('\n')
}
