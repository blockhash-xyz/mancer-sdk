// SPDX-License-Identifier: MIT
// Part of Mancer's contracts kit as the SDK uses it, mirrored with the rest of this repository at each release.
import type { Address, Hex } from 'viem'
import { ORDER_EIP712_TYPES_V3, ZERO_OCO_GROUP, defaultFillWindowSec, ordersDomainV3, orderToAbiV3, type MancerOrderV3 } from '../orders'

export interface PlaceOrderParams {
  tokenIn: Address
  tokenOut: Address
  amountPerFill: bigint
  totalFills: number
  everySec: number

  startAt: number

  expiry: number
  minOutPerFill: bigint

  triggerOutPerFill: bigint

  maxOutPerFill: bigint
  maxFeeBps: number
}

export interface OrderSigner {
  maker: Address
  epoch: Hex
  nonce: string
  ocoGroup?: Hex
}

export function orderV3ToSign(p: PlaceOrderParams, signer: OrderSigner): MancerOrderV3 {
  return {
    maker: signer.maker,
    tokenIn: p.tokenIn,
    tokenOut: p.tokenOut,
    amountPerFill: p.amountPerFill.toString(),
    totalFills: p.totalFills,
    everySec: p.everySec,
    fillWindowSec: p.totalFills > 1 ? defaultFillWindowSec(p.everySec) : 0,
    startAt: p.startAt,
    expiry: p.expiry,
    minOutPerFill: p.minOutPerFill.toString(),
    triggerOutPerFill: p.triggerOutPerFill.toString(),
    maxOutPerFill: p.maxOutPerFill.toString(),
    maxFeeBps: p.maxFeeBps,
    epoch: signer.epoch,
    nonce: signer.nonce,
    ocoGroup: signer.ocoGroup ?? ZERO_OCO_GROUP,
  }
}

export function orderTypedDataV3(order: MancerOrderV3, chainId: number, contract: Address) {
  return {
    domain: ordersDomainV3(chainId, contract),
    types: ORDER_EIP712_TYPES_V3,
    primaryType: 'Order' as const,
    message: orderToAbiV3(order),
  }
}
