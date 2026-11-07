import { getAddress, keccak256, recoverAddress, recoverMessageAddress, zeroAddress, type Abi, type Address, type Hex, type PublicClient } from 'viem'
import { MancerCheckError } from './errors'
import {
  BOOK_LIGHTER_ADAPTER_ABI,
  BOOK_PERPS_ACCOUNT_ABI,
  BOOK_SHARED,
  LIGHTER_ENVIRONMENTS,
  LIGHTER_RH_DEPLOYMENT,
  MANCER_SPLIT_SIGNER,
  SPLIT_KINDS,
  bookAbisFor,
  bookPerpsKeyAuthorization,
  bookPerpsKeyContext,
  bookPerpsSlotOf,
  bookTradeIntentFromQuote,
  decodeBookPerpsRoute,
  isBookPerpsTraderSlot,
  isLighterRegionError,
  lighterErrorOf,
  lighterPubKeyProblem,
  parseBookPerpsKeyContext,
  splitAnswerOf,
  splitFilesProblem,
  splitKeyGenMsgOf,
  splitKeyHex,
  startSplitSigner,
  type BookPerpsDeployment,
  type BookQuote,
  type BookTradeIntent,
  type SplitAnswer,
  type SplitKeyGenMsg,
  type SplitKind,
  type SplitShare,
  type SplitSigned,
  type SplitSigner,
  type SplitTx,
} from './shared'
import type { ChainBook } from './books'

/**
 * Perps inside Books, a trader's own half: a Book vault's Lighter key at each trader's slot is split 2-of-2 between the
 * trader and Mancer's vault-key service (the kit's lighter/split.ts), so neither signs a vault's order alone. A bot holds
 * its half as the site's desk does: it makes the half with Mancer's service (`setupKey`), keeps it itself (a file of its
 * own at mode 0600, `writeBooksPerpsShare`), checks every deposit that registers a key before it signs (`checkBookPerpsOwnKey`,
 * `checkBookPerpsTraderKey`), and signs every order with its half after Mancer's answer is held to exactly what it asked
 * (`checkBookPerpsOrderAnswer`), then sends to Lighter itself.
 *
 * The split signer is Mancer's module (packages/perps-split), served at https://mancer.xyz/lighter-split/ and held here to
 * the kit's pin (`MANCER_SPLIT_SIGNER`) before a byte of it runs; it is not part of this package. A bot fetches the two
 * files (`fetchBooksPerpsSplitFiles`) or keeps its own copies (`booksPerpsSplitFilesFrom`), and starts it once
 * (`loadBooksPerpsSplit`). Nothing here imports a Node module: a file is read or written through the `fs` the caller hands
 * in, and the runtime is run by the caller's `evaluate` (node:vm's `runInThisContext` in Node).
 */

const refuse = (reason: string): never => {
  throw new MancerCheckError('perps', reason)
}
const same = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.toLowerCase() === b.toLowerCase()
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** Lighter RH's environment: the chain every vault order is signed for, and the one host it is sent to. */
const LIGHTER = LIGHTER_ENVIRONMENTS['rh-mainnet']
/** Lighter's `sendTx` on RH mainnet, pinned: an answer that names another address is refused. */
export const BOOKS_PERPS_SEND_URL = `${LIGHTER.restUrl}/api/v1/sendTx`
/** How far ahead an order's `expiredAt` may stand: the API names 5 to 60 seconds, and a clock may trail by a few. */
export const BOOKS_PERPS_EXPIRY_MIN_MS = 5_000
export const BOOKS_PERPS_EXPIRY_MAX_MS = 70_000

// ------------------------------------------------------------------------------------------------ the module

/** The split signer's two files: its module and Go's runtime of the release that built it. */
export interface BooksPerpsSplitFiles {
  wasm: Uint8Array
  runtime: string
}

/** What a reader of the two files needs: node:fs's `readFileSync`, or anything that answers the same. */
export interface BooksPerpsFileReader {
  readFileSync(path: string): Uint8Array | string
}

/** The two files from a folder of the caller's own, by the kit's pinned names (each held to the pin when it is loaded). */
export function booksPerpsSplitFilesFrom(fs: BooksPerpsFileReader, dir: string): BooksPerpsSplitFiles {
  const join = (name: string) => `${dir.replace(/\/+$/, '')}/${name}`
  const wasm = fs.readFileSync(join(MANCER_SPLIT_SIGNER.wasm.file))
  const runtime = fs.readFileSync(join(MANCER_SPLIT_SIGNER.runtime.file))
  return {
    wasm: typeof wasm === 'string' ? new TextEncoder().encode(wasm) : new Uint8Array(wasm),
    runtime: typeof runtime === 'string' ? runtime : new TextDecoder().decode(runtime),
  }
}

