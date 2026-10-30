// SPDX-License-Identifier: MIT
// Part of Mancer's contracts kit as the SDK uses it, mirrored with the rest of this repository at each release.
import { getAddress, parseAbi, type Address, type Hex, type PublicClient } from 'viem'
import { MANCER_ROUTER_DEPLOYMENTS } from './addresses'
import { MANCER_ROUTER_LEG_TARGETS, ROUTER_WILDCARD_TARGETS } from './router-legs'

const ROUTER_ADMIN_ABI = parseAbi([
  'event TargetSet(address indexed target, bool allowed)',
  'event CallSet(address indexed target, bytes4 indexed selector, bool allowed)',
  'function isTarget(address target) view returns (bool)',
  'function isCall(address target, bytes4 selector) view returns (bool)',
])

export const ROUTER_ANY_SELECTOR = '0xffffffff' as Hex

export const MANCER_ROUTER_FIRST_BLOCK: Record<number, bigint | undefined> = { 4663: 49_579_000n }

export interface AllowlistDrift {
  router: Address

  head: bigint

  unknown: Array<{ target: Address; selector: Hex }>

  unknownWildcards: Address[]

  revoked: Array<{ target: Address; selector: Hex; venue: string }>
}

export async function routerAllowlistDrift(
  chain: Pick<PublicClient, 'getLogs' | 'readContract' | 'getBlockNumber'>,
  options: { chainId?: number; router?: Address; fromBlock?: bigint; span?: bigint } = {},
): Promise<AllowlistDrift> {
  const chainId = options.chainId ?? 4663
  const routerAddress = options.router ?? MANCER_ROUTER_DEPLOYMENTS[chainId]
  if (!routerAddress) throw new Error(`the kit pins no router for chain ${chainId}`)
  const router = getAddress(routerAddress)
  const table = MANCER_ROUTER_LEG_TARGETS[chainId] ?? []
  const wild = ROUTER_WILDCARD_TARGETS[chainId] ?? {}
  const head = await chain.getBlockNumber()
  const from = options.fromBlock ?? MANCER_ROUTER_FIRST_BLOCK[chainId] ?? 0n
  const span = options.span ?? 5_000_000n
  const pairs = new Map<string, Set<string>>()
  const note = (target: string, selector?: string) => {
    const t = target.toLowerCase()
    if (!pairs.has(t)) pairs.set(t, new Set())
    if (selector) pairs.get(t)!.add(selector.toLowerCase())
  }
  for (const name of ['TargetSet', 'CallSet'] as const) {
    const event = ROUTER_ADMIN_ABI.find((x) => x.type === 'event' && x.name === name)!
    for (let start = from; start <= head; start += span) {
      const end = start + span - 1n > head ? head : start + span - 1n
      const logs = await chain.getLogs({ address: router, event: event as never, fromBlock: start, toBlock: end })
      for (const l of logs as unknown as { args: { target?: string; selector?: string } }[]) if (l.args.target) note(l.args.target, l.args.selector)
    }
  }
  for (const lt of table) for (const s of lt.selectors) note(lt.target, s)
  const read = (functionName: 'isTarget' | 'isCall', args: readonly unknown[]) =>
    chain.readContract({ address: router, abi: ROUTER_ADMIN_ABI, functionName, args, blockNumber: head } as never) as Promise<boolean>
  const drift: AllowlistDrift = { router, head, unknown: [], unknownWildcards: [], revoked: [] }
  for (const [target, selectors] of pairs) {
    const pinned = table.find((x) => x.target.toLowerCase() === target)
    const active = await read('isTarget', [target])
    const wildcard = active && (await read('isCall', [target, ROUTER_ANY_SELECTOR]))
    if (wildcard && !wild[target]) drift.unknownWildcards.push(getAddress(target))
    for (const selector of selectors) {
      if (selector === ROUTER_ANY_SELECTOR) continue
      const admitted = active && (await read('isCall', [target, selector]))
      const named = !!pinned?.selectors.includes(selector as Hex)
      if (admitted && !named && !wild[target]) drift.unknown.push({ target: getAddress(target), selector: selector as Hex })
      if (!admitted && named) drift.revoked.push({ target: getAddress(target), selector: selector as Hex, venue: pinned!.venue })
    }
  }
  return drift
}
