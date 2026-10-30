import { decodeEventLog, erc20Abi, getAddress, hashTypedData, isAddress, keccak256, parseAbi, zeroAddress, type Address, type Hash, type Hex, type TransactionReceipt } from 'viem'
import { bookActCalls, readChainBook, verifyBookDeployment, vaultRouteCheck, type BookAction, type BookActArgs, type ChainBook } from './books'
import { floorBesidePool, floorKind, holdSignedFloor, namedFloor, wethUsdgPoolOut, type FloorRule, type ReferenceFn } from './floor'
import { SDK_VERSION } from './version'
import { routerAllowlistDrift, type AllowlistDrift } from './shared'
import {
  checkBookSteps,
  checkCancelAllSteps,
  checkCancelSteps,
  checkDraftOpenSteps,
  checkOrderSetupSteps,
  checkSwapSteps,
  checkTransferSteps,
  type CheckedSteps,
  type TransferAssetInput,
} from './checks'
import { MancerClient, newIdempotencyKey, type MancerOptions } from './client'
import { MancerCheckError, MancerError } from './errors'
import { AccountStream, eventsSince, readEvents, type AccountStreamOptions } from './events'
import type {
  AccountEvent,
  AccountEventsPage,
  BookDraftResponse,
  BookStepsRequest,
  BookStepsResponse,
  BookVaultQuoteRequest,
  BookVaultQuoteResponse,
  DraftOpenStepsRequest,
  DraftOpenStepsResponse,
  Operations,
  OrderRecord,
  Quote,
  QuoteResponse,
  ReadySteps,
  TransferStepsResponse,
} from './generated/openapi'
import { sendCheckedSteps, type SendOptions, type SentStep } from './send'
import {
  BOOK_SHARED,
  MANCER_ORDER_FEE_CEILING_BPS,
  MANCER_ROUTER_DEPLOYMENTS,
  ORDER_TYPEHASH_V3,
  cancelOrdersMessage,
  mancerOrdersV3Abi,
  orderTypedDataMismatch,
  orderTypedDataV3,
  orderV3ToSign,
  parseBookQuote,
  publishedSwapFeeBps,
  type BookDeployment,
  type MancerOrderV3,
  type OpenBookParams,
  type PlaceOrderParams,
} from './shared'

export type { FloorRule, ReferenceFn } from './floor'

/** Native ether, where a token is named. */
export const ETH = 'ETH' as const
export type TokenRef = Address | typeof ETH

// ------------------------------------------------------------------------------------------------------- the inputs

export interface SwapRequest extends FloorRule {
  /** The token spent, or `'ETH'` for the wallet's ether. */
  tokenIn: TokenRef
  /** The token bought, or `'ETH'` for ether. */
  tokenOut: TokenRef
  /** Raw units of `tokenIn`: 0.001 ETH is `1_000_000_000_000_000n`. */
  amountIn: bigint
  /** The tolerance the API builds with, in basis points: with `trustQuote`, the floor under the quote. Default 50. */
  slippageBps?: number
  /** The most the router's fee may be, in basis points. Default, the published rate for the pair (2 bps for ether
   * against the dollar, 0 for a dollar pair, 10 otherwise); a token in its first day pays 50, which is accepted by name. */
  maxFeeBps?: number
  /** An integrator's own fee on the swap, paid inside it to `recipient` at `bps` (an API key whose ceiling allows it). */
  integratorFee?: { recipient: Address; bps: number; side?: 'input' | 'output' }
  /** `true` leaves out routes whose settlement depends on the wallet's own launch permissions. Default false. */
  excludeAccountBound?: boolean
  /** More of `GET /v1/quote`'s parameters, passed as they are (a selection). */
  params?: Record<string, string>
}

export interface BuiltSwap {
  quote: Quote
  /** The floor the calldata was held to. */
  minOut: bigint
  checked: CheckedSteps
}

export interface SwapResult extends BuiltSwap {
  sent: SentStep[]
  /** What the router's `Executed` event says the swap did, from the swap's own receipt. */
  executed: { amountIn: bigint; amountOut: bigint; feeAsset: Address; feeAmount: bigint } | null
}

/** A limit: sells `amountIn` once the market pays at least `minOut`. */
export interface LimitOrderInput {
  tokenIn: TokenRef
  tokenOut: Address
  amountIn: bigint
  minOut: bigint
  /** Unix seconds; 0 or absent, never. */
  expiry?: number
  maxFeeBps?: number
}

/** A stop: waits until the market's output for `amountIn` falls to `trigger`, then fills at `minOut` or better. */
export interface StopOrderInput {
  tokenIn: TokenRef
  tokenOut: Address
  amountIn: bigint
  /** The output for `amountIn` the market must fall to before a fill. */
  trigger: bigint
  /** The floor a fill must deliver, under the trigger (the band). */
  minOut: bigint
  expiry?: number
  maxFeeBps?: number
}

/** A recurring order: `fills` fills of `amountPerFill`, `everySec` apart. */
export interface RecurringOrderInput {
  tokenIn: TokenRef
  tokenOut: Address
  amountPerFill: bigint
  fills: number
  everySec: number
  /** Unix seconds of the first fill; 0 or absent, at once. */
  startAt?: number
  expiry?: number
  /** A price range: the least and the most a fill may deliver (0n or absent: none). */
  minOutPerFill?: bigint
  maxOutPerFill?: bigint
  maxFeeBps?: number
}

export interface PlacedOrder {
  /** The order's EIP-712 hash, computed here from what was signed: the hash to cancel it by. */
  hash: Hash
  /** True where this exact signed order was already resting. */
  existing: boolean
  order: MancerOrderV3
  signature: Hex
}

export interface OrderOptions {
  /** Send the wrap and approval the order needs first (default true). */
  setup?: boolean
  send?: SendOptions
}