/** The two files fetched from mancer.xyz (`MANCER_SPLIT_SIGNER.path`), or another origin a bot names (its own mirror): held
 * to the pin when they are loaded, wherever they came from. */
export async function fetchBooksPerpsSplitFiles(options: { origin?: string; fetch?: typeof fetch } = {}): Promise<BooksPerpsSplitFiles> {
  const origin = (options.origin ?? 'https://mancer.xyz').replace(/\/+$/, '')
  const f = options.fetch ?? globalThis.fetch
  const get = async (name: string) => {
    const res = await f(`${origin}${MANCER_SPLIT_SIGNER.path}${name}`, { cache: 'no-store' } as RequestInit)
    if (!res.ok) refuse(`the split signer's ${name} did not download (${res.status})`)
    return new Uint8Array(await res.arrayBuffer())
  }
  const [wasm, runtime] = await Promise.all([get(MANCER_SPLIT_SIGNER.wasm.file), get(MANCER_SPLIT_SIGNER.runtime.file)])
  return { wasm, runtime: new TextDecoder().decode(runtime) }
}

let started: Promise<SplitSigner> | null = null

/**
 * The split signer started from its files, held to the kit's pin first (`startSplitSigner`): once a process, since its
 * exports live on the global object. A later call is held to the pin too and answers the one already running. `evaluate`
 * runs Go's runtime as a classic script (node:vm's `runInThisContext` in Node); by default a `Function` of it.
 */
export async function loadBooksPerpsSplit(files: BooksPerpsSplitFiles, options: { evaluate?: (code: string) => void } = {}): Promise<SplitSigner> {
  const evaluate = options.evaluate ?? ((code: string) => new Function(code)())
  if (started) {
    const problem = await splitFilesProblem(files)
    if (problem) refuse(problem)
    return started
  }
  const run = startSplitSigner(files, evaluate)
  started = run
  run.catch(() => {
    if (started === run) started = null
  })
  return run
}

// ------------------------------------------------------------------------------------------------ the share

/** A trader's half of a vault's key at its slot, as a bot keeps it: what it is for, and the share itself (its `secret` is
 * the half's secret scalar: never sent, never logged). */
export interface BooksPerpsShare {
  v: 1
  /** The Book's token. */
  token: Address
  /** The trader's wallet. */
  wallet: Address
  /** The vault's perps account (BookPerpsAccount). */
  account: Address
  slot: number
  /** Lighter's signing chain. */
  chainId: number
  /** The joint key, `0x` and 80 hex digits: what Lighter registers at the slot. */
  key: Hex
  share: SplitShare
  createdAt: string
}

/** What writing and reading a share's file needs: node:fs, or anything that answers the same. */
export interface BooksPerpsShareFs {
  writeFileSync(path: string, data: string, options: { mode: number; flag: string }): void
  readFileSync(path: string, encoding: 'utf8'): string
  statSync(path: string): { mode: number; uid?: number; isFile(): boolean }
}

/** Why a share record is not one, or null where it is. */
function shareProblem(r: unknown): string | null {
  if (!isObj(r) || r.v !== 1) return 'not a share of a Book vault’s key'
  if (typeof r.token !== 'string' || typeof r.wallet !== 'string' || typeof r.account !== 'string') return 'the share names no Book, wallet or account'
  if (!isBookPerpsTraderSlot(r.slot as number)) return 'the share names no trader slot'
  if (typeof r.key !== 'string' || lighterPubKeyProblem(r.key as Hex)) return 'the share names no Lighter key'
  const s = r.share
  if (!isObj(s) || s.party !== 1 || s.peerParty !== 2) return 'the share is not a trader’s half'
  if (typeof s.group !== 'string' || splitKeyHex(s.group) !== (r.key as string).toLowerCase()) return 'the share is of another key than it names'
  const ctx = typeof s.context === 'string' ? parseBookPerpsKeyContext(s.context) : null
  if (!ctx || ctx.slot !== r.slot || !same(ctx.account, r.account as string) || ctx.chainId !== r.chainId) return 'the share’s context names another key'
  return null
}

