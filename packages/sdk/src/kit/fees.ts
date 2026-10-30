// SPDX-License-Identifier: MIT
// Part of Mancer's contracts kit as the SDK uses it, mirrored with the rest of this repository at each release.
import { zeroAddress } from 'viem'
import { KNOWN_TOKENS, MAINNET_UNISWAP_V3 } from './addresses'

export const MANCER_SWAP_FEE_SCHEDULE_BPS = { pegged: 0, 'eth-stable': 2, other: 10, 'new-token': 50 } as const

export function publishedSwapFeeTier(chainId: number, tokenIn: string, tokenOut: string): 'pegged' | 'eth-stable' | 'other' {
  const weth = MAINNET_UNISWAP_V3.weth.toLowerCase()
  const stables = new Set((KNOWN_TOKENS[chainId] ?? []).filter((t) => t.symbol === 'USDG' || t.symbol === 'USDC').map((t) => t.address.toLowerCase()))
  const isEth = (t: string) => t.toLowerCase() === weth || t.toLowerCase() === zeroAddress
  const a = tokenIn.toLowerCase(), b = tokenOut.toLowerCase()
  if (stables.has(a) && stables.has(b)) return 'pegged'
  if ((isEth(a) && stables.has(b)) || (stables.has(a) && isEth(b))) return 'eth-stable'
  return 'other'
}

export function publishedSwapFeeBps(chainId: number, tokenIn: string, tokenOut: string): number {
  return MANCER_SWAP_FEE_SCHEDULE_BPS[publishedSwapFeeTier(chainId, tokenIn, tokenOut)]
}

export function publishedOrderFeeBps(chainId: number, tokenIn: string, tokenOut: string): number {
  const tier = publishedSwapFeeTier(chainId, tokenIn, tokenOut)
  return (tier === 'pegged' ? 3 : 10) + MANCER_SWAP_FEE_SCHEDULE_BPS[tier]
}

export const MANCER_ORDER_FEE_CEILING_BPS = 10 + MANCER_SWAP_FEE_SCHEDULE_BPS['new-token']