export interface TransferRequest {
  /** An address, or `@username` for the wallet that holds it. */
  to: string
  asset: TransferAssetInput | { kind: 'native' }
  /** Raw units; an ERC-1155 piece's count (1 by default); an ERC-721 piece moves whole. */
  amount?: bigint
}

const EXECUTED = parseAbi(['event Executed(address indexed sender, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, address feeAsset, uint256 feeAmount, uint16 feeBps, uint8 feeMode, uint256 legCount)'])
const BPS = 10_000n
const DRAFT_ID = /^[0-9a-f]{32}$/
/** How long a signed order whose submission failed is kept to be sent again, unchanged, by a retry of the same act. */
const UNSETTLED_ORDER_MS = 10 * 60_000

/** The values of an object with every bigint as a string, its keys sorted: a stable fingerprint of what an act asked. */
function fingerprint(v: unknown): string {
  return JSON.stringify(v, (_k, x) => {
    if (typeof x === 'bigint') return `${x}n`
    if (x && typeof x === 'object' && !Array.isArray(x)) return Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
    return x
  })
}

/** `openBook`'s terms as the API's own steps route reads them: a missing economics field
 * is 0 (the pad's default), a missing base pair or hook the zero address, venue 0 Uniswap v3. A test holds the two
 * equal. */
export function openBookParamsOf(terms: Record<string, unknown>, draft: { name: string; symbol: string }): OpenBookParams {
  const t = terms
  const traders = Array.isArray(t.traders) ? (t.traders as string[]).map((x) => getAddress(x)) : []
  if (!traders.length) throw new MancerCheckError('book', 'the open names its traders')
  const int = (k: string) => Number(t[k] ?? 0)
  const big = (k: string) => BigInt(String(t[k] ?? '0'))
  const addr = (k: string) => (t[k] === undefined ? zeroAddress : getAddress(String(t[k])))
  return {
    name: draft.name, symbol: draft.symbol, traders,
    durationSecs: Number(t.durationSecs), lpFeeMode: int('lpFeeMode') as 0 | 1,
    startMcapUsd8: big('startMcapUsd8'), gradMcapUsd8: big('gradMcapUsd8'),
    startTaxBps: int('startTaxBps'), taxDecayPerMinBps: int('taxDecayPerMinBps'), windowSecs: int('windowSecs'),
    buysOnly: t.buysOnly === true, bondAfterSecs: int('bondAfterSecs'), guaranteedBond: t.guaranteedBond === true,
    quote: addr('quote'), venue: int('venue') as 0 | 1, hook: addr('hook'),
  }
}

/** An integrator's fee as asked: its recipient, its rate and its side. */
function integratorFeeOf(f: SwapRequest['integratorFee']): { recipient: Address; bps: number; side: 'input' | 'output' } | null {
  if (!f) return null
  if (typeof f.recipient !== 'string' || !isAddress(f.recipient, { strict: false }) || same(f.recipient, zeroAddress)) throw new MancerCheckError('swap', "an integrator fee names its recipient's address")
  if (!Number.isInteger(f.bps) || f.bps < 1 || f.bps > 1_000) throw new MancerCheckError('swap', "an integrator fee's rate is a whole number of 1 to 1,000 bps")
  const side = f.side ?? 'output'
  if (side !== 'input' && side !== 'output') throw new MancerCheckError('swap', "an integrator fee's side is input or output")
  return { recipient: getAddress(f.recipient), bps: f.bps, side }
}

function nonceOf(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return BigInt(`0x${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`).toString()
}

