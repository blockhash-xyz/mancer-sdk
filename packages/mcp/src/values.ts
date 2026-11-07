import { createPublicClient, custom, decodeFunctionData, encodeFunctionData, erc20Abi, formatUnits, parseAbi, zeroAddress, type Address, type Hex, type PublicClient } from 'viem'
import { MAINNET_UNISWAP_V3, pinnedContracts, robinhoodChain, type RouterCallReading } from '@blockhash/mancer-sdk'
import { ApiUnreachable, type ApiAnswer, type ApiCall, type Asker } from './api'
import type { Config } from './config'

/**
 * What every tool shares: the names it takes tokens by, amounts as decimals, the API's answers read and its refusals
 * carried, and the unsigned transactions a build answers, each described from its own calldata.
 */

export const CHAIN_ID = 4663
export const WETH = MAINNET_UNISWAP_V3.weth.toLowerCase() as Address
const ADDRESS = /^0x[0-9a-fA-F]{40}$/
const HASH = /^0x[0-9a-fA-F]{64}$/

// ------------------------------------------------------------------------------------------------------- refusals

/** A refusal a tool answers: the API's envelope where the API refused, or the tool's own where an argument is wrong. */
export interface Refusal {
  error: string
  code: string
  retryable: boolean
  retryAfterSeconds?: number
  detail?: unknown
  /** The API's HTTP status, where the API refused. */
  status?: number
  /** One sentence on what to do next, where the code has one. */
  hint?: string
}

export class ToolRefusal extends Error {
  constructor(readonly refusal: Refusal) {
    super(refusal.error)
    this.name = 'ToolRefusal'
  }
}

/** An argument the tool refuses before it asks the API anything. */
export function badArgument(error: string, code = 'bad-argument'): ToolRefusal {
  return new ToolRefusal({ error, code, retryable: false })
}

const SIGN_IN = "Call sign_in with your wallet's address, sign the message it answers with personal_sign from that wallet, then call complete_sign_in with the signature."

/** The refusal of a tool that needs a signed-in wallet, asked with none. */
export function signInRequired(what = 'This needs your signed-in wallet.'): ToolRefusal {
  return new ToolRefusal({ error: what, code: 'sign-in-required', retryable: false, hint: SIGN_IN })
}

/** What to do next for the codes a caller meets most. */
const HINTS: Readonly<Record<string, string>> = {
  'sign-in-required': SIGN_IN,
  'auth-required': `This needs a signed-in wallet. ${SIGN_IN}`,
  'session-required': `This needs a signed-in wallet. ${SIGN_IN}`,
  'session-revoked': `The sign-in was ended. ${SIGN_IN}`,
  'key-scope': "This key's scopes do not cover the act: the scope it needs is in detail.needs. Or sign in with the wallet.",
  'key-session-only': `Only a signed-in wallet may do this, never a key. ${SIGN_IN}`,
  'key-server-only': 'An API key is a server’s alone: send it from a server, never from a browser page.',
  'rate-limited': 'Wait retryAfterSeconds, then ask again. An API key raises the limits.',
  'build-mismatch': "Build again. If it is refused again, the API's build and this server's checks disagree: sign nothing for it.",
  'geo-restricted': 'Issued stocks cannot be traded from this region. Every other token stays open.',
  'wallet-required': 'Name the wallet that signs and sends, or sign in: a build defaults to the signed-in wallet, or to the wallet a wallet key acts as.',
}

