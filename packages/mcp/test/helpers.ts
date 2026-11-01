import { createServer, type IncomingMessage } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createHmac } from 'node:crypto'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { decodeFunctionData, encodeFunctionData, encodeFunctionResult, erc20Abi, getAddress, keccak256, parseAbi, verifyMessage, zeroAddress, type Abi, type Address, type Hex } from 'viem'
import { launchAdapterDeployment, MAINNET_UNISWAP_V3, ORDER_TYPEHASH_V3, BOOK_DEPLOYMENTS, armCall, bookAbisFor, bookCallData, mancerOrdersV3Abi, mancerRouterAbi, quoterV2Abi, transferCall, transferTransaction, type TransferAsset } from '../../sdk/src/shared'
import { pinnedContracts } from '../../sdk/src/contracts'
import { configFrom, type Config } from '../src/config'
import { serveHttp, type HttpHandle } from '../src/http'

/**
 * A stand-in of Mancer's API over real HTTP: routes answer as the API's do, and every request it took is kept (method,
 * path, query, headers, body) so a test reads what the server sent. Its sign-in issues the API's own message and a token
 * shaped as the API's session (a JWT of `sub`, `iat` and `exp`), signed with a secret only the stand-in holds.
 */

export const WETH = '0x0bd7d308f8e1639fab988df18a8011f41eacad73' as Address
export const USDG = '0x5fc5360d0400a0fd4f2af552add042d716f1d168' as Address
export const STOCK = '0x00000000000000000000000000000000000057c0' as Address
export const ROUTER = '0xa62858659c83095eb5e702f0af6a7bb7f370b3e7' as Address
export const SPENDER = '0x4c16269006db0dd87e6ae3c8a014b2807aa2e388' as Address
export const ORDERS = '0xf300a6549cd46206629e6719d3f258022d7f2da1' as Address
export const BOOK = '0x00000000000000000000000000000000000b00c5' as Address
/** The Book's vault and id, as the stand-in chain's pinned factory names them. */
export const VAULT = '0x00000000000000000000000000000000000ba017' as Address
export const BOOK_ID = 7n
export const KEY = `mancer_${'ab'.repeat(24)}`
/** Uniswap's SwapRouter02 on Robinhood Chain: a venue of the kit's leg table. */
export const SWAP_ROUTER_02 = getAddress('0xcaf681a66d020601342297493863e78c959e5cb2')
const SECRET = 'stand-in-session-secret'

export interface Seen {
  method: string
  path: string
  query: Record<string, string>
  headers: Record<string, string | undefined>
  body: unknown
}

export type Route = (req: Seen) => { status?: number; body?: unknown; headers?: Record<string, string> } | Promise<{ status?: number; body?: unknown; headers?: Record<string, string> }>

const b64u = (s: string) => Buffer.from(s).toString('base64url')

/** A token shaped as the API's session, for a wallet. */
export function sessionToken(wallet: string, nowSec = Math.floor(Date.now() / 1000), ttl = 7 * 86_400): string {
  const head = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64u(JSON.stringify({ sub: wallet.toLowerCase(), iat: nowSec, exp: nowSec + ttl }))
  return `${head}.${body}.${createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url')}`
}

/** The wallet a bearer that is one of the stand-in's sessions names, or null. */
export function sessionWallet(authorization: string | undefined): string | null {
  const t = /^Bearer (\S+)$/.exec(authorization ?? '')?.[1]
  if (!t) return null
  const [h, b, s] = t.split('.')
  if (!h || !b || !s || createHmac('sha256', SECRET).update(`${h}.${b}`).digest('base64url') !== s) return null
  return (JSON.parse(Buffer.from(b, 'base64url').toString()) as { sub: string }).sub
}