/**
 * Writes a share to a file of its own, never over another (flag `wx`), readable by the caller's user alone (mode 0600),
 * then reads the file's mode back and refuses it where any other user may read it.
 */
export function writeBooksPerpsShare(fs: BooksPerpsShareFs, path: string, share: BooksPerpsShare): void {
  const problem = shareProblem(share)
  if (problem) refuse(problem)
  fs.writeFileSync(path, `${JSON.stringify(share)}\n`, { mode: 0o600, flag: 'wx' })
  const st = fs.statSync(path)
  if (!st.isFile() || (st.mode & 0o077) !== 0) refuse(`the share's file ${path} is open to other users`)
}

/** Reads a share back from its file: a regular file no other user may read (and of `uid` where named), a share of a
 * vault's key, and the one `expect` names where it names one. */
export function readBooksPerpsShare(
  fs: BooksPerpsShareFs,
  path: string,
  options: { uid?: number; expect?: { token?: Address; wallet?: Address; slot?: number; key?: Hex } } = {},
): BooksPerpsShare {
  const st = fs.statSync(path)
  if (!st.isFile()) refuse(`the share's file ${path} is not a regular file`)
  if ((st.mode & 0o077) !== 0) refuse(`the share's file ${path} is open to other users (mode ${(st.mode & 0o777).toString(8)}): make it 600`)
  if (options.uid !== undefined && st.uid !== undefined && st.uid !== options.uid) refuse(`the share's file ${path} is another user's`)
  let r: unknown
  try {
    r = JSON.parse(fs.readFileSync(path, 'utf8'))
  } catch {
    return refuse(`the share's file ${path} does not read`)
  }
  const problem = shareProblem(r)
  if (problem) refuse(problem)
  const s = r as BooksPerpsShare
  const e = options.expect ?? {}
  if (e.token && !same(e.token, s.token)) refuse('the share is of another Book')
  if (e.wallet && !same(e.wallet, s.wallet)) refuse('the share is of another wallet')
  if (e.slot !== undefined && e.slot !== s.slot) refuse('the share is of another slot')
  if (e.key && !same(e.key, s.key)) refuse('the share is of another key')
  return s
}

// ------------------------------------------------------------------------------------------------ the wire

/** A trader's split key as the API bound it (`POST /v1/books/:token/perps/keys`, and each slot of the perps read). */
export interface BookPerpsBoundKey {
  slot: number
  trader: string
  context: string
  traderMsg: SplitKeyGenMsg
  mancerMsg: SplitKeyGenMsg
  /** X, `0x` and 80 hex digits. */
  group: string
  authorization: { message: string; signature: string }
  createdAt: string
}

/** One trader slot of a vault's perps account, as the perps read names it. */
export interface BookPerpsKeySlot {
  slot: number
  trader: string
  lighterKey: string | null
  lighterKeyRead: boolean
  bound: BookPerpsBoundKey | null
  registered: boolean | null
}

/** `GET /v1/books/:token/perps`, the parts a trader's client reads. */
export interface BookPerpsRead {
  book: { token: string; vault: string; bookId: string; factory: string; phase: string; traders: string[] }
  trader: boolean
  account: { address: string | null; deployed: boolean | null; accountIndex: number | null }
  keys: BookPerpsKeySlot[]
  [field: string]: unknown
}

/** `POST /v1/books/:token/perps/keys`. */
export interface BookPerpsKeyAnswer {
  key: BookPerpsBoundKey
  registered: boolean | null
}

/** A ready-to-sign step of a Books perps route. */
interface PerpsStep {
  kind: string
  to: string
  data: Hex
  value: string
  gas: string | null
  why: string
}

/** `POST /v1/books/:token/perps/deposit`. */
export interface BookPerpsDepositAnswer {
  chainId: number
  wallet: string
  steps: PerpsStep[]
  simulation: { ok: boolean; [k: string]: unknown } | null
  readAfter: unknown
  quote: Record<string, string>
  digest: string
  account: { address: string; deployed: boolean | null; accountIndex: number | null }
  key: { slot: number; carried: boolean; reason: string; bound: BookPerpsBoundKey | null }
  confirm: unknown
}

/** One of the six kinds a split key co-signs, with its params as the vault-key service names them. */
export interface BookPerpsOrderRequest {
  kind: SplitKind
  params: Record<string, number | boolean | null>
}