/** The API's envelope as a tool carries it: its own fields, never anything else of the answer. */
export function refusalOf(answer: ApiAnswer): Refusal {
  const b = answer.body && typeof answer.body === 'object' && !Array.isArray(answer.body) ? (answer.body as Record<string, unknown>) : {}
  const code = typeof b.code === 'string' ? b.code : answer.status === 429 ? 'rate-limited' : answer.status >= 500 ? 'unavailable' : 'refused'
  const refusal: Refusal = {
    error: typeof b.error === 'string' ? b.error.slice(0, 600) : answer.status >= 500 ? 'unavailable' : 'refused',
    code,
    retryable: typeof b.retryable === 'boolean' ? b.retryable : answer.status === 429 || answer.status >= 500,
    status: answer.status,
  }
  const after = typeof b.retryAfterSeconds === 'number' ? b.retryAfterSeconds : Number(answer.headers.get('retry-after') ?? NaN)
  if (Number.isFinite(after) && after >= 0) refusal.retryAfterSeconds = Math.ceil(after)
  if (b.detail !== undefined) refusal.detail = b.detail
  if (code === 'rate-limited' && typeof b.bucket === 'string') refusal.detail = { bucket: b.bucket }
  if (answer.usedSession && answer.status === 401) refusal.hint = `This connection's sign-in no longer stands, and was forgotten. ${SIGN_IN}`
  else if (HINTS[code]) refusal.hint = HINTS[code]
  return refusal
}

/** The API's answer to one call: its JSON where it succeeded, its envelope as a refusal where it did not. */
export async function ask<T = Record<string, unknown>>(api: Asker, call: ApiCall): Promise<T> {
  let answer: ApiAnswer
  try {
    answer = await api(call)
  } catch (e) {
    if (e instanceof ApiUnreachable) throw new ToolRefusal({ error: e.message, code: e.timedOut ? 'api-timeout' : 'api-unreachable', retryable: true })
    throw e
  }
  if (answer.status >= 200 && answer.status < 300) return (answer.body ?? {}) as T
  throw new ToolRefusal(refusalOf(answer))
}

/** A text with every URL, session token and API key taken out: what a log line may say of an error. */
export function scrubbed(text: string): string {
  return text
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/eyJ[\w-]{4,}\.[\w-]{4,}\.[\w-]{4,}/g, '[token]')
    .replace(/mancer_[A-Za-z0-9_-]{8,}/g, '[key]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [credential]')
}

/** A failure no refusal names (a tool's own fault), as the caller reads it: one opaque line, and the scrubbed head of the
 * error in this server's log alone. */
export function internalRefusal(tool: string, e: unknown, log: (line: string) => void): Refusal {
  const head = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
  log(`mancer-mcp: ${tool}: ${scrubbed(head.split('\n')[0]!.slice(0, 200))}`)
  return { error: 'internal error', code: 'internal-error', retryable: true }
}

// --------------------------------------------------------------------------------------------------------- tokens

/** A token as a tool takes it: an address, lowercase, or native ether. */
export type TokenRef = { native: true; address: Address } | { native: false; address: Address }

/** A token named by its address, or as ETH for native ether (the zero address too). A symbol alone is never taken. */
export function tokenOf(value: string, what = 'token'): TokenRef {
  const v = value.trim()
  if (/^eth$/i.test(v) || v.toLowerCase() === zeroAddress) return { native: true, address: zeroAddress }
  if (!ADDRESS.test(v)) {
    throw badArgument(`${what} is named by its address (0x and 40 hex digits), or ETH for native ether. A symbol alone is never taken: find the address with search_tokens.`, 'bad-token')
  }
  return { native: false, address: v.toLowerCase() as Address }
}

/** An address argument, lowercase. */
export function addressOf(value: string, what: string): Address {
  const v = String(value).trim()
  if (!ADDRESS.test(v)) throw badArgument(`${what} is an address: 0x and 40 hex digits.`, 'bad-address')
  return v.toLowerCase() as Address
}

/** A wallet, profile or Book id the API takes as an address or a username. */
export function idOf(value: string, what: string): string {
  const v = value.trim()
  if (ADDRESS.test(v)) return v.toLowerCase()
  if (/^@?[a-z0-9]{1,32}$/i.test(v)) return v.replace(/^@/, '').toLowerCase()
  throw badArgument(`${what} is an address, or a username of letters and digits.`, 'bad-id')
}

