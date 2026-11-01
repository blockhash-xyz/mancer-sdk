import { z } from 'zod'
import { getAddress, zeroAddress, type Address } from 'viem'
import { DEFAULT_MAX_DEVIATION_BPS, checkSwapSteps, checkTransferSteps, holdSignedFloor, publishedSwapFeeBps, type Quote, type ReadySteps, type TransferAssetInput } from '@blockhash/mancer-sdk'
import { buildMismatch, chainOf, checking, pinned, structural, transactionsOf, trustedOf } from './checks'
import { amount, bps, token, tool, wallet, walletOf, type ToolSpec } from './tool'
import { WETH, addressOf, amountOf, ask, badArgument, nextFor, rawOf, stepDoes, swapReadingOf, tokenInfos, tokenOf, ToolRefusal, type TokenInfo } from './values'

/**
 * The swap and the send. A swap is quoted and built by the API's own quote route (`GET /v1/quote`), which plans the route,
 * compiles MancerRouter's call, sets its floor and deadline, and simulates it from the wallet; its steps (`steps=1`) are
 * the exact approval the wallet's allowance falls short of, then the swap. Nothing here plans or encodes a route. Every
 * build is held to the SDK's own check before it is answered (checks.ts): a swap's `checkSwapSteps` (the swap sent to the
 * pinned MancerRouter, the approval of the token spent to the pinned allowance target for exactly what it spends, no step
 * the check does not read, every field of the router's call, every leg a venue of the kit's table, the floor at least
 * the caller's own `minOut` (and at least the quote less the slippage it asked), or with `trustQuote` the quote less that
 * slippage, held for WETH against USDG within 300 bps of the Uniswap pool as the SDK holds it, the fee at most the
 * published one, the output paid to the recipient asked; the ordered envelope every build for a taker carries held to
 * that same swap, its approval and its call alone; and no launch coordinator's envelope, which a swap asked with
 * `excludeAccountBound` never is), a send's `checkTransferSteps` (the kit's own transfer call of what was asked to whom
 * was named, byte for byte). A build that fails is refused `build-mismatch`. No credential is needed: the wallet's own
 * signature is what the build waits on.
 *
 * A swap's floor follows the SDK's rule (floor.ts): a floor from the API's word alone is never built unless the caller
 * chose it. build_swap names `minOut` (a price of the caller's own) or `trustQuote: true`, one of the two, and its answer
 * says which floor it carries and where it came from. Neither tool hands the agent the API's quote object: each answers
 * what it describes (the amounts, the route's tokens and venues as data, the price impact, the fee, the safety reading,
 * the floor), and build_swap's transactions are the checked steps alone. No `tx`, `ready`, `steps`, calldata or approval
 * of the API's reaches the agent unread.
 */

/** The query a swap is asked with: native ether as WETH, with the native flags on a build alone, and router routes alone
 * (`excludeAccountBound`), so every swap a build answers is one MancerRouter call this server reads back. */
function swapQuery(a: { tokenIn: ReturnType<typeof tokenOf>; tokenOut: ReturnType<typeof tokenOf>; amountIn: bigint }, build: boolean) {
  return {
    tokenIn: a.tokenIn.native ? WETH : a.tokenIn.address,
    tokenOut: a.tokenOut.native ? WETH : a.tokenOut.address,
    amountIn: a.amountIn.toString(),
    excludeAccountBound: '1',
    ...(build && a.tokenIn.native ? { nativeIn: '1' } : {}),
    ...(build && a.tokenOut.native ? { nativeOut: '1' } : {}),
  }
}

function pairOf(a: { tokenIn: string; tokenOut: string }) {
  const tokenIn = tokenOf(a.tokenIn, 'tokenIn')
  const tokenOut = tokenOf(a.tokenOut, 'tokenOut')
  // the router refuses a swap whose two sides are one asset, ether and WETH included: that is a wrap, not a swap
  if ((tokenIn.native ? WETH : tokenIn.address) === (tokenOut.native ? WETH : tokenOut.address)) {
    throw badArgument("tokenIn and tokenOut are one asset. Ether and WETH are one asset: wrap with WETH's deposit, or unwrap with its withdraw.", 'same-token')
  }
  return { tokenIn, tokenOut }
}