function bytes32(): Hex {
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(32))
    if (bytes.some((b) => b !== 0)) return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}` as Hex
  }
}

function slippageOf(bps: number | undefined): number {
  const s = bps ?? 50
  if (!Number.isInteger(s) || s < 1 || s > 5_000) throw new MancerCheckError('swap', 'slippageBps is a whole number of 1 to 5,000')
  return s
}

/**
 * Mancer for a bot with a wallet: everything `MancerClient` does, and the acts. Each act asks the API for its steps,
 * checks them against what was asked for and the contracts the SDK pins, and only then signs and sends them from the
 * bot's own account, one at a time, each after the last one's receipt.
 */
export class Mancer extends MancerClient {
  #ordersV3: Promise<void> | null = null
  /** Orders signed whose submission did not answer, by what was asked: a retry of the same act sends the same order. */
  readonly #unsettledOrders = new Map<string, { order: MancerOrderV3; signature: Hex; at: number }>()
  /** One-cancels-the-other pairs not yet whole, by what was asked: their group, and the take-profit once it rests. */
  readonly #ocoPairs = new Map<string, { group: Hex; takeProfit?: PlacedOrder; at: number }>()
  /** Idempotency keys of drafts whose save did not answer, by the body: a retry of the same save sends the same key. */
  readonly #draftKeys = new Map<string, string>()
  /** The drafts this client saved, by id: what their open is held to. */
  readonly #drafts = new Map<string, { factory: Address; name: string; symbol: string }>()
  /** The Books deployments whose contracts' code was read on the caller's node. */
  readonly #deploymentsRead = new Map<string, Promise<void>>()

  constructor(options: MancerOptions = {}) {
    super(options)
  }

  // ---------------------------------------------------------------------------------------------------------- swaps

  /** A display quote: the price and the route, no transaction. */
  async quote(r: Pick<SwapRequest, 'tokenIn' | 'tokenOut' | 'amountIn' | 'slippageBps' | 'excludeAccountBound' | 'params'>): Promise<QuoteResponse> {
    return (await this.request<QuoteResponse>('GET', '/v1/quote', {
      query: { ...this.#swapQuery(r, this.pinned.weth), ...(r.params ?? {}) },
      auth: 'optional',
    })).data
  }

  #swapQuery(r: Pick<SwapRequest, 'tokenIn' | 'tokenOut' | 'amountIn'>, weth: Address) {
    if (r.amountIn <= 0n) throw new MancerCheckError('swap', 'amountIn is above zero')
    if (r.tokenIn === ETH && r.tokenOut === ETH) throw new MancerCheckError('swap', 'a swap of ether for ether')
    return {
      tokenIn: r.tokenIn === ETH ? weth : getAddress(r.tokenIn),
      tokenOut: r.tokenOut === ETH ? weth : getAddress(r.tokenOut),
      amountIn: r.amountIn,
      ...(r.tokenIn === ETH ? { nativeIn: '1' } : {}),
      ...(r.tokenOut === ETH ? { nativeOut: '1' } : {}),
    }
  }

  /**
   * A reference for `reference`: what the deepest Uniswap V3 pool of WETH against USDG (fee 100) pays for an order, read
   * by Uniswap's QuoterV2 on your own node. It prices those two tokens alone, either way, and refuses any other pair.
   */
  poolReference(): ReferenceFn {
    return (q) => wethUsdgPoolOut(this.publicClient, this.pinned, q)
  }

  /**
   * The live router's allowlist beside this SDK's venue table, read on your own node: every (target, selector) the router
   * admits that the table does not name, and so refuses. Anything listed means this SDK is behind the router, and an
   * update of @blockhash/mancer-sdk is due.
   */
  venueTableDrift(options: { fromBlock?: bigint; span?: bigint } = {}): Promise<AllowlistDrift> {
    return routerAllowlistDrift(this.publicClient, { chainId: this.pinned.chainId, router: this.pinned.router, ...options })
  }

  /** This SDK's version, as its refusals name it. */
  get version(): string {
    return SDK_VERSION
  }

  /** A swap built as steps and checked, not sent: what `swap` signs. */
  async buildSwap(r: SwapRequest): Promise<BuiltSwap> {
    floorKind(r, 'swap')
    const trusted = await this.trustedContracts()
    const wallet = this.wallet
    const slippage = slippageOf(r.slippageBps)
    const base = this.#swapQuery(r, trusted.weth)
    const fee = r.maxFeeBps ?? publishedSwapFeeBps(trusted.chainId, base.tokenIn, base.tokenOut)
    if (!Number.isInteger(fee) || fee < 0 || fee > 10_000) throw new MancerCheckError('swap', 'maxFeeBps is a whole number of 0 to 10,000')
    const integrator = integratorFeeOf(r.integratorFee)
    const named = await namedFloor('swap', r, base)
    const answer = (await this.request<QuoteResponse>('GET', '/v1/quote', {
      query: {
        ...base,
        recipient: wallet,
        slippageBps: slippage,
        steps: '1',
        ...(named !== null ? { acceptedMinOut: named.floor } : {}),
        ...(integrator ? { integratorFeeBps: integrator.bps, integratorFeeRecipient: integrator.recipient, integratorFeeSide: integrator.side } : {}),
        ...(r.excludeAccountBound ? { excludeAccountBound: '1' } : {}),
        ...(r.params ?? {}),
      },
      auth: 'required',
    })).data
    const quote = answer.quote
    if (!quote) throw new MancerCheckError('swap', `no route${answer.reason ? `: ${answer.reason}` : ''}`)
    if (!quote.tx) throw new MancerCheckError('swap', 'the quote built no transaction')
    const quoted = quote.fee?.bps
    if (typeof quoted === 'number' && quoted > fee) {
      throw new MancerCheckError('swap', `the quote's fee is ${quoted} bps, over the ${fee} you accept${quoted <= 50 && fee < 50 ? ' (a token first seen in the last day pays 50: name maxFeeBps: 50 to accept it)' : ''}`)
    }
    const estimate = BigInt(quote.quotedAmountOut ?? quote.amountOut)
    let floor: bigint
    if (named !== null) {
      floor = named.floor
    } else {
      floor = (estimate * (BPS - BigInt(slippage))) / BPS
      await floorBesidePool('swap', r, this.publicClient, trusted, base, floor)
    }
    if (floor <= 0n) throw new MancerCheckError('swap', 'the floor is zero')
    const envelope = !!quote.execution && Array.isArray(quote.execution.transactions) && quote.execution.transactions.length > 0
    if (envelope) await this.trustedLaunchStack()
    const checked = checkSwapSteps(quote, {
      wallet,
      recipient: wallet,
      tokenIn: base.tokenIn,
      tokenOut: base.tokenOut,
      amountIn: r.amountIn,
      nativeIn: r.tokenIn === ETH,
      nativeOut: r.tokenOut === ETH,
      minOut: floor,
      maxFeeBps: fee,
      integratorFee: integrator ? { recipient: integrator.recipient, bps: integrator.bps } : null,
      // a launch route lets the pad's adapter sell its output back while the launch's tax decays: at most twice what the
      // caller's own reference says the swap pays (or twice the caller's floor), to an adapter whose code your node read
      // as the reviewed build; never sized by the quote's own word
      ...(envelope ? { roundTripCap: 2n * (named?.reference ?? floor) } : {}),
    }, trusted)
    return { quote, minOut: floor, checked }
  }

  /** Quote, check, sign and send a swap from the bot's wallet. */
  async swap(r: SwapRequest, options: SendOptions = {}): Promise<SwapResult> {
    const built = await this.buildSwap(r)
    const trusted = await this.trustedContracts()
    const sent = await sendCheckedSteps(this, built.checked, options)
    const last = sent.at(-1)
    return { ...built, sent, executed: last ? executedOf(last.receipt, trusted.router) : null }
  }

  // --------------------------------------------------------------------------------------------------------- steps

  /** Sends steps a check of this SDK passed. */
  sendSteps(checked: CheckedSteps, options: SendOptions = {}): Promise<SentStep[]> {
    return sendCheckedSteps(this, checked, options)
  }

  // -------------------------------------------------------------------------------------------------------- orders

  /** The order fee schedule for a pair: `feeBps` is the least `maxFeeBps` the book admits. */
  async orderFee(tokenIn: Address, tokenOut: Address): Promise<Operations['getOrderFee']['response']> {
    return (await this.request<Operations['getOrderFee']['response']>('GET', '/v1/order-fee', { query: { tokenIn, tokenOut }, auth: 'none' })).data
  }

  /** The wrap and the approval an order needs, checked: null where it needs none. The approval is held to the allowance
   * your own node reads plus this order's pull, never the API's count of other open orders. */
  async orderSetup(t: { tokenIn: TokenRef; tokenOut: Address; amountPerFill: bigint; totalFills: number }): Promise<CheckedSteps | null> {
    const trusted = await this.trustedContracts()
    const tokenIn = t.tokenIn === ETH ? trusted.weth : getAddress(t.tokenIn)
    const answer = (await this.request<{ ready?: ReadySteps; need?: Record<string, unknown> }>('GET', '/v1/orders/setup', {
      query: { tokenIn, tokenOut: t.tokenOut, amountIn: t.amountPerFill, maker: this.wallet, totalFills: t.totalFills, steps: '1', ...(t.tokenIn === ETH ? { nativeIn: '1' } : {}) },
      auth: 'required',
    })).data
    if (answer.ready && 'steps' in answer.ready && answer.ready.steps.length === 0) return null
    const allowance = await this.publicClient.readContract({ address: tokenIn, abi: erc20Abi, functionName: 'allowance', args: [this.wallet, trusted.orders] })
    return checkOrderSetupSteps(answer as never, { wallet: this.wallet, tokenIn, amountPerFill: t.amountPerFill, totalFills: t.totalFills, nativeIn: t.tokenIn === ETH, allowance }, trusted)
  }

  async #assertOrdersV3(orders: Address): Promise<void> {
    if (!this.#ordersV3) {
      this.#ordersV3 = (async () => {
        const typehash = await this.publicClient.readContract({ address: orders, abi: mancerOrdersV3Abi, functionName: 'ORDER_TYPEHASH' })
        if (typehash.toLowerCase() !== ORDER_TYPEHASH_V3.toLowerCase()) throw new MancerCheckError('order', 'the orders contract is not MancerOrders V3')
      })()
      this.#ordersV3.catch(() => {
        this.#ordersV3 = null
      })
    }
    return this.#ordersV3
  }

  #pruneUnsettled(): void {
    const now = Date.now()
    for (const [k, v] of this.#unsettledOrders) if (now - v.at > UNSETTLED_ORDER_MS) this.#unsettledOrders.delete(k)
    for (const [k, v] of this.#ocoPairs) if (now - v.at > UNSETTLED_ORDER_MS) this.#ocoPairs.delete(k)
  }

  /**
   * Signs and rests one order, exactly as mancer.xyz signs it (the site's own order builder): the maker's epoch read
   * from the chain, a fresh nonce, the order's typed data checked against the terms (`orderTypedDataMismatch`), then
   * EIP-712 and `POST /v1/orders`. With `setup`, the order's wrap and approval are sent first.
   *
   * The order's hash is computed here from what was signed, and an answer naming another is refused (the error carries
   * the order as `placed`). A submission that does not land keeps its signed order ten minutes: the same act asked again
   * (by `withRetry`, or by hand) sends that order again, never a second one under a fresh nonce.
   */
  async placeOrder(terms: PlaceOrderParams & { nativeIn?: boolean }, options: OrderOptions & { ocoGroup?: Hex; nonce?: string } = {}): Promise<PlacedOrder> {
    const trusted = await this.trustedContracts()
    const maker = this.wallet
    await this.#assertOrdersV3(trusted.orders)
    const fee = await this.orderFee(terms.tokenIn, terms.tokenOut)
    if (terms.maxFeeBps < fee.feeBps) throw new MancerCheckError('order', `maxFeeBps is under this pair's order fee (${fee.feeBps})`)
    if (options.setup !== false) {
      const setup = await this.orderSetup({ tokenIn: terms.nativeIn ? ETH : terms.tokenIn, tokenOut: terms.tokenOut, amountPerFill: terms.amountPerFill, totalFills: terms.totalFills })
      if (setup) await this.sendSteps(setup, options.send)
    }
    const epoch = await this.publicClient.readContract({ address: trusted.orders, abi: mancerOrdersV3Abi, functionName: 'makerEpoch', args: [maker] })
    const { nativeIn: _native, ...params } = terms
    this.#pruneUnsettled()
    const key = fingerprint({ contract: trusted.orders, chainId: trusted.chainId, maker, epoch, params, ocoGroup: options.ocoGroup ?? null, nonce: options.nonce ?? null })
    let kept = this.#unsettledOrders.get(key)
    if (!kept) {
      const order = orderV3ToSign(params, { maker, epoch, nonce: options.nonce ?? nonceOf(), ...(options.ocoGroup ? { ocoGroup: options.ocoGroup } : {}) })
      const typed = orderTypedDataV3(order, trusted.chainId, trusted.orders)
      const wrong = orderTypedDataMismatch(typed, {
        contract: trusted.orders,
        chainId: trusted.chainId,
        maker,
        tokenIn: terms.tokenIn,
        tokenOut: terms.tokenOut,
        amountPerFill: terms.amountPerFill,
        totalFills: terms.totalFills,
        minOutPerFill: terms.minOutPerFill,
        maxFeeBps: terms.maxFeeBps,
        triggerOutPerFill: terms.triggerOutPerFill,
        maxOutPerFill: terms.maxOutPerFill,
        everySec: terms.everySec,
        startAt: terms.startAt,
        expiry: terms.expiry,
        ocoGroup: options.ocoGroup ?? null,
        epoch,
      })
      if (wrong) throw new MancerCheckError('order', wrong)
      const signature = await this.signTypedData(typed as never)
      kept = { order, signature, at: Date.now() }
      this.#unsettledOrders.set(key, kept)
    }
    const { order, signature } = kept
    const hash = hashTypedData(orderTypedDataV3(order, trusted.chainId, trusted.orders) as never)
    // the submission names the contract the signature binds; one the API does not serve yet is asked twice more
    let answer: { hash: Hash; existing: boolean } | null = null
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        answer = (await this.request<{ hash: Hash; existing: boolean }>('POST', '/v1/orders', { body: { order, signature, contract: trusted.orders }, auth: 'required' })).data
        break
      } catch (e) {
        if (!(e instanceof MancerError) || e.code !== 'contract-not-served' || attempt === 2) throw e
        await new Promise((done) => setTimeout(done, 1_500 * (attempt + 1)))
      }
    }
    this.#unsettledOrders.delete(key)
    const placed: PlacedOrder = { hash, existing: answer!.existing === true, order, signature }
    if (!same(answer!.hash, hash)) {
      throw Object.assign(new MancerCheckError('order', `the API names the order ${answer!.hash}, and the order you signed is ${hash}: read and cancel it by ${hash}`), { placed })
    }
    return placed
  }

  #terms(tokenIn: TokenRef, weth: Address) {
    return tokenIn === ETH ? { tokenIn: weth, nativeIn: true } : { tokenIn: getAddress(tokenIn), nativeIn: false }
  }

  /** The `maxFeeBps` an order signs: the one named, else the pair's order fee as the API admits it, held under the most
   * the published schedule charges any pair (`MANCER_ORDER_FEE_CEILING_BPS`, 60). */
  async #fee(tokenIn: Address, tokenOut: Address, named: number | undefined): Promise<number> {
    if (named !== undefined) return named
    const fee = (await this.orderFee(tokenIn, tokenOut)).feeBps
    if (!Number.isInteger(fee) || fee < 0 || fee > MANCER_ORDER_FEE_CEILING_BPS) {
      throw new MancerCheckError('order', `the pair's order fee reads ${fee} bps, over the ${MANCER_ORDER_FEE_CEILING_BPS} the published schedule charges any pair: name maxFeeBps to sign more`)
    }
    return fee
  }

  /** A limit order: one fill of `amountIn` at `minOut` or better. */
  async placeLimit(o: LimitOrderInput, options: OrderOptions = {}): Promise<PlacedOrder> {
    const trusted = await this.trustedContracts()
    const t = this.#terms(o.tokenIn, trusted.weth)
    if (o.minOut <= 0n) throw new MancerCheckError('order', 'a limit names its floor, minOut, above zero')
    return this.placeOrder({
      ...t, tokenOut: getAddress(o.tokenOut), amountPerFill: o.amountIn, totalFills: 1, everySec: 0, startAt: 0, expiry: o.expiry ?? 0,
      minOutPerFill: o.minOut, triggerOutPerFill: 0n, maxOutPerFill: 0n, maxFeeBps: await this.#fee(t.tokenIn, o.tokenOut, o.maxFeeBps),
    }, options)
  }

  /** A stop order: fills at `minOut` or better once the market's output falls to `trigger`. */
  async placeStop(o: StopOrderInput, options: OrderOptions = {}): Promise<PlacedOrder> {
    const trusted = await this.trustedContracts()
    const t = this.#terms(o.tokenIn, trusted.weth)
    if (o.trigger <= 0n || o.minOut <= 0n || o.minOut > o.trigger) throw new MancerCheckError('order', 'a stop names its trigger and a floor at or under it, both above zero')
    return this.placeOrder({
      ...t, tokenOut: getAddress(o.tokenOut), amountPerFill: o.amountIn, totalFills: 1, everySec: 0, startAt: 0, expiry: o.expiry ?? 0,
      minOutPerFill: o.minOut, triggerOutPerFill: o.trigger, maxOutPerFill: 0n, maxFeeBps: await this.#fee(t.tokenIn, o.tokenOut, o.maxFeeBps),
    }, options)
  }

  /**
   * One-cancels-the-other: a take-profit limit and a stop on the same amount, signed under one fresh group, which the
   * orders contract enforces: once one fills, the other never can. Where the stop's signature or submission fails, the
   * take-profit rests alone, and the error carries it (`partial`): the same pair asked again within ten minutes keeps
   * its group and its take-profit, and places the stop alone.
   */
  async placeOco(o: { takeProfit: LimitOrderInput; stop: StopOrderInput }, options: OrderOptions = {}): Promise<{ takeProfit: PlacedOrder; stop: PlacedOrder }> {
    const trusted = await this.trustedContracts()
    const a = this.#terms(o.takeProfit.tokenIn, trusted.weth), b = this.#terms(o.stop.tokenIn, trusted.weth)
    if (a.tokenIn !== b.tokenIn || getAddress(o.takeProfit.tokenOut) !== getAddress(o.stop.tokenOut) || o.takeProfit.amountIn !== o.stop.amountIn) {
      throw new MancerCheckError('order', 'both legs of a pair sell the same amount of one token for another')
    }
    this.#pruneUnsettled()
    const key = fingerprint({ maker: this.wallet, o })
    const pair = this.#ocoPairs.get(key) ?? { group: bytes32(), at: Date.now() }
    this.#ocoPairs.set(key, pair)
    const takeProfit = pair.takeProfit ?? await this.placeOrder({
      ...a, tokenOut: getAddress(o.takeProfit.tokenOut), amountPerFill: o.takeProfit.amountIn, totalFills: 1, everySec: 0, startAt: 0, expiry: o.takeProfit.expiry ?? 0,
      minOutPerFill: o.takeProfit.minOut, triggerOutPerFill: 0n, maxOutPerFill: 0n, maxFeeBps: await this.#fee(a.tokenIn, o.takeProfit.tokenOut, o.takeProfit.maxFeeBps),
    }, { ...options, ocoGroup: pair.group })
    pair.takeProfit = takeProfit
    try {
      const stop = await this.placeOrder({
        ...b, tokenOut: getAddress(o.stop.tokenOut), amountPerFill: o.stop.amountIn, totalFills: 1, everySec: 0, startAt: 0, expiry: o.stop.expiry ?? 0,
        minOutPerFill: o.stop.minOut, triggerOutPerFill: o.stop.trigger, maxOutPerFill: 0n, maxFeeBps: await this.#fee(b.tokenIn, o.stop.tokenOut, o.stop.maxFeeBps),
      }, { ...options, setup: false, ocoGroup: pair.group })
      this.#ocoPairs.delete(key)
      return { takeProfit, stop }
    } catch (e) {
      throw Object.assign(e instanceof Error ? e : new Error(String(e)), { partial: takeProfit })
    }
  }

  /** A recurring order: `fills` fills, `everySec` apart, each within the price range where one is named. */
  async placeRecurring(o: RecurringOrderInput, options: OrderOptions = {}): Promise<PlacedOrder> {
    const trusted = await this.trustedContracts()
    const t = this.#terms(o.tokenIn, trusted.weth)
    if (!Number.isInteger(o.fills) || o.fills < 2) throw new MancerCheckError('order', 'a recurring order has two fills or more')
    if (!Number.isInteger(o.everySec) || o.everySec <= 0) throw new MancerCheckError('order', 'a recurring order names the seconds between fills')
    return this.placeOrder({
      ...t, tokenOut: getAddress(o.tokenOut), amountPerFill: o.amountPerFill, totalFills: o.fills, everySec: o.everySec, startAt: o.startAt ?? 0, expiry: o.expiry ?? 0,
      minOutPerFill: o.minOutPerFill ?? 0n, triggerOutPerFill: 0n, maxOutPerFill: o.maxOutPerFill ?? 0n, maxFeeBps: await this.#fee(t.tokenIn, o.tokenOut, o.maxFeeBps),
    }, options)
  }

  /** The wallet's orders, newest first. */
  async orders(q: { status?: 'open' | 'filled' | 'cancelled' | 'expired'; limit?: number } = {}): Promise<Operations['listOrders']['response']> {
    return (await this.request<Operations['listOrders']['response']>('GET', '/v1/orders', { query: { maker: this.wallet, ...q }, auth: 'required' })).data
  }

  async order(hash: Hash): Promise<OrderRecord> {
    if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new MancerCheckError('order', 'an order hash is 32 bytes of hex')
    return (await this.request<OrderRecord>('GET', `/v1/orders/${hash}`, { auth: 'required' })).data
  }

  /** Cancels by signature: no gas, binding at the book Mancer's executor fills from. The on-chain cancel holds whatever any
   * executor does: `cancelOrderOnChain`. Name the hashes `placeOrder` computed (`PlacedOrder.hash`). */
  async cancelOrders(hashes: Hash[]): Promise<Operations['cancelOrders']['response']> {
    if (!hashes.length) throw new MancerCheckError('cancel', 'name an order to cancel')
    if (!hashes.every((h) => /^0x[0-9a-fA-F]{64}$/.test(h))) throw new MancerCheckError('cancel', 'an order hash is 32 bytes of hex')
    const trusted = await this.trustedContracts()
    const issuedAt = Math.floor(Date.now() / 1000)
    const message = cancelOrdersMessage(hashes, trusted.chainId, trusted.orders, issuedAt)
    const signature = await this.signMessage(message)
    return (await this.request<Operations['cancelOrders']['response']>('POST', '/v1/orders/cancellations', { body: { hashes, issuedAt, signature }, auth: 'required' })).data
  }

  /** `cancel(order)` on the chain, checked and sent from the maker's wallet. */
  async cancelOrderOnChain(hash: Hash, options: SendOptions = {}): Promise<SentStep[]> {
    if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new MancerCheckError('cancel', 'an order hash is 32 bytes of hex')
    const trusted = await this.trustedContracts()
    const ready = (await this.request<ReadySteps>('POST', `/v1/orders/${hash}/cancel-steps`, { body: { wallet: this.wallet }, auth: 'required' })).data
    return this.sendSteps(checkCancelSteps(ready, { wallet: this.wallet, orderHash: hash }, trusted), options)
  }

  /** `cancelAll(salt)` on the chain: voids every order the wallet signed under its current epoch. The salt is made here. */
  async cancelAllOnChain(options: SendOptions = {}): Promise<SentStep[]> {
    const trusted = await this.trustedContracts()
    const salt = bytes32()
    const ready = (await this.request<ReadySteps>('POST', '/v1/orders/cancel-all-steps', { body: { wallet: this.wallet, salt }, auth: 'required' })).data
    return this.sendSteps(checkCancelAllSteps(ready, { wallet: this.wallet, salt }, trusted), options)
  }

  // ----------------------------------------------------------------------------------------------------- transfers

  /** A send of ether, a token or an NFT, checked byte for byte against the kit's own transfer call, then sent. */
  async transfer(r: TransferRequest, options: SendOptions & { dryRun?: boolean } = {}): Promise<{ recipient: Address; warnings: string[]; checked: CheckedSteps; sent: SentStep[] }> {
    const asset = r.asset.kind === 'nft' ? { kind: 'nft', collection: r.asset.collection, tokenId: r.asset.tokenId.toString() } : r.asset
    const answer = (await this.request<TransferStepsResponse>('POST', '/v1/transfers/steps', {
      body: { wallet: this.wallet, to: r.to, asset, ...(r.amount !== undefined ? { amount: r.amount.toString() } : {}) },
      auth: 'required',
    })).data
    const checked = checkTransferSteps(answer, { wallet: this.wallet, to: r.to, asset: r.asset as TransferAssetInput, ...(r.amount !== undefined ? { amount: r.amount } : {}) })
    const sent = options.dryRun ? [] : await this.sendSteps(checked, options)
    return { recipient: checked.recipient, warnings: answer.warnings ?? [], checked, sent }
  }

  // --------------------------------------------------------------------------------------------------------- Books

  /** A Books deployment's pinned contracts, each holding its reviewed code on the caller's own node. Read once. */
  #bookDeployment(d: BookDeployment): Promise<void> {
    const key = d.factory.address.toLowerCase()
    let read = this.#deploymentsRead.get(key)
    if (!read) {
      read = verifyBookDeployment(this.publicClient, d)
      read.catch(() => this.#deploymentsRead.delete(key))
      this.#deploymentsRead.set(key, read)
    }
    return read
  }

  /** The Book a token is, read from the factory on the caller's own node, its deployment's contracts, token and vault
   * holding their reviewed code there. */
  async #book(token: Address): Promise<ChainBook> {
    const book = await readChainBook(this.publicClient, getAddress(token), this.bookDeployments)
    await this.#bookDeployment(book.deployment)
    const d = book.deployment
    const [tokenCode, vaultCode] = await Promise.all([this.publicClient.getCode({ address: book.token }), this.publicClient.getCode({ address: book.vault })])
    if (!tokenCode || keccak256(tokenCode).toLowerCase() !== d.bookTokenCodeHash.toLowerCase()) throw new MancerCheckError('book', "the Book's token does not hold the code of its deployment's Book tokens")
    if (!vaultCode || keccak256(vaultCode).toLowerCase() !== d.vaultCloneCodeHash.toLowerCase()) throw new MancerCheckError('book', "the Book's vault does not hold the code of its deployment's vaults")
    return book
  }

  /**
   * One act of a Book as checked steps. The Book's id and vault are read from its factory on your own node; the act's
   * own calls are rebuilt with the kit's builders from the arguments you name and what your node reads (an `'all'`
   * amount, the allowance an approval tops up, the vault's nonce and pending trade); and every step must be one of those
   * calls byte for byte, with an exact approval of what the act pulls before it where one is short. Amounts are raw
   * units of the Book's token.
   */
  async bookSteps(token: Address, action: BookAction, args: BookActArgs = {}): Promise<{ answer: BookStepsResponse; checked: CheckedSteps; book: ChainBook }> {
    const trusted = await this.trustedContracts()
    const book = await this.#book(token)
    const floor = (q: { tokenIn: Address; tokenOut: Address; amountIn: bigint; minOut: bigint }) => holdSignedFloor('book', args, this.publicClient, trusted, q, q.minOut)
    const { expected, fields } = await bookActCalls(this.publicClient, book, this.wallet, action, args, trusted.router, floor)
    const answer = (await this.request<BookStepsResponse>('POST', `/v1/books/${book.token}/steps`, { body: { action, wallet: this.wallet, ...fields }, auth: 'required' })).data
    const checked = checkBookSteps(answer, { wallet: this.wallet, token: book.token, action, bookId: book.bookId, vault: book.vault, expected, deployments: this.bookDeployments })
    return { answer, checked, book }
  }

  /** One act of a Book, checked and sent. */
  async bookAct(token: Address, action: BookAction, args: BookActArgs = {}, options: SendOptions = {}): Promise<{ answer: BookStepsResponse; sent: SentStep[] }> {
    const { answer, checked } = await this.bookSteps(token, action, args)
    return { answer, sent: await this.sendSteps(checked, options) }
  }

  /**
   * A vault trade's or a sweep's quote, signed by Mancer for a Book the wallet trades for. The vault is the one your
   * node's factory names for the Book; the route is held to the vault's own rules (the kit's `vaultRouteMismatch`) and
   * read leg by leg as a swap's is (Mancer's own routing alone, paying the router or the vault); and its floor is held to
   * the rule you name, as a swap's: `minOut`, a `reference` with `maxSlippageBps`, or `trustQuote: true`.
   */
  async vaultQuote(token: Address, body: Omit<BookVaultQuoteRequest, 'wallet'>, guard: FloorRule = {}): Promise<BookVaultQuoteResponse> {
    // a trade's floor rule is named before anything is asked; a sweep's where its answer carries a route to sell through
    if (body.purpose !== 'sweep') floorKind(guard, 'book')
    const trusted = await this.trustedContracts()
    const book = await this.#book(token)
    const answer = (await this.request<BookVaultQuoteResponse>('POST', `/v1/books/${book.token}/vault-quote`, { body: { wallet: this.wallet, ...body }, auth: 'required' })).data
    if (!same(answer.tokenIn, body.tokenIn)) throw new MancerCheckError('book', 'the vault quote spends another token')
    if (body.tokenOut && !same(answer.tokenOut, body.tokenOut)) throw new MancerCheckError('book', 'the vault quote buys another token')
    if (body.amountIn && answer.amountIn !== body.amountIn) throw new MancerCheckError('book', 'the vault quote spends another amount')
    if (body.purpose === 'sweep' && body.tokenOut === undefined && answer.route && answer.route !== '0x' && !same(answer.tokenOut, BOOK_SHARED.weth)) throw new MancerCheckError('book', 'a sweep sells for WETH')
    if (!same(answer.vault, book.vault)) throw new MancerCheckError('book', 'the vault quote names another vault than the Book your node reads')
    if (answer.route && answer.route !== '0x') {
      vaultRouteCheck(parseBookQuote({ ...answer, signature: answer.signature ?? '0x' }), book, trusted.router)
      // the floor the quote signs, held to the rule: never the answer's simulation beside it
      const q = { tokenIn: getAddress(answer.tokenIn), tokenOut: getAddress(answer.tokenOut), amountIn: BigInt(answer.amountIn) }
      await holdSignedFloor('book', guard, this.publicClient, trusted, q, BigInt(answer.minOut))
    }
    return answer
  }

  /** A vault trade proposed on Mancer's signed quote: the quote held to your floor rule, then the `proposeTrade` step
   * rebuilt and checked, and sent. */
  async proposeVaultTrade(token: Address, body: Omit<BookVaultQuoteRequest, 'wallet' | 'purpose' | 'preview'>, options: SendOptions & FloorRule = {}): Promise<{ quote: BookVaultQuoteResponse; sent: SentStep[] }> {
    const { minOut, reference, maxSlippageBps, trustQuote, maxDeviationBps, ...send } = options
    const guard = { minOut, reference, maxSlippageBps, trustQuote, maxDeviationBps }
    const quote = await this.vaultQuote(token, { ...body, purpose: 'trade' }, guard)
    const { sent } = await this.bookAct(token, 'proposeTrade', { quote, ...guard }, send)
    return { quote, sent }
  }

  /**
   * A Book saved before it opens (`POST /v1/books/drafts`). Its Idempotency-Key is chosen once for the body and sent
   * again by every retry of the same save until one lands, so a retry saves one draft. The draft's factory, name and
   * ticker are kept: its open is held to them.
   */
  async createBookDraft(body: Operations['createBookDraft']['body'], idempotencyKey?: string): Promise<Operations['createBookDraft']['response']> {
    const fp = fingerprint(body)
    const key = idempotencyKey ?? this.#draftKeys.get(fp) ?? newIdempotencyKey()
    this.#draftKeys.set(fp, key)
    const out = (await this.request<Operations['createBookDraft']['response']>('POST', '/v1/books/drafts', { body, idempotencyKey: key, auth: 'required' })).data
    this.#draftKeys.delete(fp)
    const id = (out as { draft?: { id?: unknown } }).draft?.id
    if (typeof id === 'string') this.#drafts.set(id, { factory: getAddress(body.factory), name: body.name, symbol: body.symbol })
    return out
  }

  /**
   * A saved Book's open, checked and sent. The open is rebuilt with the kit's `openBookCall` from the draft you made (its
   * factory, name and ticker: kept by `createBookDraft`, or named here for a draft saved elsewhere) and the terms you name,
   * and the step must be that call byte for byte. Its transaction's hash is bound to the record at the draft's own path
   * on the API as soon as the wallet returns it.
   */
  async openBookFromDraft(
    id: string,
    terms: DraftOpenStepsRequest['terms'],
    options: SendOptions & { name?: string; symbol?: string; factory?: Address } = {},
  ): Promise<{ answer: DraftOpenStepsResponse; sent: SentStep[]; draft: BookDraftResponse | null }> {
    if (!DRAFT_ID.test(id)) throw new MancerCheckError('book', 'a draft id is 32 hex characters')
    const { name, symbol, factory, ...send } = options
    const kept = this.#drafts.get(id)
    const draft = { name: name ?? kept?.name, symbol: symbol ?? kept?.symbol, factory: factory ?? kept?.factory }
    if (draft.name === undefined || draft.symbol === undefined) {
      throw new MancerCheckError('book', "name the draft's name and symbol (or open a draft this client saved): the open is held to the draft you made, never to the answer's word")
    }
    const open = openBookParamsOf(terms as unknown as Record<string, unknown>, { name: draft.name, symbol: draft.symbol })
    const path = `/v1/books/drafts/${id}`
    const answer = (await this.request<DraftOpenStepsResponse>('POST', `${path}/steps`, { body: { wallet: this.wallet, terms }, auth: 'required' })).data
    if (!answer.bind || answer.bind.method !== 'PATCH' || answer.bind.path !== path) throw new MancerCheckError('book', "the answer's bind is not this draft's own path on the API")
    const checked = checkDraftOpenSteps(answer, { wallet: this.wallet, draftId: id, open, ...(draft.factory ? { factory: draft.factory } : {}), deployments: this.bookDeployments })
    let bound: Promise<BookDraftResponse | null> = Promise.resolve(null)
    const last = checked.steps.length - 1
    const sent = await this.sendSteps(checked, {
      ...send,
      onStep: (e) => {
        if (e.step === last && e.phase === 'sent' && e.hash) {
          bound = this.request<BookDraftResponse>('PATCH', path, { body: { txHash: e.hash }, auth: 'required' }).then((r) => r.data, () => null)
        }
        send.onStep?.(e)
      },
    })
    return { answer, sent, draft: await bound }
  }

  // -------------------------------------------------------------------------------------------------------- events

  /** One page of the account's event log from `since`. */
  events(since = '0', limit = 100): Promise<AccountEventsPage> {
    return readEvents(this, since, limit)
  }

  /** Every event past `since`, page by page, until none waits. */
  eventsSince(since = '0'): AsyncGenerator<AccountEvent, string> {
    return eventsSince(this, since)
  }

  /** The account's events as they are written: joined, replayed from `since`, and resumed after any drop. */
  async streamEvents(options: AccountStreamOptions): Promise<AccountStream> {
    const stream = new AccountStream(this, options)
    await stream.start()
    return stream
  }

  // --------------------------------------------------------------------------------------------------------- reads

  /** Who the API takes this client for, and every rate bucket with what it has left. */
  async limits(): Promise<Operations['getLimits']['response']> {
    return (await this.request<Operations['getLimits']['response']>('GET', '/v1/limits', { auth: 'optional' })).data
  }
}

function same(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase()
}

/** The router's own `Executed` event in a receipt (only a log the pinned router emitted), or null where it holds none. */
export function executedOf(receipt: Pick<TransactionReceipt, 'logs'>, router: Address = getAddress(MANCER_ROUTER_DEPLOYMENTS[4663]!)): SwapResult['executed'] {
  for (const log of receipt.logs) {
    // a route's token runs its own code inside the swap and may emit an event of the same shape
    if (!same(log.address, router)) continue
    try {
      const e = decodeEventLog({ abi: EXECUTED, data: log.data, topics: log.topics })
      if (e.eventName === 'Executed') return { amountIn: e.args.amountIn, amountOut: e.args.amountOut, feeAsset: e.args.feeAsset, feeAmount: e.args.feeAmount }
    } catch {
      // another contract's log
    }
  }
  return null
}