export function hashOf(value: string, what: string): Hex {
  const v = value.trim()
  if (!HASH.test(v)) throw badArgument(`${what} is 0x and 64 hex digits.`, 'bad-hash')
  return v.toLowerCase() as Hex
}

export interface TokenInfo {
  address: Address
  symbol: string | null
  decimals: number
}

// ---------------------------------------------------------------------------------------------------------- the chain

/** Where a tool reads the chain: the caller's API (`api`) and this server's settings (`config`, its own node where one is
 * named). A `ToolContext` is one. */
export interface ChainSource {
  api: Asker
  config: Pick<Config, 'rpcUrl' | 'requestTimeoutMs'>
}

/** A JSON-RPC answer as a read takes it: its result, or the node's own error (another party's text, never carried). */
export interface RpcAnswer {
  result?: unknown
  error?: { code?: unknown; message?: unknown }
}

const NODE_UNAVAILABLE = () => new ToolRefusal({ error: 'The chain did not answer a read: the node this server reads (MANCER_MCP_RPC_URL) did not answer.', code: 'chain-unavailable', retryable: true })

/**
 * One JSON-RPC read of the chain: on this server's own node where `MANCER_MCP_RPC_URL` names one (a local copy that takes
 * no API's word for the chain), and through the API's own chain door (`POST /rpc`) otherwise, as Mancer's hosted copy
 * reads it. Nothing of the node's URL or its error text is carried.
 */
export async function rpc(src: ChainSource, method: string, params: readonly unknown[]): Promise<RpcAnswer> {
  const body = { jsonrpc: '2.0', id: 1, method, params }
  const url = src.config.rpcUrl
  if (!url) return ask<RpcAnswer>(src.api, { method: 'POST', path: '/rpc', body })
  let parsed: unknown
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(src.config.requestTimeoutMs) })
    if (!res.ok) throw NODE_UNAVAILABLE()
    parsed = JSON.parse(await res.text())
  } catch {
    throw NODE_UNAVAILABLE()
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw NODE_UNAVAILABLE()
  return parsed as RpcAnswer
}

/** A reader of the chain as the SDK's checks take one (`readContract`, `getCode`), over `rpc`. */
export function chainOf(src: ChainSource): PublicClient {
  return createPublicClient({
    chain: robinhoodChain,
    transport: custom({
      async request({ method, params }: { method: string; params?: unknown }) {
        const body = await rpc(src, method, (params ?? []) as unknown[])
        if (body.error !== undefined) {
          // a revert, as viem reads one; the node's own words are never carried
          throw Object.assign(new Error('the chain refused the read'), { code: typeof body.error?.code === 'number' ? body.error.code : -32000 })
        }
        return body.result
      },
    }, { retryCount: 0 }),
  }) as PublicClient
}

/** A contract's view read (`eth_call` at the head): its answer, or `chain-unavailable` where the chain gave none. */
export async function ethCall(src: ChainSource, to: Address, data: Hex): Promise<Hex> {
  const body = await rpc(src, 'eth_call', [{ to, data }, 'latest'])
  if (typeof body.result !== 'string' || !/^0x[0-9a-fA-F]*$/.test(body.result)) {
    throw new ToolRefusal({ error: 'The chain did not answer the read.', code: 'chain-unavailable', retryable: true })
  }
  return body.result as Hex
}

// --------------------------------------------------------------------------------------------------------- tokens

const NATIVE: TokenInfo = { address: zeroAddress, symbol: 'ETH', decimals: 18 }
const PINS = pinnedContracts(CHAIN_ID)
/** The kit's own tokens, whose decimals no answer moves: WETH 18 and USDG 6. */
const PINNED: ReadonlyMap<string, TokenInfo> = new Map([
  [WETH, { address: WETH, symbol: 'WETH', decimals: 18 }],
  ...(PINS ? [[PINS.usdg.toLowerCase(), { address: PINS.usdg.toLowerCase() as Address, symbol: 'USDG', decimals: 6 }] as const] : []),
])
/** The most decimals this server takes an amount in: a token that names more is no token it scales an amount for. */
export const MAX_TOKEN_DECIMALS = 36