/** Mancer's sign-in message, as the API writes it for a client with no Origin. */
export function loginMessage(address: string, nonce: string, issuedAtSec: number, domain = 'mancer.xyz'): string {
  return [
    `${domain} wants you to sign in with your Ethereum account:`,
    getAddress(address),
    '',
    'Sign in to Mancer.',
    '',
    `URI: https://${domain}`,
    'Version: 1',
    'Chain ID: 4663',
    `Nonce: ${nonce}`,
    `Issued At: ${new Date(issuedAtSec * 1000).toISOString()}`,
  ].join('\n')
}

const SR02 = parseAbi(['function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) payable returns (uint256)'])

/** A leg through Uniswap V3 on SwapRouter02 (a venue the kit's table names), paying the router. */
export function venueLeg(tokenIn: Address, tokenOut: Address) {
  return {
    target: SWAP_ROUTER_02,
    payload: encodeFunctionData({ abi: SR02, functionName: 'exactInputSingle', args: [{ tokenIn, tokenOut, fee: 500, recipient: ROUTER, amountIn: 0n, amountOutMinimum: 0n, sqrtPriceLimitX96: 0n }] }),
    tokenIn, tokenOut, amountIn: 0n, fund: 0,
  }
}

/** MancerRouter's `execute`. Its one leg goes through 0x…0b0b, which no venue table names, unless `venue` names a real one. */
export function swapCalldata(o: { amountIn: bigint; minOut: bigint; recipient: Address; tokenIn?: Address; tokenOut?: Address; venue?: boolean }) {
  return encodeFunctionData({
    abi: mancerRouterAbi,
    functionName: 'execute',
    args: [{
      tokenIn: o.tokenIn ?? WETH, tokenOut: o.tokenOut ?? USDG, amountIn: o.amountIn, minAmountOut: o.minOut, recipient: o.recipient,
      deadline: BigInt(Math.floor(Date.now() / 1000) + 600), feeBps: 2, feeMode: 0, feeAsset: zeroAddress, feeAfterLeg: 0, minFeeBasis: 0n,
      legs: [o.venue ? venueLeg(WETH, o.tokenOut ?? USDG) : { target: '0x0000000000000000000000000000000000000b0b', payload: '0x', tokenIn: WETH, tokenOut: USDG, amountIn: o.amountIn, fund: 0 }],
    }],
  })
}

/** The quote's output for every swap the stand-in builds. */
export const QUOTED_OUT = 22_453_560n

/** The API's build for a taker, as `GET /v1/quote` with `steps=1` answers it: the transaction with its exact approval, the
 * ordered envelope the API puts on every build that names a taker (server.ts `executionFor`, `routerEnvelope` below), and
 * its steps, the envelope's transactions (steps/routes.ts `swapStepsHook`): the exact approval and the swap, its floor the
 * quote less the slippage asked (22,000,000 where none is asked). Its leg goes through 0x…0b0b unless `venue`.
 * real-api.test.ts holds the shapes to the API's own code. */
export function buildAnswer(q: Record<string, string>, over: { recipient?: Address; venue?: boolean; tokenOut?: Address } = {}) {
  const taker = q.taker as Address
  const amountIn = BigInt(q.amountIn ?? '0')
  const recipient = over.recipient ?? ((q.recipient ?? taker) as Address)
  const minOut = q.slippageBps ? (QUOTED_OUT * (10_000n - BigInt(q.slippageBps))) / 10_000n : 22_000_000n
  const native = q.nativeIn === '1'
  const data = swapCalldata({ amountIn, minOut, recipient, tokenIn: native ? zeroAddress : WETH, tokenOut: over.tokenOut, venue: over.venue })
  const steps = [
    ...(native ? [] : [{ kind: 'approval', to: WETH, data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [SPENDER, amountIn] }), value: '0', gas: '60000', why: 'Approves the spender this call pulls through for exactly the amount it spends.' }]),
    { kind: 'swap', to: ROUTER, data, value: native ? amountIn.toString() : '0', gas: '400000', why: 'Swaps through MancerRouter on the built route, with its floor and deadline.' },
  ]
  const tx = { to: ROUTER, data, value: native ? amountIn.toString() : '0', approval: native ? null : { token: WETH, spender: SPENDER, amount: amountIn.toString() } }
  const ordered = q.taker !== undefined || q.address !== undefined
  return {
    quote: {
      amountOut: QUOTED_OUT.toString(), quotedAmountOut: QUOTED_OUT.toString(), minOut: minOut.toString(), fee: { bps: 2, side: 'input' }, priceImpactBps: 1,
      tx,
      ...(ordered ? { execution: routerEnvelope({ taker: taker.toLowerCase() as Address, recipient: recipient.toLowerCase() as Address, amountIn, tx }) } : {}),
      ready: { chainId: 4663, wallet: taker.toLowerCase(), steps, simulation: { ok: true, block: 100, timestamp: 1_800_000_000 }, readAfter: null },
    },
  }
}

