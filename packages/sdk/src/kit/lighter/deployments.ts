// SPDX-License-Identifier: MIT
// Part of Mancer's contracts kit as the SDK uses it, mirrored with the rest of this repository at each release.
import type { Address } from 'viem'
import type { LighterEnv } from './env'

export const LIGHTER_RH_CHAIN_ID = 4663

export const LIGHTER_ROUTE = { perps: 0, spot: 1 } as const
export type LighterRoute = (typeof LIGHTER_ROUTE)[keyof typeof LIGHTER_ROUTE]

export interface LighterRhDeployment {
  chainId: typeof LIGHTER_RH_CHAIN_ID

  zkLighter: Address
  collateral: {
    token: Address
    symbol: 'USDG'
    decimals: 6

    assetIndex: number

    routeType: LighterRoute

    minimumDeposit: bigint

    minimumWithdrawal: bigint
  }
}

export const LIGHTER_RH_DEPLOYMENT: LighterRhDeployment = {
  chainId: LIGHTER_RH_CHAIN_ID,
  zkLighter: '0x94bAB9693Ba2f6358507eFfcbd372b0660AFfF9d',
  collateral: {
    token: '0x5fc5360d0400a0fd4f2af552add042d716f1d168',
    symbol: 'USDG',
    decimals: 6,
    assetIndex: 3,
    routeType: LIGHTER_ROUTE.perps,
    minimumDeposit: 1_000_000n,
    minimumWithdrawal: 1_000_000n,
  },
}

export const LIGHTER_RESERVED_KEY_SLOTS: readonly number[] = [0, 1, 2, 3, 157]

export const LIGHTER_MANCER_KEY_SLOTS = { site: 42, app: 43, reserved: 44 } as const

export const LIGHTER_AGENT_KEY_SLOTS = { first: 100, last: 156 } as const

export const LIGHTER_MAX_KEY_SLOT = 254

export function isLighterReservedSlot(slot: number): boolean {
  return LIGHTER_RESERVED_KEY_SLOTS.includes(slot)
}

export function isMancerKeySlot(slot: number): boolean {
  return slot === LIGHTER_MANCER_KEY_SLOTS.site || slot === LIGHTER_MANCER_KEY_SLOTS.app || slot === LIGHTER_MANCER_KEY_SLOTS.reserved
}

export function isLighterAgentSlot(slot: number): boolean {
  return Number.isInteger(slot) && slot >= LIGHTER_AGENT_KEY_SLOTS.first && slot <= LIGHTER_AGENT_KEY_SLOTS.last && !isLighterReservedSlot(slot) && !isMancerKeySlot(slot)
}

export const LIGHTER_FEE_PER = 1_000_000

export const LIGHTER_MANCER_FEE_CEILING = 1_000

export const LIGHTER_MANCER_FEE_DEFAULT = 0

export const LIGHTER_MANCER_PARTNER_INDEX: number | null = null

export const LIGHTER_MANCER_PARTNERS: Readonly<Record<LighterEnv, number | null>> = Object.freeze({
  'rh-mainnet': LIGHTER_MANCER_PARTNER_INDEX,
  'rh-testnet': null,
  'lighter-testnet': 4545,
})

export function lighterMancerPartner(env: LighterEnv): number | null {
  return LIGHTER_MANCER_PARTNERS[env] ?? null
}

export const LIGHTER_MAX_ACCOUNT_INDEX = 2 ** 48 - 1

export function lighterFeeAllowed(perMillion: unknown): perMillion is number {
  return typeof perMillion === 'number' && Number.isInteger(perMillion) && perMillion >= 0 && perMillion <= LIGHTER_MANCER_FEE_CEILING
}

export function lighterFeePercent(perMillion: number): string {
  return `${(perMillion / 10_000).toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}%`
}

export const LIGHTER_MAX_APPROVED_INTEGRATORS = 4

export const LIGHTER_FAST_WITHDRAW_FEE_CEILING = 5_000_000n

export const LIGHTER_FAST_WITHDRAW_MINIMUM = 1_000_000n

export function lighterFastWithdrawFeeProblem(fee: bigint): string | null {
  if (fee < 0n || fee > LIGHTER_FAST_WITHDRAW_FEE_CEILING) return 'Lighter’s fee is above the most a fast withdrawal may cost'
  return null
}

export interface LighterFastWithdrawInfo {

  poolAccount: number

  withdrawLimit: bigint
  maxAmount: bigint
}

export function lighterFastWithdrawProblem(input: { amount: bigint; fee: bigint; info: LighterFastWithdrawInfo }): string | null {
  const { amount, fee, info } = input
  if (!Number.isSafeInteger(info.poolAccount) || info.poolAccount <= 0 || info.poolAccount > LIGHTER_MAX_ACCOUNT_INDEX) return 'Lighter named no fast-withdraw pool'
  if (amount < LIGHTER_FAST_WITHDRAW_MINIMUM) return 'a fast withdrawal is at least 1 USDG'
  if (amount > info.maxAmount) return 'the amount is more than one fast withdrawal takes now'
  if (amount > info.withdrawLimit) return 'the amount is more than Lighter’s fast-withdraw pool takes now'
  return lighterFastWithdrawFeeProblem(fee)
}

export const LIGHTER_SIGNER = {
  build: 'wasm',

  sourceCommit: 'aefa96848a105d82a6bbb55d3d05663293a71713',
  goVersion: 'go1.27.3',
  wasm: {
    sha256: '22db4ce2933f480b79bd188372366cc1846afc7832c3eb96d2fbc811963efb62',
    bytes: 15_592_028,
    file: 'lighter-signer-22db4ce2.wasm',
  },
  runtime: {
    sha256: '0c949f4996f9a89698e4b5c586de32249c3b69b7baadb64d220073cc04acba14',
    file: 'wasm-exec-0c949f49.js',
  },
} as const