/** Every other token's decimals, as its own contract answered `decimals()`, kept a while for the process: an hour at the
 * most and 5,000 tokens, so no one answer stands for good. A read that failed is never kept. */
const tokenMemo = new Map<string, { info: TokenInfo; at: number }>()
const TOKEN_MEMO_MAX = 5_000
const TOKEN_MEMO_MS = 60 * 60_000

function remember(info: TokenInfo, now: number): void {
  tokenMemo.delete(info.address)
  tokenMemo.set(info.address, { info, at: now })
  while (tokenMemo.size > TOKEN_MEMO_MAX) {
    const oldest = tokenMemo.keys().next().value
    if (oldest === undefined) break
    tokenMemo.delete(oldest)
  }
}

/** Test-only: forget every token read. */
export function _resetTokenMemoForTests(): void {
  tokenMemo.clear()
}

const TOKEN_READ_ABI = parseAbi(['function decimals() view returns (uint8)'])
const DECIMALS_CALL = encodeFunctionData({ abi: TOKEN_READ_ABI, functionName: 'decimals' })

/** Whether a JSON-RPC error is the call's own failure in the EVM (a revert, an invalid opcode, out of gas), as against the
 * node's or the door's (a throttle, a timeout, a node behind): read to class it alone, never carried. */
function evmFailed(error: { code?: unknown; message?: unknown }): boolean {
  if (error.code === 3) return true
  return typeof error.message === 'string' && /revert|invalid opcode|out of gas|stack (?:under|over)flow|invalid jump/i.test(error.message)
}

const CHAIN_SILENT = (retryAfterSeconds?: number) => new ToolRefusal({ error: 'The chain did not answer the read.', code: 'chain-unavailable', retryable: true, ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}) })

/** A token's decimals, from its own contract's `decimals()` at the head. A contract that answers nothing (no code, a
 * revert, no word) is no token; one that names more than 36 is refused. A read the chain's door or node did not answer (a
 * throttle, a timeout, its own error) is the chain's silence, `chain-unavailable`, to ask again: never a verdict on the
 * token. */
async function decimalsOf(src: ChainSource, address: Address): Promise<number> {
  let body: RpcAnswer
  try {
    body = await rpc(src, 'eth_call', [{ to: address, data: DECIMALS_CALL }, 'latest'])
  } catch (e) {
    // the API's chain door refusing for itself (429, or 5xx: its upstream did not answer)
    const r = e instanceof ToolRefusal ? e.refusal : null
    if (r && r.status !== undefined && (r.status === 429 || r.status >= 500)) throw CHAIN_SILENT(r.retryAfterSeconds)
    throw e
  }
  if (body.error !== undefined) {
    if (!evmFailed(body.error ?? {})) throw CHAIN_SILENT()
    throw badArgument(`No token at ${address} answers decimals().`, 'unknown-token')
  }
  if (typeof body.result !== 'string') throw new ToolRefusal({ error: 'The chain did not answer the read.', code: 'chain-unavailable', retryable: true })
  if (!/^0x[0-9a-fA-F]{64}$/.test(body.result)) throw badArgument(`No token at ${address} answers decimals().`, 'unknown-token')
  const n = BigInt(body.result)
  if (n > BigInt(MAX_TOKEN_DECIMALS)) throw badArgument(`The token at ${address} names ${n > 999n ? 'more than 999' : n.toString()} decimals, over the ${MAX_TOKEN_DECIMALS} this server takes an amount in.`, 'bad-token-decimals')
  return Number(n)
}

/** The decimals and symbols of these tokens. Native ether, WETH and USDG are the kit's own (18, 18 and 6); every other
 * token's decimals are its own contract's word (`decimals()`), never the API's token index, whose number has stood wrong
 * for a token it read before the token existed. The index names the symbol alone, for display, where it has one. */
