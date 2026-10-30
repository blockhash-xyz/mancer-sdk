// Token names the operator writes in .env, and amounts in a token's own units, read from the bot's own node.
import { erc20Abi, formatUnits, getAddress, parseUnits } from 'viem'
import { ETH, type Mancer, type TokenRef } from '@blockhash/mancer-sdk'

const meta = new Map<string, { symbol: string; decimals: number }>()

/** `ETH`, `WETH`, `USDG` or a token's address, as the SDK names a token. */
export function tokenRef(mancer: Mancer, name: string): TokenRef {
  const n = name.trim()
  if (n.toUpperCase() === 'ETH') return ETH
  if (n.toUpperCase() === 'WETH') return mancer.pinned.weth
  if (n.toUpperCase() === 'USDG') return mancer.pinned.usdg
  if (/^0x[0-9a-fA-F]{40}$/.test(n)) return getAddress(n)
  throw new Error(`${name} is ETH, WETH, USDG or a token's address`)
}

/** A token's symbol and decimals, from its own contract. */
export async function tokenMeta(mancer: Mancer, token: TokenRef): Promise<{ symbol: string; decimals: number }> {
  if (token === ETH) return { symbol: 'ETH', decimals: 18 }
  const known = meta.get(token.toLowerCase())
  if (known) return known
  const read = (functionName: 'symbol' | 'decimals') => mancer.publicClient.readContract({ address: token, abi: erc20Abi, functionName })
  const [symbol, decimals] = await Promise.all([read('symbol'), read('decimals')])
  const m = { symbol: String(symbol).slice(0, 16), decimals: Number(decimals) }
  meta.set(token.toLowerCase(), m)
  return m
}

/** `0.25` of a token, in its raw units. */
export async function units(mancer: Mancer, token: TokenRef, amount: string): Promise<bigint> {
  return parseUnits(amount, (await tokenMeta(mancer, token)).decimals)
}

/** Raw units of a token, as `3.871203 USDG`. */
export async function show(mancer: Mancer, token: TokenRef, raw: bigint | string): Promise<string> {
  const m = await tokenMeta(mancer, token)
  return `${formatUnits(BigInt(raw), m.decimals)} ${m.symbol}`
}

/** What `holder` holds of a token, ether included. */
export async function balanceOf(mancer: Mancer, token: TokenRef, holder: `0x${string}`): Promise<bigint> {
  if (token === ETH) return mancer.publicClient.getBalance({ address: holder })
  return mancer.publicClient.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [holder] })
}