/** No route: the API's reason, where it names one, is data beside the sentence, never inside it. */
const NO_ROUTE = (reason?: unknown) =>
  new ToolRefusal({
    error: 'No route answers this swap now.',
    code: 'no-route',
    retryable: true,
    ...(typeof reason === 'string' ? { detail: { reason: reason.slice(0, 120) } } : {}),
  })

interface QuoteBody {
  quote?: Record<string, unknown> | null
  reason?: unknown
  estimate?: boolean
}

/** The slippage a build holds its floor to where the caller names none, as the SDK's: 50 bps. */
export const DEFAULT_SLIPPAGE_BPS = 50
const BPS = 10_000n

/** A steps field the API answered with its own refusal in it (`{ error, code }`): that refusal, as the tool's. */
function readyRefusal(ready: unknown): void {
  const r = ready as { error?: unknown; code?: unknown } | null
  if (r && typeof r.error === 'string' && typeof r.code === 'string') throw new ToolRefusal({ error: r.error.slice(0, 600), code: r.code, retryable: r.code === 'steps-unavailable' })
}

const ADDR = /^0x[0-9a-fA-F]{40}$/
/** A venue's id or a route's kind as the API names them: a short word, never prose. */
const WORD = /^[A-Za-z0-9][A-Za-z0-9_.:>-]{0,63}$/
/** The fields of a route that name a token, in every route kind the API answers (openapi `Route`, `RouteLeg`). */
const TOKEN_FIELDS = new Set(['tokenIn', 'tokenOut', 'mid', 'midA', 'midB', 'currency0', 'currency1', 'cash', 'token', 'quoteToken', 'exactCurrency', 'out', 'path'])
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null)
const word = (v: unknown, allowed?: readonly string[]): string | null => (typeof v === 'string' && WORD.test(v) && (!allowed || allowed.includes(v)) ? v : null)

/** A route as data: its kind, the tokens it passes through and the venues it runs on, in the order they appear. Native
 * ether (a V4 currency of zero) reads as ETH. Nothing else of the API's route object is answered. */
export function routeOf(route: unknown): { kind: string | null; tokens: string[]; venues: string[] } | null {
  if (!route || typeof route !== 'object' || Array.isArray(route)) return null
  const tokens = new Set<string>()
  const venues = new Set<string>()
  const walk = (v: unknown, key: string | null, depth: number) => {
    if (depth > 8) return
    if (typeof v === 'string') {
      if (key === 'venue' && WORD.test(v)) venues.add(v)
      else if (key !== null && TOKEN_FIELDS.has(key) && ADDR.test(v)) tokens.add(v.toLowerCase() === zeroAddress ? 'ETH' : v.toLowerCase())
      return
    }
    if (Array.isArray(v)) {
      for (const x of v.slice(0, 64)) walk(x, key, depth + 1)
      return
    }
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v).slice(0, 64)) walk(x, k, depth + 1)
  }
  walk(route, null, 0)
  return { kind: word((route as { kind?: unknown }).kind), tokens: [...tokens].slice(0, 32), venues: [...venues].slice(0, 32) }
}

/** Mancer's fee as the quote names it: its rate, the side it is taken on and the pair's tier. */
function feeOf(fee: unknown): { bps: number | null; side: string | null; tier: string | null } | null {
  if (!fee || typeof fee !== 'object') return null
  const f = fee as Record<string, unknown>
  return { bps: num(f.bps), side: word(f.side, ['input', 'output', 'mid']), tier: word(f.tier, ['pegged', 'eth-stable', 'other', 'new-token']) }
}

const SAFETY_REASONS = ['value-discrepancy', 'pool-fee', 'sell-blocked', 'sell-gated', 'round-trip', 'router-refused'] as const
/** The quote's reference reading (openapi `Safety`): its flags and figures, each by its type; a chain's revert reason is
 * another party's text and comes as data, cut short. */