export async function tokenInfos(src: ChainSource, refs: readonly TokenRef[], now = Date.now()): Promise<Map<string, TokenInfo>> {
  const out = new Map<string, TokenInfo>()
  const wanted: Address[] = []
  for (const r of refs) {
    if (r.native) {
      out.set(zeroAddress, NATIVE)
      continue
    }
    const pinned = PINNED.get(r.address)
    if (pinned) {
      out.set(r.address, pinned)
      continue
    }
    const held = tokenMemo.get(r.address)
    if (held && now - held.at < TOKEN_MEMO_MS) out.set(r.address, held.info)
    else if (!wanted.includes(r.address)) wanted.push(r.address)
  }
  if (wanted.length === 0) return out
  const symbols = ask<{ tokens?: Array<{ address?: unknown; symbol?: unknown }> }>(src.api, { method: 'POST', path: '/v1/tokens/resolve', body: { addresses: wanted } })
    .then((page) => {
      const m = new Map<string, string>()
      for (const t of page.tokens ?? []) if (typeof t.address === 'string' && typeof t.symbol === 'string') m.set(t.address.toLowerCase(), t.symbol.slice(0, 64))
      return m
    })
    .catch(() => new Map<string, string>())
  const decimals = await Promise.all(wanted.map((a) => decimalsOf(src, a)))
  const named = await symbols
  wanted.forEach((address, i) => {
    const info: TokenInfo = { address, symbol: named.get(address) ?? null, decimals: decimals[i]! }
    remember(info, now)
    out.set(address, info)
  })
  return out
}

// -------------------------------------------------------------------------------------------------------- amounts

const DECIMAL = /^(?:0|[1-9]\d{0,77})(?:\.\d{1,77})?$/

/** A decimal amount in a token's own units, as raw units. Above zero unless `zero` allows it. */
export function rawOf(amount: string, decimals: number, what = 'amount', zero = false): bigint {
  const v = String(amount).trim().replace(/_/g, '')
  if (!DECIMAL.test(v)) throw badArgument(`${what} is a decimal number in the token's own units, such as "0.25".`, 'bad-amount')
  const [whole, fraction = ''] = v.split('.')
  if (fraction.length > decimals) throw badArgument(`${what} has more decimal places than the token's ${decimals}.`, 'bad-amount')
  const raw = BigInt(whole!) * 10n ** BigInt(decimals) + BigInt((fraction + '0'.repeat(decimals)).slice(0, decimals) || '0')
  if (!zero && raw === 0n) throw badArgument(`${what} is above zero.`, 'bad-amount')
  if (raw >= 2n ** 255n) throw badArgument(`${what} is too large.`, 'bad-amount')
  return raw
}

/** A raw amount as a tool answers it: the decimal in the token's own units beside the raw units. */
export function amountOf(raw: bigint | string, info: TokenInfo): { token: string; symbol: string | null; amount: string; raw: string } {
  const r = typeof raw === 'bigint' ? raw : BigInt(raw)
  return { token: info.address === zeroAddress ? 'ETH' : info.address, symbol: info.symbol, amount: formatUnits(r, info.decimals), raw: r.toString() }
}

// ------------------------------------------------------------------------------------------- unsigned transactions

/** A transaction the caller's own wallet signs and sends, as every build answers it. */
export interface UnsignedTx {
  kind: string
  chainId: number
  to: string
  data: string
  /** Wei, decimal. */
  value: string
  /** The gas limit the API's simulation proved, decimal; null where the simulation did not reach the step. */
  gas: string | null
  /** One sentence: what the transaction does. */
  why: string
  /** What the calldata says, read from the calldata itself. */
  does?: Record<string, unknown>
  /** A read the agent makes right before it sends this transaction, at the latest block: where the chain answers
   * otherwise, it sends nothing and builds again. */
  precondition?: TxPrecondition
}