/** `GET /v1/contracts` as the API answers it: the kit's pins and their code hashes. */
export function contractsAnswer() {
  const t = pinnedContracts(4663)!
  const entry = (a: Address) => ({ address: a, codeHash: t.codeHashes[a.toLowerCase()] ?? keccak256(`0x60${a.slice(2).toLowerCase()}`) })
  const launch = launchAdapterDeployment(4663)!
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

/** The Books deployment the kit pins, whose factory the stand-in chain answers for. */
export const BOOKS = BOOK_DEPLOYMENTS[0]!

/** `decimals()`, as the stand-in chain's tokens answer it. */
const DECIMALS_CALL = '0x313ce567'

/** What Uniswap's QuoterV2 answers on the stand-in chain for any order: the stand-in quote's own output, so a trustQuote
 * floor of WETH against USDG stands beside the pool. A test that wants the pool elsewhere answers it itself. */
export const POOL_PAYS = QUOTED_OUT

/** The stand-in chain's `eth_call`: the pinned Books factory names BOOK as Book 7 with its vault, the pad names WETH as its
 * base pair, the stand-in's tokens and BOOK answer `decimals()` as the index names them (BOOK 18), Uniswap's QuoterV2 pays
 * `POOL_PAYS`; every other read is 0. */
function ethCallAnswer(to: string, data: Hex): Hex {
  if (to.toLowerCase() === MAINNET_UNISWAP_V3.quoterV2.toLowerCase()) {
    return encodeFunctionResult({ abi: quoterV2Abi, functionName: 'quoteExactInputSingle', result: [POOL_PAYS, 0n, 0, 0n] })
  }
  if (data.toLowerCase() === DECIMALS_CALL) {
    const d = to.toLowerCase() === BOOK ? 18 : TOKENS[to.toLowerCase()]?.decimals
    if (d !== undefined) return `0x${d.toString(16).padStart(64, '0')}`
  }
  const abi = bookAbisFor(BOOKS).factory as Abi
  if (to.toLowerCase() === BOOKS.factory.address.toLowerCase()) {
    try {
      const d = decodeFunctionData({ abi, data })
      if (d.functionName === 'bookIdOfToken') return encodeFunctionResult({ abi, functionName: 'bookIdOfToken', result: (d.args![0] as string).toLowerCase() === BOOK ? BOOK_ID : 0n })
      if (d.functionName === 'bookOf') return encodeFunctionResult({ abi, functionName: 'bookOf', result: [BOOK, VAULT, '0x00000000000000000000000000000000000000c1'] })
    } catch {
      // another read
    }
  }
  const pad = bookAbisFor(BOOKS).pad as Abi
  if (to.toLowerCase() === BOOKS.pad.address.toLowerCase()) {
    try {
      const d = decodeFunctionData({ abi: pad, data })
      // Book 7 raises in WETH
      if (d.functionName === 'quoteOf') return encodeFunctionResult({ abi: pad, functionName: 'quoteOf', result: getAddress(WETH) })
    } catch {
      // another read
    }
  }
  return `0x${'00'.repeat(32)}`
}

/** A send's one step as the kit builds it, for the asset and the recipient named. */
export function transferStep(body: { wallet: string; to: string; asset: { kind: string; token?: string; collection?: string; tokenId?: string }; amount?: string }, recipient: Address) {
  const asset: TransferAsset = body.asset.kind === 'native'
    ? { kind: 'native' }
    : body.asset.kind === 'erc20'
      ? { kind: 'erc20', token: body.asset.token as Address }
      : { kind: 'erc721', collection: body.asset.collection as Address, tokenId: BigInt(body.asset.tokenId ?? '0') }
  const tx = transferTransaction(transferCall(asset, body.wallet as Address, recipient, asset.kind === 'erc721' ? 1n : BigInt(body.amount ?? '0')))
  return { kind: 'transfer', to: tx.to, data: tx.data ?? '0x', value: tx.value.toString(), gas: '50000', why: 'Sends the asset.' }
}

/** The ordered envelope the API puts on every build that names a taker (execution/integrator-execution.ts
 * `buildRouterIntegratorExecution`, server.ts `executionFor`): the input's exact approval where the transaction names one,
 * then the swap through MancerRouter. real-api.test.ts holds this to the API's own builder. */
export function routerEnvelope(o: { taker: Address; recipient: Address; amountIn: bigint; tx: { to: string; data: Hex; value: string; approval?: { token: Address; spender: Address; amount?: string } | null } }) {
  const a = o.tx.approval
  const amount = a ? BigInt(a.amount ?? o.amountIn) : 0n
  return {
    version: 1,
    taker: o.taker,
    recipient: o.recipient,
    entrypoint: 'router',
    requirements: a ? [{ kind: 'erc20-allowance', token: a.token, spender: a.spender, amount: amount.toString() }] : [],
    transactions: [
      ...(a ? [{ chain: 'robinhood', chainId: 4663, kind: 'approval', to: a.token, data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [a.spender, amount] }), value: '0' }] : []),
      { chain: 'robinhood', chainId: 4663, kind: 'swap', to: o.tx.to, data: o.tx.data, value: o.tx.value },
    ],
  }
}