/** `POST /v1/books/:token/perps/orders`. */
export interface BookPerpsOrderAnswer {
  tx: SplitTx
  mancer: SplitAnswer
  txType: number
  txHash: string
  nonce: number
  expiresAt: number
  account: { address: string; accountIndex: number; slot: number; key: string }
  kind: string
  risk: string
  market: { index: number; symbol: string } | null
  send: { url: string; fields: Record<string, unknown>; why: string }
  report: { method: 'POST'; path: string }
}

/** `POST /v1/books/:token/perps/orders/:hash`. */
export interface BookPerpsOrderReport {
  txHash: string
  status: string
  nonce: number | null
  expiresAt: number | null
}

// ------------------------------------------------------------------------------------------------ the chain's word

/** What the caller's node says of a Book's perps: its perps deployment (the adapter, its code the reviewed build), the
 * vault's traders in the factory's order (each trader's slot by its place), the vault's perps account and, where it
 * stands, its Lighter index. */
export interface BookPerpsChain {
  perps: BookPerpsDeployment
  traders: Address[]
  account: Address
  deployed: boolean
  /** null where the account does not stand yet, or Lighter has not indexed it. */
  accountIndex: number | null
}

/** The Book's perps read on the caller's own node. */
export async function readBookPerpsChain(chain: Pick<PublicClient, 'readContract' | 'getCode'>, book: ChainBook, deployments: readonly BookPerpsDeployment[]): Promise<BookPerpsChain> {
  const perps = deployments.find((p) => same(p.factory, book.deployment.factory.address)) ?? refuse("the Book's factory has no perps adapter this SDK pins")
  const code = await chain.getCode({ address: getAddress(perps.adapter) })
  if (!code || code === '0x' || keccak256(code).toLowerCase() !== perps.runtimeCodeHash.toLowerCase()) refuse("the perps adapter's code on your node is not the reviewed build")
  const factoryAbi = bookAbisFor(book.deployment).factory as Abi
  const [traders, account] = await Promise.all([
    chain.readContract({ address: book.deployment.factory.address, abi: factoryAbi, functionName: 'tradersOf', args: [book.bookId] }) as Promise<readonly Address[]>,
    chain.readContract({ address: getAddress(perps.adapter), abi: BOOK_LIGHTER_ADAPTER_ABI, functionName: 'perpsAccountOf', args: [book.vault] }) as Promise<Address>,
  ])
  if (!account || same(account, zeroAddress)) refuse('the adapter names no perps account for the vault')
  const accountCode = await chain.getCode({ address: getAddress(account) })
  const deployed = !!accountCode && accountCode !== '0x'
  let accountIndex: number | null = null
  if (deployed) {
    const i = Number((await chain.readContract({ address: getAddress(account), abi: BOOK_PERPS_ACCOUNT_ABI, functionName: 'masterAccountIndex', args: [] })) as bigint | number)
    accountIndex = Number.isSafeInteger(i) && i > 0 ? i : null
  }
  return { perps, traders: traders.map((t) => getAddress(t)), account: getAddress(account), deployed, accountIndex }
}

/** A wallet's slot among the vault's traders, as the node names them. */
export function bookPerpsTraderSlotOf(c: BookPerpsChain, wallet: Address): number {
  return bookPerpsSlotOf(c.traders, wallet) ?? refuse("this wallet is not one of the Book's traders")
}

// ------------------------------------------------------------------------------------------------ the key

/** The key generation's context for a trader's slot: Lighter RH's chain, the vault's perps account, the slot, and a fresh
 * session of 16 random bytes. */
export function newBooksPerpsKeyContext(account: Address, slot: number, chainId: number = LIGHTER.chainId): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return bookPerpsKeyContext({ chainId, account, slot, session: Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('') })
}

/**
 * Mancer's answer to a key generation held to what was asked, before the trader's half is finished with it: the slot, the
 * trader and the context asked; the trader's own message and authorization as sent; Mancer's message of party 2 under the
 * same context. The finish (`keyGenFinish`) then checks Mancer's proof of possession, and its joint key must be the
 * answer's.
 */