/** A read of the chain a transaction stands on (`UnsignedTx.precondition`). */
export interface TxPrecondition {
  /** The function read, with its argument: `settleAssetFor(7)`. */
  read: string
  /** The `eth_call` that reads it: to the contract, with this calldata. */
  call: { to: string; data: string }
  /** What it must answer, lowercase. */
  answers: string
  /** What its zero address answer means, where it means one: WETH, lowercase. */
  zeroAddressIs?: string
  /** What to do where it answers otherwise. */
  otherwise: string
}

const WETH_ABI = parseAbi(['function deposit() payable', 'function withdraw(uint256)'])

/** What a step's calldata says, where it is one this server reads: an approval, a wrap, or an unwrap. */
export function stepDoes(step: { kind: string; to: string; data: string; value: string }, infos: Map<string, TokenInfo>): Record<string, unknown> | undefined {
  try {
    const data = step.data as Hex
    if (data.startsWith('0x095ea7b3')) {
      const d = decodeFunctionData({ abi: erc20Abi, data })
      if (d.functionName === 'approve') {
        const [spender, amount] = d.args as [Address, bigint]
        const info = infos.get(step.to.toLowerCase())
        return { call: 'approve', token: step.to.toLowerCase(), symbol: info?.symbol ?? null, spender: spender.toLowerCase(), amount: info ? formatUnits(amount, info.decimals) : null, raw: amount.toString() }
      }
    }
    if (step.to.toLowerCase() === WETH && data.startsWith('0xd0e30db0')) {
      return { call: 'deposit', wraps: { token: 'ETH', amount: formatUnits(BigInt(step.value), 18), raw: step.value }, into: WETH }
    }
    if (step.to.toLowerCase() === WETH && data.startsWith('0x2e1a7d4d')) {
      const d = decodeFunctionData({ abi: WETH_ABI, data })
      const [amount] = d.args as [bigint]
      return { call: 'withdraw', unwraps: { token: WETH, amount: formatUnits(amount, 18), raw: amount.toString() } }
    }
  } catch {
    // a calldata this reader does not know is described by its kind and why alone
  }
  return undefined
}

/** A router call's reading (the SDK's, from its own calldata), as a tool answers it: each amount as a decimal beside its
 * raw units. */
export function swapReadingOf(r: RouterCallReading, infos: Map<string, TokenInfo>): Record<string, unknown> {
  const amount = (token: Address | null, raw: bigint) => {
    if (token === null) return amountOf(raw, NATIVE)
    const info = infos.get(token.toLowerCase())
    return info ? amountOf(raw, info) : { token: token.toLowerCase(), symbol: null, amount: null, raw: raw.toString() }
  }
  return {
    entry: r.entry,
    spends: amount(r.spends.token, r.spends.amount),
    receivesAtLeast: amount(r.delivers.token, r.delivers.atLeast),
    recipient: r.recipient === 'sender' ? 'the sender' : r.recipient.toLowerCase(),
    deadline: new Date(Number(r.deadline) * 1000).toISOString(),
    fee: { bps: r.fee.bps, side: r.fee.side, token: r.fee.asset === null ? 'ETH' : r.fee.asset.toLowerCase() },
    legs: r.legs,
  }
}

/** What to do with a build's transactions: the line the tool names where the simulation passed, and where it did not, that
 * nothing will land as it stands. Why it did not pass is the simulation's own data (`simulation.revert`), which a contract,
 * a token or a node wrote: it is never part of this server's own sentence. */
export function nextFor(simulation: unknown, wallet: string | null, line: string): string {
  const s = simulation as { ok?: unknown } | null
  if (s && s.ok === false) {
    const who = wallet && /^0x[0-9a-fA-F]{40}$/.test(wallet) ? wallet.toLowerCase() : 'the wallet'
    return `The simulation from ${who} did not pass, and simulation.revert holds what the chain answered, as data. These transactions will not land as they stand: fund the wallet or change the request, then build again.`
  }
  return line
}