const SET_OPERATOR = parseAbi(['function setOperator(uint256 launchId, address operator, bool approved)'])

/** An account-bound launch route's envelope as the API builds it (integrator-execution.ts
 * `buildSafeLaunchIntegratorExecution`, every setup call missing): the input's approval to the coordinator's allowance
 * target, a sale's operator authorization on the pad, the round trip's approval to the pad's adapter, then the swap through
 * the launch coordinator. real-api.test.ts holds this to the API's own builder. */
export function launchEnvelope(o: {
  chain: string; chainId: number; direction: 'buy' | 'sell'; taker: Address; recipient: Address; coordinator: Address; coordinatorAllowanceTarget: Address
  adapter: Address; pad: Address; launchId: string; launchToken: Address; quoteToken: Address; inputToken?: Address; amountIn: bigint; roundTripAllowance: bigint; swapData: Hex; swapValue: bigint
}) {
  const roundTrip = o.direction === 'buy' ? o.launchToken : o.quoteToken
  const approval = (token: Address, spender: Address, amount: bigint) => ({ chain: o.chain, chainId: o.chainId, kind: 'approval', to: token, data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [spender, amount] }), value: '0' })
  return {
    version: 1,
    taker: o.taker,
    recipient: o.recipient,
    entrypoint: 'launch-coordinator',
    requirements: [
      ...(o.inputToken ? [{ kind: 'erc20-allowance', token: o.inputToken, spender: o.coordinatorAllowanceTarget, amount: o.amountIn.toString() }] : []),
      ...(o.direction === 'sell' ? [{ kind: 'protocol-operator', protocol: 'safe-launch-v2', target: o.pad, launchId: BigInt(o.launchId).toString(), operator: o.adapter }] : []),
      { kind: 'erc20-allowance', token: roundTrip, spender: o.adapter, amount: o.roundTripAllowance.toString() },
    ],
    transactions: [
      ...(o.inputToken ? [approval(o.inputToken, o.coordinatorAllowanceTarget, o.amountIn)] : []),
      ...(o.direction === 'sell' ? [{ chain: o.chain, chainId: o.chainId, kind: 'authorization', to: o.pad, data: encodeFunctionData({ abi: SET_OPERATOR, functionName: 'setOperator', args: [BigInt(o.launchId), o.adapter, true] }), value: '0' }] : []),
      approval(roundTrip, o.adapter, o.roundTripAllowance),
      { chain: o.chain, chainId: o.chainId, kind: 'swap', to: o.coordinator, data: o.swapData, value: o.swapValue.toString() },
    ],
  }
}