export function checkBookPerpsKeyAnswer(answer: BookPerpsKeyAnswer, asked: { slot: number; wallet: Address; context: string; msg: SplitKeyGenMsg; message: string; signature: Hex }): BookPerpsBoundKey {
  const k = isObj(answer) && isObj(answer.key) ? answer.key : refuse('the key answer does not read')
  if (k.slot !== asked.slot) refuse('the key is bound to another slot than the trader’s')
  if (!same(k.trader, asked.wallet)) refuse('the key is bound to another trader')
  if (k.context !== asked.context) refuse('the key names another context than the one asked')
  let traderMsg: SplitKeyGenMsg
  let mancerMsg: SplitKeyGenMsg
  try {
    traderMsg = splitKeyGenMsgOf(k.traderMsg)
    mancerMsg = splitKeyGenMsgOf(k.mancerMsg)
  } catch {
    return refuse('the key’s messages do not read')
  }
  if (JSON.stringify(traderMsg) !== JSON.stringify(asked.msg)) refuse('the key names another trader share than this one')
  if (mancerMsg.party !== 2 || mancerMsg.context !== asked.context) refuse('Mancer’s message is not of this key generation')
  if (!isObj(k.authorization) || k.authorization.message !== asked.message || !same(k.authorization.signature, asked.signature)) refuse('the key carries another authorization than the wallet signed')
  if (typeof k.group !== 'string' || lighterPubKeyProblem(k.group as Hex)) refuse('the key names no Lighter key')
  return k
}

/**
 * The trader's own deposit's key check, before the wallet signs a `proposeTrade` whose route carries a key: the route's
 * key is the trader's own half's public share plus Mancer's (`join`), Mancer's message under the bound key's context with a
 * proof that verifies, the context naming this account and the trader's slot, and the route's slot that slot. The share
 * must be the half this client holds.
 */
export function checkBookPerpsOwnKey(split: SplitSigner, e: { route: { account: Address; apiKeyIndex: number; pubKey: Hex }; share: BooksPerpsShare; bound: BookPerpsBoundKey | null; account: Address; slot: number }): void {
  const { route, share, bound } = e
  if (!same(route.account, e.account)) refuse('the route names another account than the vault’s perps account')
  if (route.apiKeyIndex !== e.slot) refuse('the route puts the key at another slot than this trader’s')
  if (share.slot !== e.slot || !same(share.account, e.account)) refuse('this client holds no half of a key at that slot')
  if (!bound) return refuse('the answer names no bound key for the route’s key')
  if (bound.slot !== e.slot) refuse('the bound key is of another slot')
  const ctx = parseBookPerpsKeyContext(bound.context)
  if (!ctx || ctx.slot !== e.slot || !same(ctx.account, e.account) || ctx.chainId !== share.chainId) refuse('the bound key’s context names another key')
  if (bound.context !== share.share.context) refuse('the bound key is of another key generation than this client’s half')
  if (bound.traderMsg?.public !== share.share.public) refuse('the bound key names another trader share than this client’s')
  let mancer: SplitKeyGenMsg
  try {
    mancer = splitKeyGenMsgOf(bound.mancerMsg)
  } catch {
    return refuse('Mancer’s message does not read')
  }
  if (mancer.party !== 2 || mancer.context !== bound.context) refuse('Mancer’s message is not of the bound key')
  if (mancer.public !== share.share.peerPublic) refuse('Mancer’s share is not the one this client’s half was made with')
  try {
    split.verifyPop(mancer)
  } catch {
    refuse('Mancer’s proof of possession does not verify')
  }
  const joint = splitKeyHex(split.join(share.share.public, mancer.public))
  if (joint !== route.pubKey.toLowerCase()) refuse('the route’s key is not this client’s half plus Mancer’s')
  if (!same(bound.group, joint) || !same(share.key, joint)) refuse('the bound key is not this client’s half plus Mancer’s')
}

/**
 * A confirming trader's check of a deposit another trader proposed that carries a key: the route's slot is a trader slot,
 * the trader at that place among the vault's traders (`traders`) is the one bound, the bound key's context names this
 * account and slot, both messages carry a proof that verifies under it, the trader's wallet signed the kit's authorization
 * of its share (rebuilt here from the fields, never taken from the answer: a wallet's own signature, or a contract
 * wallet's word on the caller's node), and the route's key is the two shares joined.
 */