function safetyOf(safety: unknown): Record<string, unknown> | null {
  if (!safety || typeof safety !== 'object') return null
  const s = safety as Record<string, unknown>
  return {
    blocked: bool(s.blocked),
    reasonCode: word(s.reasonCode, SAFETY_REASONS),
    referenceShortfallBps: num(s.referenceShortfallBps),
    poolFeeBps: num(s.poolFeeBps),
    poolFeeShareBps: num(s.poolFeeShareBps),
    routeFeeBps: num(s.routeFeeBps),
    outsideAgrees: bool(s.outsideAgrees),
    sellTaxBps: num(s.sellTaxBps),
    sellFreshWalletBlocked: bool(s.sellFreshWalletBlocked),
    sellBlockedReason: typeof s.sellBlockedReason === 'string' ? s.sellBlockedReason.slice(0, 200) : null,
    referenceUsdIn: num(s.referenceUsdIn),
    referenceUsdOut: num(s.referenceUsdOut),
  }
}

/** The quote's dollar values, price impact and fee, as numbers and words alone. */
function economicsOf(q: Record<string, unknown>) {
  return { priceImpactBps: num(q.priceImpactBps), fee: feeOf(q.fee), usdIn: num(q.usdIn), usdOut: num(q.usdOut), safety: safetyOf(q.safety) }
}

const isWethUsdg = (a: string, b: string, t: { weth: string; usdg: string }) => {
  const [x, y, w, u] = [a.toLowerCase(), b.toLowerCase(), t.weth.toLowerCase(), t.usdg.toLowerCase()]
  return (x === w && y === u) || (x === u && y === w)
}

/** Where a trustQuote floor comes from, said for the pair it is. */
const trustFloorFrom = (wethUsdg: boolean, slippage: number) =>
  wethUsdg
    ? `Mancer's quote less ${slippage} bps, held within ${DEFAULT_MAX_DEVIATION_BPS} bps of what the Uniswap WETH/USDG pool pays, read on this server's node (or the API's chain door where it names none).`
    : `Mancer's quote less ${slippage} bps, and nothing else: no price of yours stands behind it. Name minOut from a price of your own to bound it.`

