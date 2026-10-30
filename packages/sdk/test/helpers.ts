import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { encodeFunctionData, erc20Abi, getAddress, keccak256, parseAbi, zeroAddress, type Address, type Hex, type PublicClient } from 'viem'
import { MANCER_LAUNCH_ADAPTER_DEPLOYMENTS } from '../src/kit/launch-deployments'
import { ORDER_TYPEHASH_V3 } from '../src/kit/orders'
import { mancerRouterAbi } from '../src/kit/abi'
import { pinnedContracts } from '../src/contracts'

/** A request the mock API saw. */
export interface Seen {
  method: string
  path: string
  query: URLSearchParams
  headers: IncomingMessage['headers']
  body: unknown
}

export type Route = (req: Seen) => { status?: number; headers?: Record<string, string>; body?: unknown } | Promise<{ status?: number; headers?: Record<string, string>; body?: unknown }>

/** A local stand-in of Mancer's API: each route by `METHOD /path`, every request kept in `seen`. */
export async function mockApi(routes: Record<string, Route>): Promise<{ url: string; seen: Seen[]; close: () => Promise<void> }> {
  const seen: Seen[] = []
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const u = new URL(req.url ?? '/', 'http://localhost')
    const chunks: Buffer[] = []
    for await (const c of req) chunks.push(c as Buffer)
    const text = Buffer.concat(chunks).toString('utf8')
    const s: Seen = { method: req.method ?? 'GET', path: u.pathname, query: u.searchParams, headers: req.headers, body: text ? JSON.parse(text) : undefined }
    seen.push(s)
    const route = routes[`${s.method} ${s.path}`] ?? Object.entries(routes).find(([k]) => {
      const [m, p] = k.split(' ')
      return m === s.method && p!.includes(':') && new RegExp(`^${p!.replace(/:[^/]+/g, '[^/]+')}$`).test(s.path)
    })?.[1]
    if (!route) {
      res.writeHead(404, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'not found', code: 'not-found', retryable: false }))
      return
    }
    const out = await route(s)
    res.writeHead(out.status ?? 200, { 'content-type': 'application/json', 'x-request-id': `req-${seen.length}`, ...(out.headers ?? {}) })
    res.end(out.body === undefined ? '' : JSON.stringify(out.body, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)))
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const { port } = server.address() as AddressInfo
  return { url: `http://127.0.0.1:${port}`, seen, close: () => new Promise((done) => server.close(() => done())) }
}

/** The kit's pins, with no reviewed code hash: a stand-in chain's code hashes to none of them. Handed in as `trusted`. */
export const TRUSTED = { ...pinnedContracts(4663)!, codeHashes: {} }
export const NOW = Math.floor(Date.now() / 1000)

/** The code the stand-in chain answers at an address, and so the hash `/v1/contracts` names for it. */
export const codeAt = (a: string): Hex => `0x60${a.slice(2).toLowerCase()}` as Hex

/** `GET /v1/contracts` as the API answers it, over the stand-in chain's code. */
export function contractsAnswer() {
  const t = TRUSTED
  const entry = (a: Address) => ({ address: a, codeHash: keccak256(codeAt(a)) })
  const launch = MANCER_LAUNCH_ADAPTER_DEPLOYMENTS[4663]!
  return {
    chainId: 4663,
    chain: 'Robinhood Chain',
    router: entry(t.router),
    allowanceTarget: entry(t.allowanceTarget),
    orders: { ...entry(t.orders), eip712: { domain: { name: 'Mancer Orders', version: '3', chainId: 4663, verifyingContract: t.orders }, primaryType: 'Order', typehash: ORDER_TYPEHASH_V3 } },
    launchCoordinator: entry(getAddress(launch.coordinator!.address)),
    launchAllowanceTarget: entry(getAddress(launch.coordinatorAllowanceTarget!.address)),
    weth: entry(t.weth),
    usdg: entry(t.usdg),
  }
}

/** A stand-in chain client: code at every address (the reviewed code where the kit pins a hash, by a stand-in whose hash
 * the test fixes), reads by function name, and nothing sent. */
export function fakeChain(reads: Record<string, (args: readonly unknown[]) => unknown> = {}, codes: Record<string, Hex> = {}): PublicClient {
  return {
    getCode: async ({ address }: { address: Address }) => codes[address.toLowerCase()] ?? codeAt(address),
    // what a step's gas estimate reads on this stand-in node
    estimateGas: async () => 100_000n,
    readContract: async ({ functionName, args }: { functionName: string; args?: readonly unknown[] }) => {
      const r = reads[functionName]
      if (!r) throw new Error(`no stand-in read for ${functionName}`)
      return r(args ?? [])
    },
  } as unknown as PublicClient
}

/** Uniswap's SwapRouter02 on Robinhood Chain: a venue of Mancer's own routing the kit pins. */
export const SWAP_ROUTER_02 = getAddress('0xcaf681a66d020601342297493863e78c959e5cb2')
const SR02 = parseAbi(['function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) payable returns (uint256)'])

/** A leg the router runs through SwapRouter02's `exactInputSingle`, paying `recipient` (the router, as the plan compiler
 * names it). */
export function venueLeg(o: { tokenIn?: Address; tokenOut?: Address; amountIn?: bigint; recipient?: Address } = {}) {
  const tokenIn = o.tokenIn ?? TRUSTED.usdg, tokenOut = o.tokenOut ?? TRUSTED.weth
  return {
    target: SWAP_ROUTER_02,
    payload: encodeFunctionData({ abi: SR02, functionName: 'exactInputSingle', args: [{ tokenIn, tokenOut, fee: 500, recipient: o.recipient ?? TRUSTED.router, amountIn: o.amountIn ?? 0n, amountOutMinimum: 0n, sqrtPriceLimitX96: 0n }] }),
    tokenIn, tokenOut, amountIn: o.amountIn ?? 0n, fund: 0,
  }
}

export function plan(over: Partial<Record<string, unknown>> = {}) {
  const tokenIn = (over.tokenIn as Address | undefined) ?? TRUSTED.usdg
  const tokenOut = (over.tokenOut as Address | undefined) ?? TRUSTED.weth
  return {
    tokenIn, tokenOut, amountIn: 1_000_000n, minAmountOut: 990n, recipient: zeroAddress, deadline: BigInt(NOW + 600),
    feeBps: 10, feeMode: 0, feeAsset: zeroAddress, feeAfterLeg: 0, minFeeBasis: 0n,
    legs: [venueLeg({ tokenIn, tokenOut })],
    ...over,
  }
}

export const executeData = (over?: Partial<Record<string, unknown>>) => encodeFunctionData({ abi: mancerRouterAbi, functionName: 'execute', args: [plan(over) as never] })
export const approveData = (spender: Address, amount: bigint) => encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [spender, amount] })

/** A simulation that ran. */
export const SIM_OK = { ok: true, block: 100, timestamp: NOW, outcome: { gasUsed: ['50000'], returns: [null], events: [], fees: {} } }