export async function checkBookPerpsTraderKey(
  split: SplitSigner,
  chain: Partial<Pick<PublicClient, 'verifyMessage'>>,
  e: { token: Address; route: { account: Address; apiKeyIndex: number; pubKey: Hex }; account: Address; traders: readonly Address[]; bound: BookPerpsBoundKey | null; chainId?: number },
): Promise<void> {
  const { route, bound } = e
  const chainId = e.chainId ?? LIGHTER.chainId
  if (!same(route.account, e.account)) refuse('the route names another account than the vault’s perps account')
  if (!isBookPerpsTraderSlot(route.apiKeyIndex)) refuse('the route puts the key at no trader slot')
  const trader = e.traders[route.apiKeyIndex - 42] ?? refuse('the route’s slot is no trader’s of this Book')
  if (!bound) return refuse('no key is bound for the route’s slot')
  if (bound.slot !== route.apiKeyIndex || !same(bound.trader, trader)) refuse('the bound key is of another slot or trader')
  const ctx = parseBookPerpsKeyContext(bound.context)
  if (!ctx || ctx.slot !== route.apiKeyIndex || !same(ctx.account, e.account) || ctx.chainId !== chainId) refuse('the bound key’s context names another key')
  let traderMsg: SplitKeyGenMsg
  let mancerMsg: SplitKeyGenMsg
  try {
    traderMsg = splitKeyGenMsgOf(bound.traderMsg)
    mancerMsg = splitKeyGenMsgOf(bound.mancerMsg)
  } catch {
    return refuse('the bound key’s messages do not read')
  }
  if (traderMsg.party !== 1 || traderMsg.context !== bound.context || mancerMsg.party !== 2 || mancerMsg.context !== bound.context) refuse('the bound key’s messages are of another key generation')
  for (const m of [traderMsg, mancerMsg]) {
    try {
      split.verifyPop(m)
    } catch {
      refuse('a proof of possession of the bound key does not verify')
    }
  }
  const message = bookPerpsKeyAuthorization({ token: e.token, account: e.account, chainId, slot: route.apiKeyIndex, traderShare: splitKeyHex(traderMsg.public), context: bound.context })
  const signature = bound.authorization?.signature as Hex | undefined
  if (!signature || !/^0x[0-9a-fA-F]+$/.test(signature)) return refuse('the bound key carries no wallet signature')
  if (bound.authorization.message !== message) refuse('the bound key’s authorization is not the kit’s message of its share')
  let signed = false
  try {
    signed = same(await recoverMessageAddress({ message, signature }), trader)
  } catch {
    signed = false
  }
  if (!signed && chain.verifyMessage) {
    try {
      signed = await chain.verifyMessage({ address: trader, message, signature })
    } catch {
      signed = false
    }
  }
  if (!signed) refuse('the slot’s trader did not sign the bound key’s authorization')
  const joint = splitKeyHex(split.join(traderMsg.public, mancerMsg.public))
  if (joint !== route.pubKey.toLowerCase() || !same(bound.group, joint)) refuse('the route’s key is not the slot trader’s share plus Mancer’s')
}

// ------------------------------------------------------------------------------------------------ the deposit

/** A deposit's quote read from its wire (decimal strings). */
export function bookPerpsDepositQuoteOf(wire: Record<string, string>): BookQuote {
  const big = (k: string) => (typeof wire[k] === 'string' && /^\d+$/.test(wire[k]!) ? BigInt(wire[k]!) : refuse(`the quote's ${k} does not read`))
  const hex = (k: string) => (typeof wire[k] === 'string' && /^0x[0-9a-fA-F]*$/.test(wire[k]!) ? (wire[k] as Hex) : refuse(`the quote's ${k} does not read`))
  return {
    adapter: getAddress(hex('adapter')), tokenIn: getAddress(hex('tokenIn')), tokenOut: getAddress(hex('tokenOut')),
    amountIn: big('amountIn'), minOut: big('minOut'), route: hex('route'), deadline: big('deadline'), salt: big('salt'), signature: hex('signature'),
  }
}

/**
 * A perps deposit's signed quote held to what was asked and to the caller's node, before `proposeTrade` is signed: the
 * deployment's perps adapter, USDG in and WETH out, the amount asked, a floor of 0, ahead of the node's clock, signed by
 * the factory's Mancer signer over the vault's own digest (`digest`, computed by the caller), and a route to the vault's
 * own perps account carrying no key at slot 0 or the trader's own key at its slot (`checkBookPerpsOwnKey`). Answers the
 * vault trade's intent at the vault's trade nonce.
 */