/** The API's quote route, building every leg through a venue of the kit's table: a build the checks pass. */
export const VENUE_ROUTES: Record<string, Route> = {
  'GET /v1/quote': ({ query }) => {
    if (!query.taker && !query.recipient) return { body: { quote: { amountOut: QUOTED_OUT.toString(), fee: { bps: 2 }, estimate: true }, estimate: true } }
    return { body: buildAnswer(query, { venue: true }) }
  },
}

const TOKENS: Record<string, { symbol: string; decimals: number }> = { [WETH]: { symbol: 'WETH', decimals: 18 }, [USDG]: { symbol: 'USDG', decimals: 6 }, [STOCK]: { symbol: 'NVDA', decimals: 18 } }

/** The routes every test's stand-in answers, each overridable. */
export function defaultRoutes(): Record<string, Route> {
  const nonces = new Map<string, { address: string; message: string }>()
  return {
    'POST /v1/tokens/resolve': ({ body }) => ({ body: { tokens: ((body as { addresses: string[] }).addresses ?? []).filter((x) => TOKENS[x]).map((x) => ({ address: x, ...TOKENS[x] })) } }),
    'GET /v1/tokens': ({ query }) => ({ body: { count: 1, tokens: [{ address: USDG, symbol: 'USDG', name: 'Global Dollar', decimals: 6, tier: 2 }], q: query.q } }),
    'GET /v1/quote': ({ query }) => {
      if (!query.taker && !query.recipient) return { body: { quote: { amountOut: '22453560', fee: { bps: 2 }, estimate: true }, estimate: true } }
      return { body: buildAnswer(query) }
    },
    'GET /v1/contracts': () => ({ body: contractsAnswer() }),
    'GET /v1/order-fee': () => ({ body: { feeBps: 12 } }),
    'POST /rpc': ({ body }) => {
      const m = (body as { method: string }).method
      if (m === 'eth_getTransactionReceipt') return { body: { jsonrpc: '2.0', id: 1, result: { status: '0x1', blockNumber: '0x64', gasUsed: '0x5208', from: '0x00000000000000000000000000000000000000a1', to: ROUTER } } }
      if (m === 'eth_sendRawTransaction') return { body: { jsonrpc: '2.0', id: 1, result: `0x${'ab'.repeat(32)}` } }
      if (m === 'eth_call') {
        const [call] = (body as { params: [{ to: string; data: Hex }] }).params
        return { body: { jsonrpc: '2.0', id: 1, result: ethCallAnswer(call.to, call.data) } }
      }
      return { body: { jsonrpc: '2.0', id: 1, result: `0x${'00'.repeat(32)}` } }
    },
    'GET /v1/orders/setup': ({ query, headers }) => ({ body: { authorizations: [], ready: { chainId: 4663, wallet: query.maker, steps: [], simulation: { ok: true }, readAfter: null, need: { openPullsOf: sessionWallet(headers.authorization) === query.maker ? 'maker' : 'none' } } } }),
    'POST /v1/orders': () => ({ status: 201, body: { hash: `0x${'7'.repeat(64)}`, existing: false } }),
    'GET /v1/orders': ({ headers }) => (sessionWallet(headers.authorization) ? { body: { count: 0, orders: [] } } : { status: 401, body: { error: 'sign in required', code: 'auth-required', retryable: false } }),
    'POST /v1/orders/cancellations': () => ({ body: { results: [] } }),
    'POST /v1/orders/cancel-all-steps': ({ body }) => {
      const b = body as { wallet: string; salt: Hex }
      return { body: { chainId: 4663, wallet: b.wallet, steps: [{ kind: 'cancel-all', to: ORDERS, data: encodeFunctionData({ abi: mancerOrdersV3Abi, functionName: 'cancelAll', args: [b.salt] }), value: '0', gas: '50000', why: 'Voids every order.' }], simulation: { ok: true }, readAfter: null } }
    },
    'POST /v1/transfers/steps': ({ body }) => {
      const b = body as Parameters<typeof transferStep>[0]
      const recipient = (/^0x[0-9a-fA-F]{40}$/.test(b.to) ? b.to : '0x00000000000000000000000000000000000000f1') as Address
      return { body: { chainId: 4663, wallet: b.wallet, steps: [transferStep(b, recipient)], simulation: { ok: true, outcome: { recipient } }, readAfter: null, warnings: [] } }
    },
    'POST /v1/orders/:hash/cancel-steps': ({ body }) => {
      const b = body as { wallet: string; order?: Record<string, unknown> }
      let data: Hex
      try {
        data = encodeFunctionData({ abi: mancerOrdersV3Abi, functionName: 'cancel', args: [b.order as never] })
      } catch {
        return { status: 404, body: { error: 'no order of yours has that hash', code: 'unknown-order', retryable: false } }
      }
      return { body: { chainId: 4663, wallet: b.wallet, steps: [{ kind: 'cancel', to: ORDERS, data, value: '0', gas: '50000', why: 'Voids the order.' }], simulation: { ok: true }, readAfter: null } }
    },
    'GET /v1/books': () => ({ body: { count: 0, books: [] } }),
    'POST /v1/books/:token/steps': ({ body }) => {
      const b = body as { action: string; wallet: string }
      // the arm the kit builds for Book 7; every other act a call the kit would never build
      const call = b.action === 'arm' ? bookCallData(armCall(BOOKS, BOOK_ID)) : { to: BOOK, data: '0xabcd' as Hex, value: 0n }
      return {
        body: {
          action: b.action, book: { token: BOOK, bookId: BOOK_ID.toString(), factory: BOOKS.factory.address, vault: VAULT, phase: 'raising' },
          chainId: 4663, wallet: b.wallet,
          steps: [{ kind: 'call', to: call.to, data: call.data, value: call.value.toString(), gas: '90000', why: 'Arms the raise.' }], simulation: { ok: true }, readAfter: null,
        },
      }
    },
    'GET /v1/me/notifications': ({ headers }) => (sessionWallet(headers.authorization) ? { body: { notifications: [], wallet: sessionWallet(headers.authorization) } } : { status: 401, body: { error: 'sign in required', code: 'session-required', retryable: false } }),
    'PUT /v1/me/following/:id': ({ headers, path }) => (sessionWallet(headers.authorization) ? { body: { address: path.split('/').pop(), follows: { followers: 1 } } } : { status: 401, body: { error: 'sign in required', code: 'session-required', retryable: false } }),
    'GET /v1/limits': ({ headers }) => ({ body: { caller: sessionWallet(headers.authorization) ? { kind: 'session' } : headers.authorization ? { kind: 'key' } : { kind: 'anonymous' }, buckets: [] } }),
    'GET /auth/nonce': ({ query }) => {
      const nonce = Math.random().toString(16).slice(2).padEnd(32, '0')
      const message = loginMessage(query.address!, nonce, Math.floor(Date.now() / 1000))
      nonces.set(nonce, { address: query.address!.toLowerCase(), message })
      return { body: { nonce, message } }
    },
    'POST /auth/verify': async ({ body }) => {
      const b = body as { address: string; signature: Hex; nonce: string }
      const n = nonces.get(b.nonce)
      nonces.delete(b.nonce)
      if (!n || n.address !== b.address.toLowerCase()) return { status: 401, body: { error: 'nonce unknown', code: 'auth-failed', retryable: false } }
      const ok = await verifyMessage({ address: b.address as Address, message: n.message, signature: b.signature }).catch(() => false)
      if (!ok) return { status: 401, body: { error: 'signature does not verify', code: 'auth-failed', retryable: false } }
      return { body: { token: sessionToken(b.address), address: b.address.toLowerCase(), account: b.address.toLowerCase() } }
    },
    'GET /auth/me': ({ headers }) => (sessionWallet(headers.authorization) ? { body: { wallet: sessionWallet(headers.authorization) } } : { status: 401, body: { error: 'sign in required', code: 'auth-required', retryable: false } }),
  }
}

