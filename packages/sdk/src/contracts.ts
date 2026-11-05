import { getAddress, keccak256, type Address, type Hex, type PublicClient } from 'viem'
import type { Contracts } from './generated/openapi'
import { KNOWN_TOKENS, MANCER_ORDERS_DEPLOYMENTS, MANCER_ROUTER_DEPLOYMENTS, ORDER_TYPEHASH_V3, launchAdapterDeployment, pinnedAllowanceTarget } from './shared'

/**
 * The contracts the SDK trusts, from the kit it was built with, never from an answer alone: a compromised or defective
 * API could name a router of its own, so every check holds a build to these. `GET /v1/contracts` is read beside them
 * (`contractsMismatch`), and the code at each is hashed from the caller's own node (`readCodeHashes`).
 */
export interface TrustedContracts {
  chainId: number
  router: Address
  /** The one spender a swap's input is approved to. */
  allowanceTarget: Address
  orders: Address
  weth: Address
  usdg: Address
  /** The account-bound launch stack bound to this router and orders contract; null where the chain has none. */
  launch: {
    coordinator: Address
    allowanceTarget: Address
    /** Each pinned pad, its adapter, and the token its launches are quoted in (constructor state in the pad's code). */
    pads: { pad: Address; adapter: Address; quoteToken: Address }[]
    /** The Smart Launch lens a sale's round trip is sized by (`quoteSell`), in the pad's quote token. */
    lens: Address | null
  } | null
  /** The runtime code hashes the kit pins (lowercase address to hash): the router, the orders contract, the launch stack. */
  codeHashes: Record<string, Hex>
}

/** The kit's own word for a chain, or null where it pins no router and orders contract there. */
export function pinnedContracts(chainId = 4663): TrustedContracts | null {
  const router = MANCER_ROUTER_DEPLOYMENTS[chainId]
  const orders = MANCER_ORDERS_DEPLOYMENTS[chainId]
  if (!router || !orders) return null
  const target = pinnedAllowanceTarget(chainId, router)
  const token = (symbol: string) => KNOWN_TOKENS[chainId]?.find((t) => t.symbol === symbol)?.address
  const weth = token('WETH'), usdg = token('USDG')
  if (!target || !weth || !usdg) return null
  const codeHashes: Record<string, Hex> = {}
  const launch = launchAdapterDeployment(chainId)
  const bound = launch && launch.router.address.toLowerCase() === router.toLowerCase() && launch.orders.address.toLowerCase() === orders.toLowerCase() ? launch : null
  if (bound) {
    codeHashes[bound.router.address.toLowerCase()] = bound.router.runtimeCodeHash
    codeHashes[bound.orders.address.toLowerCase()] = bound.orders.runtimeCodeHash
    if (bound.coordinator) codeHashes[bound.coordinator.address.toLowerCase()] = bound.coordinator.runtimeCodeHash
    if (bound.coordinatorAllowanceTarget) codeHashes[bound.coordinatorAllowanceTarget.address.toLowerCase()] = bound.coordinatorAllowanceTarget.runtimeCodeHash
  }
  return {
    chainId,
    router: getAddress(router),
    allowanceTarget: getAddress(target),
    orders: getAddress(orders),
    weth: getAddress(weth),
    usdg: getAddress(usdg),
    launch: bound?.coordinator && bound.coordinatorAllowanceTarget
      ? {
          coordinator: getAddress(bound.coordinator.address),
          allowanceTarget: getAddress(bound.coordinatorAllowanceTarget.address),
          // a pad the kit names no quote token for is left out: its adapter is then no pinned spender, and nothing of it is signed
          pads: bound.safeLaunchV2Pads.filter((p) => !!p.quoteToken).map((p) => ({ pad: getAddress(p.pad.address), adapter: getAddress(p.adapter.address), quoteToken: getAddress(p.quoteToken) })),
          lens: bound.safeLaunchLens ? getAddress(bound.safeLaunchLens.address) : null,
        }
      : null,
    codeHashes,
  }
}

const same = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.toLowerCase() === b.toLowerCase()

/** null where `GET /v1/contracts` names what the kit pins; otherwise the first contract that differs. */
export function contractsMismatch(answer: Contracts, pinned: TrustedContracts): string | null {
  if (answer.chainId !== pinned.chainId) return 'the API names another chain'
  if (!same(answer.router.address, pinned.router)) return 'the API names another router than the one this SDK pins: update the SDK or stop'
  if (!same(answer.allowanceTarget.address, pinned.allowanceTarget)) return 'the API names another allowance target'
  if (!same(answer.orders.address, pinned.orders)) return 'the API names another orders contract'
  const d = answer.orders.eip712.domain
  if (d.name !== 'Mancer Orders' || d.version !== '3' || d.chainId !== pinned.chainId || !same(d.verifyingContract, pinned.orders)) return "the orders contract's EIP-712 domain differs"
  if (!same(answer.orders.eip712.typehash, ORDER_TYPEHASH_V3)) return "the orders contract's Order typehash is not V3's"
  if (!same(answer.weth.address, pinned.weth)) return 'the API names another WETH'
  if (answer.usdg && !same(answer.usdg.address, pinned.usdg)) return 'the API names another USDG'
  if (pinned.launch) {
    if (!answer.launchCoordinator || !same(answer.launchCoordinator.address, pinned.launch.coordinator)) return 'the API names another launch coordinator'
    if (!answer.launchAllowanceTarget || !same(answer.launchAllowanceTarget.address, pinned.launch.allowanceTarget)) return "the API names another launch coordinator's allowance target"
  }
  for (const entry of [answer.router, answer.allowanceTarget, answer.orders, answer.launchCoordinator, answer.launchAllowanceTarget, answer.weth, answer.usdg]) {
    if (!entry) continue
    const pin = pinned.codeHashes[entry.address.toLowerCase()]
    if (pin && !same(pin, entry.codeHash)) return `the code hash the API names for ${entry.address} is not the reviewed build's`
  }
  return null
}

/** keccak-256 of the runtime code at each address, read from the caller's own node; an address with no code reads null. */
export async function readCodeHashes(chain: Pick<PublicClient, 'getCode'>, addresses: readonly Address[]): Promise<Record<string, Hex | null>> {
  const codes = await Promise.all(addresses.map((address) => chain.getCode({ address })))
  const out: Record<string, Hex | null> = {}
  addresses.forEach((a, i) => {
    const code = codes[i]
    out[a.toLowerCase()] = code && code !== '0x' ? keccak256(code) : null
  })
  return out
}