export async function checkBookPerpsDepositQuote(
  split: SplitSigner,
  e: {
    quote: BookQuote
    amount: bigint
    perps: BookPerpsDeployment
    account: Address
    slot: number
    share: BooksPerpsShare
    key: BookPerpsDepositAnswer['key']
    digest: Hex
    mancerSigner: Address
    chainNow: bigint
    tradeNonce: bigint
  },
): Promise<BookTradeIntent> {
  const q = e.quote
  if (!same(q.adapter, e.perps.adapter)) refuse('the quote names another adapter than the perps adapter')
  if (!same(q.tokenIn, LIGHTER_RH_DEPLOYMENT.collateral.token) || !same(q.tokenOut, BOOK_SHARED.weth)) refuse('the quote does not deposit USDG')
  if (q.amountIn !== e.amount) refuse('the quote is for another amount than the one asked')
  if (q.minOut !== 0n) refuse('the quote names a floor a deposit does not have')
  if (q.deadline <= e.chainNow) refuse('the quote ran out')
  let route: { account: Address; apiKeyIndex: number; pubKey: Hex }
  try {
    route = decodeBookPerpsRoute(q.route)
  } catch {
    return refuse('the route is not a perps deposit’s canonical route')
  }
  if (!same(route.account, e.account)) refuse('the route names another account than the vault’s perps account')
  if (route.pubKey === '0x') {
    if (route.apiKeyIndex !== 0 || e.key?.carried) refuse('the route carries no key where the answer says it does')
  } else {
    if (!e.key?.carried || e.key.slot !== e.slot) refuse('the route carries a key the answer does not name')
    checkBookPerpsOwnKey(split, { route, share: e.share, bound: e.key.bound, account: e.account, slot: e.slot })
  }
  let signer: Address
  try {
    signer = await recoverAddress({ hash: e.digest, signature: q.signature })
  } catch {
    return refuse('the quote’s signature does not read')
  }
  if (!same(signer, e.mancerSigner)) refuse("the quote is not signed by the factory's Mancer signer")
  return bookTradeIntentFromQuote(q, e.tradeNonce)
}

/** A vault's pending trade read as a perps deposit: on the deployment's perps adapter, USDG in, WETH out, a floor of 0, and
 * its route decoded. Null where it is no deposit. */
export function bookPerpsPendingDepositOf(p: BookTradeIntent, perps: BookPerpsDeployment): { amount: bigint; route: { account: Address; apiKeyIndex: number; pubKey: Hex } } | null {
  if (!same(p.adapter, perps.adapter) || !same(p.tokenIn, LIGHTER_RH_DEPLOYMENT.collateral.token) || !same(p.tokenOut, BOOK_SHARED.weth) || p.minOut !== 0n) return null
  try {
    return { amount: p.amountIn, route: decodeBookPerpsRoute(p.route) }
  } catch {
    return null
  }
}

// ------------------------------------------------------------------------------------------------ the order

/** Lighter's transaction type of each kind (lighter-go txtypes/constants.go). */
const KIND_TX_TYPE: Readonly<Record<SplitKind, number>> = {
  'create-order': 14,
  'cancel-order': 15,
  'cancel-all-orders': 16,
  'modify-order': 17,
  'update-leverage': 20,
  'update-margin': 29,
}

function sameParams(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const ka = Object.keys(a).sort()
  const kb = Object.keys(b).sort()
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && a[k] === b[k])
}

/**
 * Mancer's answer to an order held to exactly what was asked, before the trader's half signs (the second reader's L10 and
 * L11): the kind and every param as asked (so the worst price, the size, the side, the market and reduce-only are the
 * asked ones), the account index the caller's node reads, the trader's slot, Lighter RH's chain, a nonce, an expiry 5 to
 * 70 seconds ahead, the joint key the client holds a half of, and the transaction type of the kind. Then the hash: the
 * module builds it from the transaction's fields, and it must be the one Mancer's half signed. Answers that hash.
 */