export interface StandIn {
  url: string
  seen: Seen[]
  routes: Record<string, Route>
  close(): Promise<void>
}

function match(routes: Record<string, Route>, method: string, path: string): Route | null {
  if (routes[`${method} ${path}`]) return routes[`${method} ${path}`]!
  for (const [k, r] of Object.entries(routes)) {
    const [m, p] = k.split(' ')
    if (m !== method || !p!.includes(':')) continue
    const re = new RegExp(`^${p!.replace(/:[a-z]+/g, '[^/]+')}$`)
    if (re.test(path)) return r
  }
  return null
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  const t = Buffer.concat(chunks).toString('utf8')
  if (!t) return undefined
  try {
    return JSON.parse(t)
  } catch {
    return t
  }
}

/** Starts the stand-in on a free port of 127.0.0.1. */
export async function standIn(over: Record<string, Route> = {}): Promise<StandIn> {
  const routes = { ...defaultRoutes(), ...over }
  const seen: Seen[] = []
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x')
    const headers: Record<string, string | undefined> = {}
    for (const [k, v] of Object.entries(req.headers)) headers[k] = Array.isArray(v) ? v.join(', ') : v
    const s: Seen = { method: req.method ?? 'GET', path: url.pathname, query: Object.fromEntries(url.searchParams), headers, body: await readBody(req) }
    seen.push(s)
    const route = match(routes, s.method, s.path)
    const answer = route ? await route(s) : { status: 404, body: { error: 'not found', code: 'not-found', retryable: false } }
    res.writeHead(answer.status ?? 200, { 'content-type': 'application/json', ...(answer.headers ?? {}) })
    res.end(answer.body === undefined ? '' : JSON.stringify(answer.body))
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}`,
    seen,
    routes,
    close: () => new Promise<void>((r) => {
      server.close(() => r())
      server.closeAllConnections()
    }),
  }
}

/** The server's settings over a stand-in, with any environment beside. */
export function configFor(api: StandIn, env: Record<string, string> = {}): Config {
  return configFrom({ MANCER_API_URL: api.url, MANCER_SIGN_IN_DOMAIN: 'mancer.xyz', MANCER_MCP_PORT: '0', ...env })
}

/** The server over HTTP, and an MCP client connected to it with these headers on every request. */
export async function httpClient(config: Config, headers: Record<string, string> = {}, log: string[] = []): Promise<{ client: Client; handle: HttpHandle; close: () => Promise<void> }> {
  const handle = await serveHttp(config, { log: (l) => log.push(l) })
  const client = new Client({ name: 'test-client', version: '1.0.0' })
  await client.connect(new StreamableHTTPClientTransport(new URL(handle.url), { requestInit: { headers } }))
  return { client, handle, close: async () => { await client.close().catch(() => {}); await handle.close() } }
}

/** A tool call's answer: its JSON, and whether it is a refusal. */
export async function call(client: Client, name: string, args: Record<string, unknown> = {}): Promise<{ body: Record<string, any>; isError: boolean; text: string }> {
  const r = await client.callTool({ name, arguments: args })
  const text = (r.content as Array<{ text: string }>)[0]!.text
  return { body: JSON.parse(text) as Record<string, any>, isError: r.isError === true, text }
}