export const TRADE_TOOLS: ToolSpec[] = [
  tool({
    name: 'get_quote',
    title: 'Quote a swap',
    kind: 'read',
    description: `What a swap of this size delivers now: the output, its dollar values, the route's tokens and venues, the price impact, the fee, the slippage Mancer recommends, and the floor build_swap with trustQuote builds at. No transaction is built: build_swap builds one. With no sign-in and no API key the answer is a price estimate with no route.`,
    shape: { tokenIn: token('The token spent'), tokenOut: token('The token bought'), amount: amount('The amount spent') },
    run: async (ctx, a) => {
      const { tokenIn, tokenOut } = pairOf(a)
      const infos = await tokenInfos(ctx, [tokenIn, tokenOut])
      const inInfo = infos.get(tokenIn.address)!, outInfo = infos.get(tokenOut.address)!
      const amountIn = rawOf(a.amount, inInfo.decimals, 'amount')
      const body = await ask<QuoteBody>(ctx.api, { method: 'GET', path: '/v1/quote', query: swapQuery({ tokenIn, tokenOut, amountIn }, false) })
      const q = body.quote
      if (!q) throw NO_ROUTE(body.reason)
      const out = /^\d{1,78}$/.test(String(q.amountOut ?? '')) ? BigInt(String(q.amountOut)) : 0n
      const routeIn = tokenIn.native ? WETH : tokenIn.address
      const routeOut = tokenOut.native ? WETH : tokenOut.address
      return {
        tokenIn: amountOf(amountIn, inInfo),
        tokenOut: amountOf(out, outInfo),
        estimate: body.estimate === true || q.estimate === true,
        route: routeOf(q.route),
        ...economicsOf(q),
        recommendedSlippageBps: num(q.recommendedSlippageBps),
        marketNote: typeof q.marketNote === 'string' ? q.marketNote.slice(0, 300) : null,
        floor: {
          ...amountOf((out * (BPS - BigInt(DEFAULT_SLIPPAGE_BPS))) / BPS, outInfo),
          slippageBps: DEFAULT_SLIPPAGE_BPS,
          builtBy: `build_swap with trustQuote: true and slippageBps ${DEFAULT_SLIPPAGE_BPS} (its default) signs this floor where its own quote is this one.`,
          from: trustFloorFrom(isWethUsdg(routeIn, routeOut, pinned()), DEFAULT_SLIPPAGE_BPS),
        },
      }
    },
  }),
  tool({
    name: 'build_swap',
    title: 'Build a swap',
    kind: 'build',
    description: `Build a swap for your wallet to sign: the exact approval where its allowance falls short, then the swap through MancerRouter, each simulated from the wallet. Name its floor: minOut, from a price of your own, or trustQuote: true, Mancer's quote less slippageBps (for WETH against USDG held within ${DEFAULT_MAX_DEVIATION_BPS} bps of the Uniswap pool, for any other pair Mancer's word alone). The build is held to the SDK's check (the pinned router and allowance target, the exact approval, every leg a venue of Mancer's routing, the floor) or refused build-mismatch. Needs no key. Mancer never signs.`,
    shape: {
      tokenIn: token('The token spent'),
      tokenOut: token('The token bought'),
      amount: amount('The amount spent'),
      wallet: wallet('The wallet that signs, pays and sends'),
      recipient: z.string().optional().describe('Who receives the output: an address; the wallet by default.'),
      minOut: z.string().optional().describe("The least the swap may deliver, a decimal number in tokenOut's own units, such as \"30\": set it from a price of your own. Mancer builds no route under it, and the swap's floor is at least it. Name this or trustQuote."),
      trustQuote: z.literal(true).optional().describe(`Take the floor from Mancer's quote: the quote less slippageBps. For WETH against USDG it is refused more than ${DEFAULT_MAX_DEVIATION_BPS} bps under the Uniswap pool's answer; for any other pair nothing of yours bounds it. Name this or minOut.`),
      slippageBps: bps(`The most the output may fall under the quote: the floor the swap carries is the quote less this, and with minOut the higher of the two. ${DEFAULT_SLIPPAGE_BPS} by default; get_quote names Mancer's recommendation`, 1, 5000),
      maxFeeBps: bps("The most Mancer's fee may be: the published rate for the pair by default (a token in its first day pays 50: name 50 to accept it)", 0, 100),
    },
    run: async (ctx, a) => {
      const { api } = ctx
      // the SDK's rule: a floor from the API's word alone is never built unless the caller chose it
      if ((a.minOut === undefined) === (a.trustQuote === undefined)) {
        throw badArgument("Name the swap's floor, one of two: minOut (the least it delivers, from a price of your own) or trustQuote: true (Mancer's quote less slippageBps). A floor from Mancer's word alone is never built unless you choose it.", 'floor-required')
      }
      const { tokenIn, tokenOut } = pairOf(a)
      const taker = await walletOf(ctx, a.wallet)
      const recipient = a.recipient ? addressOf(a.recipient, 'recipient') : taker
      const slippage = a.slippageBps ?? DEFAULT_SLIPPAGE_BPS
      const infos = await tokenInfos(ctx, [tokenIn, tokenOut])
      const inInfo = infos.get(tokenIn.address)!, outInfo = infos.get(tokenOut.address)!
      const amountIn = rawOf(a.amount, inInfo.decimals, 'amount')
      // the caller's own floor, in the output's own units: sent as the floor Mancer builds no route under, and held below
      const named = a.minOut !== undefined ? rawOf(a.minOut, outInfo.decimals, 'minOut') : null
      const trusted = await trustedOf(ctx)
      const routeIn = tokenIn.native ? WETH : tokenIn.address
      const routeOut = tokenOut.native ? WETH : tokenOut.address
      const maxFee = a.maxFeeBps ?? publishedSwapFeeBps(trusted.chainId, routeIn, routeOut)
      const body = await ask<QuoteBody>(api, {
        method: 'GET', path: '/v1/quote',
        query: { ...swapQuery({ tokenIn, tokenOut, amountIn }, true), taker, recipient, slippageBps: slippage, steps: '1', ...(named !== null ? { acceptedMinOut: named.toString() } : {}) },
      })
      const q = body.quote
      if (!q) throw NO_ROUTE(body.reason)
      if (!q.tx || !q.ready) throw NO_ROUTE('the route built no transaction')
      // every build the API answers for a taker carries its ordered envelope (`entrypoint: 'router'`: the exact approval
      // and the router's call), which the SDK's check holds to the plain swap it stands for (checks.ts
      // `routerEnvelopeCheck`: no authorization or other step in it). The swap was asked with excludeAccountBound: a launch
      // coordinator's envelope is no answer to it, and is never checked here as one
      const execution = q.execution as { entrypoint?: unknown } | null | undefined
      if (execution !== undefined && execution !== null && (typeof execution !== 'object' || execution.entrypoint !== 'router')) {
        throw buildMismatch('swap', execution && typeof execution === 'object' && execution.entrypoint === 'launch-coordinator'
          ? 'the answer is a launch route through the launch coordinator, which build_swap never asks for'
          : "the answer's envelope names no router entrypoint this server reads")
      }
      readyRefusal(q.ready)
      const quotedFee = (q.fee as { bps?: unknown } | undefined)?.bps
      if (typeof quotedFee === 'number' && quotedFee > maxFee) {
        throw new ToolRefusal({
          error: `The quote's fee is ${quotedFee} bps, over the ${maxFee} this build accepts${quotedFee <= 50 && maxFee < 50 ? ' (a token first seen in the last day pays 50: name maxFeeBps 50 to accept it)' : ''}.`,
          code: 'fee-over-cap', retryable: false,
        })
      }
      // the floor is the higher of the caller's own and the quote less the slippage asked, never the floor the answer states
      const quoted = BigInt(String(q.quotedAmountOut ?? q.amountOut ?? '0'))
      const lessSlippage = (quoted * (BPS - BigInt(slippage))) / BPS
      if (lessSlippage <= 0n) throw NO_ROUTE('the quote delivers nothing')
      const floor = named !== null && named > lessSlippage ? named : lessSlippage
      const wethUsdg = isWethUsdg(routeIn, routeOut, trusted)
      // trustQuote: the quote's floor, held for WETH against USDG beside the Uniswap pool on this server's node, as the
      // SDK holds it (floor.ts `floorBesidePool`, 300 bps); every other pair's is the quote's word, as the caller chose
      if (a.trustQuote === true) {
        await checking(() => holdSignedFloor('swap', { trustQuote: true }, chainOf(ctx), trusted, { tokenIn: getAddress(routeIn), tokenOut: getAddress(routeOut), amountIn }, floor))
      }
      const checked = await checking(() => checkSwapSteps({ ...(q as unknown as Quote), ready: structural(q.ready as ReadySteps) }, {
        wallet: taker, recipient, tokenIn: routeIn, tokenOut: routeOut, amountIn,
        nativeIn: tokenIn.native, nativeOut: tokenOut.native, minOut: floor, maxFeeBps: maxFee, integratorFee: null,
      }, trusted))
      // the floor the answer states must be one the swap carries: an answer that says more than its own calldata holds says
      // something untrue of what the wallet would sign
      const carried = checked.readings.find((r) => r.router)?.router?.delivers.atLeast ?? 0n
      const stated = /^\d{1,78}$/.test(String(q.minOut ?? '')) ? BigInt(String(q.minOut)) : null
      if (stated !== null && stated > carried) throw buildMismatch('swap', `the quote states a floor of ${stated}, and the swap carries ${carried}`)
      const transactions = transactionsOf(checked, (step, reading) => {
        if (reading?.router) return { ...swapReadingOf(reading.router, infos), venues: (reading.legs ?? []).map((l) => (l.inner ? `${l.venue}>${l.inner.venue}` : l.venue)) }
        return stepDoes(step, infos)
      })
      const simulation = (q.ready as { simulation?: unknown }).simulation ?? null
      return {
        wallet: taker,
        recipient,
        spends: amountOf(amountIn, inInfo),
        expectedOut: amountOf(quoted, outInfo),
        minOut: amountOf(carried, outInfo),
        slippageBps: slippage,
        floorRule: a.trustQuote === true ? 'trustQuote' : 'minOut',
        floorFrom: a.trustQuote === true ? trustFloorFrom(wethUsdg, slippage) : `Your minOut, and at least the quote less ${slippage} bps.`,
        route: routeOf(q.route),
        ...economicsOf(q),
        transactions,
        simulation,
        next: nextFor(simulation, taker, `Sign and send each transaction in order from ${taker}, each only after the one before it landed (get_transaction_receipt). The swap reverts on chain if it would deliver less than minOut, or after its deadline.`),
      }
    },
  }),
  tool({
    name: 'build_transfer',
    title: 'Build a send',
    kind: 'build',
    description: "Build a send of ether, a token or an NFT from your wallet, simulated from the wallet at the head. The recipient is checked by mancer.xyz's own rules: an address, or @username for the wallet that holds it. The step must be the kit's own transfer of what you asked to whom you named, byte for byte, or the build is refused build-mismatch. Needs no key.",
    shape: {
      wallet: wallet('The wallet that sends'),
      to: z.string().describe('The recipient: an address, or @username.'),
      token: z.string().optional().describe("What is sent: a token's address, or ETH. Leave it out to send an NFT."),
      amount: z.string().optional().describe('How much of the token, a decimal number in its own units. For an ERC-1155 piece, how many (1 by default).'),
      collection: z.string().optional().describe("An NFT's collection: its contract's address."),
      tokenId: z.string().regex(/^(0|[1-9][0-9]{0,77})$/).optional().describe("An NFT's id, a whole number."),
    },
    run: async (ctx, a) => {
      const { api } = ctx
      const from = await walletOf(ctx, a.wallet)
      const to = String(a.to).trim()
      if (!/^@?[A-Za-z0-9]{1,32}$/.test(to) && !/^0x[0-9a-fA-F]{40}$/.test(to)) throw badArgument('to is an address, or @username.', 'bad-recipient')
      let body: Record<string, unknown>
      let asset: TransferAssetInput
      let raw: bigint | undefined
      let infos = new Map<string, TokenInfo>()
      if (a.collection !== undefined || a.tokenId !== undefined) {
        if (a.collection === undefined || a.tokenId === undefined || a.token !== undefined) throw badArgument('An NFT is named by collection and tokenId, and no token.', 'bad-asset')
        if (a.amount !== undefined && !/^[1-9][0-9]{0,30}$/.test(a.amount)) throw badArgument('An NFT amount is a whole number above zero.', 'bad-amount')
        const collection = addressOf(a.collection, 'collection')
        asset = { kind: 'nft', collection, tokenId: BigInt(a.tokenId) }
        raw = a.amount ? BigInt(a.amount) : undefined
        body = { wallet: from, to, asset: { kind: 'nft', collection, tokenId: a.tokenId }, ...(a.amount ? { amount: a.amount } : {}) }
      } else {
        if (a.token === undefined || a.amount === undefined) throw badArgument('A send names token and amount, or an NFT by collection and tokenId.', 'bad-asset')
        const t = tokenOf(a.token, 'token')
        infos = await tokenInfos(ctx, [t])
        raw = rawOf(a.amount, infos.get(t.address)!.decimals, 'amount')
        asset = t.native ? { kind: 'native' } : { kind: 'erc20', token: t.address }
        body = { wallet: from, to, asset: t.native ? { kind: 'native' } : { kind: 'erc20', token: t.address }, amount: raw.toString() }
      }
      const answer = await ask<Record<string, unknown>>(api, { method: 'POST', path: '/v1/transfers/steps', body })
      readyRefusal(answer)
      const checked = await checking(() => checkTransferSteps(structural(answer as unknown as ReadySteps), { wallet: from, to, asset, ...(raw !== undefined ? { amount: raw } : {}) }))
      const simulation = answer.simulation ?? null
      return {
        wallet: from,
        recipient: checked.recipient.toLowerCase(),
        warnings: Array.isArray(answer.warnings) ? answer.warnings : [],
        transactions: transactionsOf(checked, (step) => stepDoes(step, infos)),
        simulation,
        next: nextFor(simulation, from, `Sign and send the transaction from ${from}.`),
      }
    },
  }),
]