export function checkBookPerpsOrderAnswer(
  split: SplitSigner,
  answer: BookPerpsOrderAnswer,
  asked: { order: BookPerpsOrderRequest; key: Hex; accountIndex: number; slot: number; chainId?: number; now?: number },
): string {
  const now = asked.now ?? Date.now()
  const chainId = asked.chainId ?? LIGHTER.chainId
  const tx = isObj(answer) && isObj(answer.tx) ? (answer.tx as SplitTx) : refuse('the order answer carries no transaction')
  const keys = Object.keys(tx).sort().join(',')
  if (keys !== 'accountIndex,apiKeyIndex,chainId,expiredAt,kind,nonce,params') refuse('the transaction has fields of its own')
  if (tx.kind !== asked.order.kind) refuse('the transaction is of another kind than asked')
  if (!isObj(tx.params) || !sameParams(tx.params, asked.order.params)) refuse('the transaction’s params are not the ones asked')
  if (tx.chainId !== chainId) refuse('the transaction is for another Lighter chain')
  if (tx.accountIndex !== asked.accountIndex) refuse('the transaction is for another Lighter account than the vault’s')
  if (tx.apiKeyIndex !== asked.slot) refuse('the transaction is signed at another slot than this trader’s')
  if (!Number.isSafeInteger(tx.nonce) || tx.nonce < 0 || tx.nonce !== answer.nonce) refuse('the transaction’s nonce does not read')
  if (!Number.isSafeInteger(tx.expiredAt) || tx.expiredAt !== answer.expiresAt) refuse('the transaction’s expiry does not read')
  if (tx.expiredAt < now + BOOKS_PERPS_EXPIRY_MIN_MS || tx.expiredAt > now + BOOKS_PERPS_EXPIRY_MAX_MS) refuse('the transaction expires too soon or too far ahead')
  if (!isObj(answer.account) || !same(answer.account.key, asked.key) || answer.account.slot !== asked.slot || answer.account.accountIndex !== asked.accountIndex) refuse('the answer names another key, slot or account')
  let mancer: SplitAnswer
  try {
    mancer = splitAnswerOf(answer.mancer)
  } catch {
    return refuse('Mancer’s half does not read')
  }
  const want = KIND_TX_TYPE[asked.order.kind]
  if (mancer.txType !== want || answer.txType !== want) refuse('Mancer’s half is of another transaction type than the kind')
  const { hash, txType } = split.txHash(tx)
  if (txType !== want) refuse('the transaction is of another type than the kind')
  if (hash !== mancer.hash) refuse('Mancer’s half signed another hash than this transaction’s')
  if (typeof answer.txHash !== 'string' || answer.txHash.toLowerCase() !== hash) refuse('the answer names another hash')
  return hash
}

/** Why Lighter did not take a send. */
export class LighterSendError extends Error {
  constructor(
    /** Lighter's code where it answered one; 0 where nothing answered. */
    readonly code: number,
    readonly words: string,
    /** Lighter refused the sender's region (20558). */
    readonly region: boolean,
    /** The request may have reached Lighter and no answer came back: read the order's report before asking again. */
    readonly lost: boolean,
  ) {
    super(words)
    this.name = 'LighterSendError'
  }
}

/** How a signed transaction is sent: by default to Lighter RH's pinned `sendTx`. */
export type BooksPerpsSend = (signed: SplitSigned, expiresAt: number) => Promise<{ txHash: string }>

/** Sends one signed transaction to Lighter RH's `sendTx` with price protection named on, as Lighter's docs say to: nothing
 * past its expiry, an answer read by its numeric code, and Lighter's hash held to the one signed. */
export async function sendBookPerpsOrder(signed: SplitSigned, expiresAt: number, deps: { fetch?: typeof fetch; now?: () => number } = {}): Promise<{ txHash: string }> {
  const now = deps.now ?? Date.now
  const f = deps.fetch ?? globalThis.fetch
  if (now() >= expiresAt) throw new LighterSendError(0, 'the signature ran out before it was sent', false, false)
  const body = new URLSearchParams({ tx_type: String(signed.txType), tx_info: signed.txInfo, price_protection: 'true' }).toString()
  let res: Response
  try {
    res = await f(BOOKS_PERPS_SEND_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(10_000) })
  } catch {
    throw new LighterSendError(0, 'Lighter’s answer did not come back', false, true)
  }
  type SendAnswer = { code?: unknown; message?: unknown; tx_hash?: unknown }
  let json: SendAnswer | null = null
  try {
    json = (await res.json()) as SendAnswer
  } catch {
    json = null
  }
  const code = typeof json?.code === 'number' ? json.code : null
  if (code !== null && code !== 200) {
    const read = lighterErrorOf(code, typeof json?.message === 'string' ? json.message : null)
    throw new LighterSendError(code, read?.words ?? 'Lighter refused the transaction', isLighterRegionError(code), false)
  }
  if (!res.ok || code !== 200) throw new LighterSendError(0, 'Lighter’s answer did not read', false, true)
  const hash = typeof json?.tx_hash === 'string' ? json.tx_hash.toLowerCase().replace(/^0x/, '') : signed.txHash
  if (hash !== signed.txHash.toLowerCase()) throw new LighterSendError(0, 'Lighter named another transaction than the one signed', false, true)
  return { txHash: hash }
}

/** The six kinds, for a caller that checks its own input. */
export const BOOKS_PERPS_KINDS: readonly SplitKind[] = SPLIT_KINDS
