import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { decodeFunctionResult, encodeFunctionData, erc20Abi, hashTypedData, type Address, type Hex } from 'viem'
import {
  MANCER_ORDER_FEE_CEILING_BPS,
  ZERO_OCO_GROUP,
  cancelOrdersMessage,
  checkCancelAllSteps,
  checkCancelSteps,
  checkOrderSetupSteps,
  mancerOrdersV3Abi,
  orderTypedDataMismatch,
  orderTypedDataV3,
  orderV3ToSign,
  readOrderTypedData,
  type MancerOrderV3,
  type ReadySteps,
} from '@blockhash/mancer-sdk'
import { seg } from './api'
import { buildMismatch, checking, structural, transactionsOf, trustedOf } from './checks'
import { amount, limit, token, tool, wallet, walletOf, type ToolContext, type ToolSpec } from './tool'
import { CHAIN_ID, WETH, addressOf, amountOf, ask, badArgument, ethCall, hashOf, nextFor, rawOf, stepDoes, tokenInfos, tokenOf, ToolRefusal, type TokenInfo, type UnsignedTx } from './values'

/**
 * Orders: limit, stop, one-cancels-the-other and recurring. An order is the maker's EIP-712 signature over MancerOrders
 * V3's `Order`, rested on Mancer's book and filled by Mancer's executor. A prepare answers what the wallet signs: the
 * order's typed data, built by mancer.xyz's own builder (the SDK's `orderV3ToSign` and `orderTypedDataV3`, which the site
 * and the phone app sign from) and read back by the contracts kit's reader, and the wrap and the exact approval the order
 * needs first (`GET /v1/orders/setup`). The orders contract is the one the kit pins, once `GET /v1/contracts` names the same
 * (checks.ts `trustedOf`): the typed data's verifyingContract is never the answer's word. The setup is held to the SDK's
 * `checkOrderSetupSteps` (a wrap of ether into the pinned WETH, at most this order's pull less the WETH the wallet holds
 * beyond its other orders' pulls; an approval of the token sold to the pinned orders contract for this order's whole pull,
 * and with a credential the API counted the maker's other open orders by, what those still pull as the API's own order
 * list names them (the API's word, as list_orders reads it), never more and never unbounded; and nothing else),
 * an on-chain cancel to `checkCancelSteps` (`cancel(order)` on the pinned orders contract, of the maker's own order that
 * hashes to the hash named) and a cancel of every order to `checkCancelAllSteps` (`cancelAll` with the caller's salt). A
 * build that fails is refused `build-mismatch`. A submit hands the API the signature (`POST /v1/orders`), which checks it
 * against the maker on the book. A cancel is the maker's signed message (`POST /v1/orders/cancellations`), or the on-chain
 * cancel's steps. None of it needs a key: the maker's signature is the authority. Reading the maker's orders back needs
 * its signed-in wallet (or a key, for the orders it submitted).
 */

const ORDER_HASH = (v: string) => hashOf(v, 'hash')

/** The orders contract the kit pins, once the API names the same one: what every order is signed for. */
async function ordersContract(ctx: ToolContext): Promise<Address> {
  return (await trustedOf(ctx)).orders.toLowerCase() as Address
}

/** The wallet's WETH balance now, read on the chain (this server's own node where one is named): what a wrap need not wrap
 * again. */
async function wethHeld(ctx: ToolContext, weth: Address, owner: Address): Promise<bigint> {
  const raw = await ethCall(ctx, weth, encodeFunctionData({ abi: erc20Abi, functionName: 'balanceOf', args: [owner] }))
  try {
    return decodeFunctionResult({ abi: erc20Abi, functionName: 'balanceOf', data: raw }) as bigint
  } catch {
    throw new ToolRefusal({ error: "The wallet's WETH balance did not read.", code: 'chain-unavailable', retryable: true })
  }
}

const DIGITS = /^\d{1,78}$/
const same = (a: unknown, b: string) => typeof a === 'string' && a.toLowerCase() === b.toLowerCase()

/**
 * What the maker's other open orders on a token still pull from its wallet on the pinned orders contract, as the API's own
 * order list answers them for that maker (`GET /v1/orders`, what list_orders reads): each open order's amount a fill
 * times the fills it has left, the API's word. It is read only where the setup says the API counted them (`maker`, the
 * maker's own sign-in; `key`, the orders a key submitted), and is 0 otherwise, so a setup asked with no credential
 * approves this order's own pull and no more. A row this server cannot read counts nothing, which only narrows the bound.
 */
async function otherOpenPulls(ctx: ToolContext, scope: unknown, maker: Address, tokenIn: Address, contract: Address): Promise<bigint> {
  if ((scope !== 'maker' && scope !== 'key') || !ctx.credentialed) return 0n
  const page = await ask<{ orders?: unknown }>(ctx.api, { method: 'GET', path: '/v1/orders', query: { maker, status: 'open', limit: 500 } })
  let sum = 0n
  for (const row of Array.isArray(page.orders) ? page.orders : []) {
    const r = row as { status?: unknown; contract?: unknown; maker?: unknown; fillsDone?: unknown; order?: { tokenIn?: unknown; amountPerFill?: unknown; totalFills?: unknown; maker?: unknown } }
    if (r?.status !== 'open' || !same(r.contract, contract) || !same(r.order?.tokenIn, tokenIn) || !same(r.maker ?? r.order?.maker, maker)) continue
    const per = String(r.order?.amountPerFill ?? '')
    const total = Number(r.order?.totalFills)
    const done = Number(r.fillsDone ?? 0)
    if (!DIGITS.test(per) || !Number.isInteger(total) || !Number.isInteger(done) || total < 1) continue
    sum += BigInt(per) * BigInt(Math.max(0, total - done))
  }
  return sum
}

/** The maker's epoch on the orders contract, read through the API's chain door. */
async function makerEpoch(ctx: ToolContext, contract: Address, maker: Address): Promise<Hex> {
  const raw = await ethCall(ctx, contract, encodeFunctionData({ abi: mancerOrdersV3Abi, functionName: 'makerEpoch', args: [maker] }))
  try {
    return (decodeFunctionResult({ abi: mancerOrdersV3Abi, functionName: 'makerEpoch', data: raw }) as Hex).toLowerCase() as Hex
  } catch {
    throw new ToolRefusal({ error: "The maker's epoch did not read.", code: 'chain-unavailable', retryable: true })
  }
}

function random32(): Hex {
  for (;;) {
    const b = randomBytes(32)
    if (b.some((x) => x !== 0)) return `0x${b.toString('hex')}` as Hex
  }
}

const nonce = () => BigInt(`0x${randomBytes(16).toString('hex')}`).toString()

/** JSON for typed data: every integer as a decimal string, which wallets and viem sign alike. */
function jsonOf<T>(v: T): unknown {
  return JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x)))
}

interface Terms {
  amountPerFill: bigint
  totalFills: number
  everySec: number
  startAt: number
  expiry: number
  minOutPerFill: bigint
  triggerOutPerFill: bigint
  maxOutPerFill: bigint
}

interface Prepared {
  maker: Address
  contract: Address
  infos: Map<string, TokenInfo>
  tokenIn: Address
  tokenOut: Address
  nativeIn: boolean
  feeBps: number
  epoch: Hex
  /** The setup's transactions, checked, and its simulation. */
  setup: { transactions: UnsignedTx[]; simulation: unknown }
  /** Whether the setup counted the maker's other open orders on the token beside this one. */
  setupCountedOpen: boolean
}

/** What every order of a pair reads before it is signed: the contract, the pair's fee, the maker's epoch, and the setup. */
async function prepare(ctx: ToolContext, a: { wallet?: string; tokenIn: string; tokenOut: string }, firstOf: (info: TokenInfo) => { amountPerFill: bigint; totalFills: number }): Promise<Prepared & { first: { amountPerFill: bigint; totalFills: number } }> {
  const maker = await walletOf(ctx, a.wallet)
  const tIn = tokenOf(a.tokenIn, 'tokenIn')
  const tOut = tokenOf(a.tokenOut, 'tokenOut')
  // an order sells ether as WETH (the setup wraps what the maker's WETH falls short of) and always delivers WETH for ether
  const tokenIn = tIn.native ? WETH : tIn.address
  const tokenOut = tOut.native ? WETH : tOut.address
  if (tokenIn === tokenOut) throw badArgument('tokenIn and tokenOut are the same token.', 'same-token')
  const infos = await tokenInfos(ctx, [{ native: false, address: tokenIn }, { native: false, address: tokenOut }])
  const first = firstOf(infos.get(tokenIn)!)
  const contract = await ordersContract(ctx)
  const fee = await ask<{ feeBps?: unknown }>(ctx.api, { method: 'GET', path: '/v1/order-fee', query: { tokenIn, tokenOut } })
  const feeBps = Number(fee.feeBps)
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > MANCER_ORDER_FEE_CEILING_BPS) {
    throw new ToolRefusal({ error: `The pair's order fee reads ${String(fee.feeBps)} bps, over the ${MANCER_ORDER_FEE_CEILING_BPS} the published schedule charges any pair.`, code: 'fee-unreadable', retryable: false })
  }
  const epoch = await makerEpoch(ctx, contract, maker)
  const setupAnswer = await ask<{ ready?: unknown; need?: Record<string, unknown> }>(ctx.api, {
    method: 'GET', path: '/v1/orders/setup',
    query: { tokenIn, tokenOut, amountIn: first.amountPerFill.toString(), maker, totalFills: first.totalFills, steps: '1', nativeIn: tIn.native ? '1' : undefined },
  })
  const ready = setupAnswer.ready as (ReadySteps & { need?: { openPullsOf?: unknown }; error?: unknown; code?: unknown }) | undefined
  // whose open orders the API counted beside this one: its answer names it beside the steps (`ready.need`)
  const scope = ready?.need?.openPullsOf ?? setupAnswer.need?.openPullsOf
  let setup: Prepared['setup'] = { transactions: [], simulation: null }
  // a setup with no steps (or the API's own `nothing-to-do`) needs nothing signed first; any other is held to the SDK's check
  const none = !ready || (Array.isArray(ready.steps) && ready.steps.length === 0) || ready.code === 'nothing-to-do'
  if (!none) {
    if (typeof ready.error === 'string' && typeof ready.code === 'string') throw new ToolRefusal({ error: ready.error.slice(0, 600), code: ready.code, retryable: ready.code === 'steps-unavailable' })
    const trusted = await trustedOf(ctx)
    // the approval is this order's pull, and with a credential the API counted the maker's other open orders by, what those
    // still pull as the API's own order list names them: never the allowance a chain door answers, which an API could raise
    // to anything. A wrap is at most the pull less the WETH the wallet holds beyond those orders' pulls.
    const [openPulls, held] = await Promise.all([
      otherOpenPulls(ctx, scope, maker, tokenIn, trusted.orders.toLowerCase() as Address),
      tIn.native ? wethHeld(ctx, trusted.weth, maker) : Promise.resolve(undefined),
    ])
    const checked = await checking(() => checkOrderSetupSteps({ ready: structural(ready), need: setupAnswer.need }, {
      wallet: maker, tokenIn, amountPerFill: first.amountPerFill, totalFills: first.totalFills, nativeIn: tIn.native, openPulls, ...(held !== undefined ? { held } : {}),
    }, trusted))
    if (checked) setup = { transactions: transactionsOf(checked, (step) => stepDoes(step, infos)), simulation: ready.simulation ?? null }
  }
  return { maker, contract, infos, tokenIn, tokenOut, nativeIn: tIn.native, feeBps, epoch, setup, setupCountedOpen: (scope === 'maker' || scope === 'key') && ctx.credentialed, first }
}

/** One order's wire form, its typed data, its hash, and what the typed data says, read back by the kit's reader. */
function orderOf(p: Prepared, t: Terms, ocoGroup: Hex) {
  const order: MancerOrderV3 = orderV3ToSign(
    { tokenIn: p.tokenIn, tokenOut: p.tokenOut, amountPerFill: t.amountPerFill, totalFills: t.totalFills, everySec: t.everySec, startAt: t.startAt, expiry: t.expiry, minOutPerFill: t.minOutPerFill, triggerOutPerFill: t.triggerOutPerFill, maxOutPerFill: t.maxOutPerFill, maxFeeBps: p.feeBps },
    { maker: p.maker, epoch: p.epoch, nonce: nonce(), ...(ocoGroup === ZERO_OCO_GROUP ? {} : { ocoGroup }) },
  )
  const typed = orderTypedDataV3(order, CHAIN_ID, p.contract)
  const wrong = orderTypedDataMismatch(typed, {
    contract: p.contract, chainId: CHAIN_ID, maker: p.maker, tokenIn: p.tokenIn, tokenOut: p.tokenOut,
    amountPerFill: t.amountPerFill, totalFills: t.totalFills, minOutPerFill: t.minOutPerFill, maxFeeBps: p.feeBps,
    triggerOutPerFill: t.triggerOutPerFill, maxOutPerFill: t.maxOutPerFill, everySec: t.everySec, startAt: t.startAt, expiry: t.expiry,
    ocoGroup: ocoGroup === ZERO_OCO_GROUP ? null : ocoGroup, epoch: p.epoch,
  })
  if (wrong) throw buildMismatch('order', wrong)
  const reading = readOrderTypedData(typed)!
  const inInfo = p.infos.get(p.tokenIn)!, outInfo = p.infos.get(p.tokenOut)!
  return {
    order,
    orderHash: hashTypedData(typed as never),
    typedData: jsonOf(typed),
    reads: {
      maker: reading.maker.toLowerCase(),
      contract: reading.contract.toLowerCase(),
      spendsPerFill: amountOf(reading.spends.perFill, inInfo),
      fills: reading.spends.fills,
      spendsInAll: amountOf(reading.spends.total, inInfo),
      receivesAtLeastPerFill: amountOf(reading.receives.atLeastPerFill, outInfo),
      receivesAtMostPerFill: reading.receives.atMostPerFill === null ? null : amountOf(reading.receives.atMostPerFill, outInfo),
      triggerPerFill: reading.triggerOutPerFill === null ? null : amountOf(reading.triggerOutPerFill, outInfo),
      everySeconds: reading.schedule.everySec,
      startAt: reading.schedule.startAt === 0 ? 'at once' : new Date(reading.schedule.startAt * 1000).toISOString(),
      expires: reading.schedule.expiry === 0 ? 'never' : new Date(reading.schedule.expiry * 1000).toISOString(),
      maxFeeBps: reading.maxFeeBps,
      oneCancelsTheOther: reading.ocoGroup !== null,
    },
  }
}

function expiryOf(seconds: number | undefined): number {
  if (seconds === undefined) return 0
  return Math.floor(Date.now() / 1000) + seconds
}

const expiresIn = z.number().int().min(60).max(365 * 86_400).optional().describe('Seconds from now until the order expires, 60 to a year. Leave it out for an order that never expires.')

function answerOf(p: Prepared, orders: ReturnType<typeof orderOf>[], notes: string[] = []) {
  const counted = p.setupCountedOpen
    ? []
    : ["The setup's approval covers this order alone: with no sign-in it counts none of the wallet's other open orders on this token, and the approval it answers is exactly this order's pull. Sign in as the maker to count them."]
  return {
    wallet: p.maker,
    contract: p.contract,
    feeBps: p.feeBps,
    setup: p.setup.transactions,
    setupSimulation: p.setup.transactions.length ? p.setup.simulation : null,
    orders: orders.map((o) => ({ orderHash: o.orderHash, reads: o.reads, typedData: o.typedData, order: o.order })),
    notes: [...notes, ...counted],
    next: [
      p.setup.transactions.length ? nextFor(p.setup.simulation, p.maker, `Sign and send each setup transaction in order from ${p.maker}, each only after the one before it landed.`) : null,
      `Sign each order's typedData with EIP-712 (eth_signTypedData_v4) from ${p.maker}.`,
      'Then call submit_order with that order, its signature and the contract. Keep the order: build_cancel_order takes it to cancel on chain with no sign-in.',
    ].filter(Boolean),
  }
}

export const ORDER_TOOLS: ToolSpec[] = [
  tool({
    name: 'prepare_limit_order',
    title: 'Prepare a limit order',
    kind: 'build',
    description: "A limit order to sign: one fill of the amount, at minOut or better. It answers the order's EIP-712 typed data for the pinned orders contract and the wrap and bounded approval it needs first, or refuses build-mismatch. Mancer's executor fills it once the market pays minOut. Needs no key.",
    shape: { wallet: wallet('The maker: the wallet that signs and pays'), tokenIn: token('The token sold'), tokenOut: token('The token bought'), amount: amount('The amount sold'), minOut: amount('The least the fill delivers, in tokenOut'), expiresInSeconds: expiresIn },
    run: async (ctx, a) => {
      const p = await prepare(ctx, a, (info) => ({ amountPerFill: rawOf(a.amount, info.decimals, 'amount'), totalFills: 1 }))
      const minOut = rawOf(a.minOut, p.infos.get(p.tokenOut)!.decimals, 'minOut')
      const o = orderOf(p, { amountPerFill: p.first.amountPerFill, totalFills: 1, everySec: 0, startAt: 0, expiry: expiryOf(a.expiresInSeconds), minOutPerFill: minOut, triggerOutPerFill: 0n, maxOutPerFill: 0n }, ZERO_OCO_GROUP)
      return answerOf(p, [o], p.tokenOut === WETH && tokenOf(a.tokenOut).native ? ['An order delivers WETH for ether.'] : [])
    },
  }),
  tool({
    name: 'prepare_stop_order',
    title: 'Prepare a stop order',
    kind: 'build',
    description: "A stop order to sign: once the market's output for the amount falls to trigger, it fills at minOut or better. minOut sits under trigger. It answers the order's typed data and the setup it needs first, or refuses build-mismatch. Needs no key.",
    shape: { wallet: wallet('The maker'), tokenIn: token('The token sold'), tokenOut: token('The token bought'), amount: amount('The amount sold'), trigger: amount('The output, in tokenOut, the market falls to before the stop fills'), minOut: amount('The least the fill delivers, in tokenOut, under trigger'), expiresInSeconds: expiresIn },
    run: async (ctx, a) => {
      const p = await prepare(ctx, a, (info) => ({ amountPerFill: rawOf(a.amount, info.decimals, 'amount'), totalFills: 1 }))
      const d = p.infos.get(p.tokenOut)!.decimals
      const trigger = rawOf(a.trigger, d, 'trigger'), minOut = rawOf(a.minOut, d, 'minOut')
      if (minOut >= trigger) throw badArgument("A stop's minOut sits under its trigger.", 'bad-stop')
      return answerOf(p, [orderOf(p, { amountPerFill: p.first.amountPerFill, totalFills: 1, everySec: 0, startAt: 0, expiry: expiryOf(a.expiresInSeconds), minOutPerFill: minOut, triggerOutPerFill: trigger, maxOutPerFill: 0n }, ZERO_OCO_GROUP)])
    },
  }),
  tool({
    name: 'prepare_oco_order',
    title: 'Prepare a take-profit and stop pair',
    kind: 'build',
    description: "One-cancels-the-other: a take-profit limit and a stop on the same amount, signed under one group. The orders contract lets only one of the two fill. It answers both orders' typed data and the setup they need, or refuses build-mismatch. Sign and submit both. Needs no key.",
    shape: {
      wallet: wallet('The maker'), tokenIn: token('The token sold'), tokenOut: token('The token bought'), amount: amount('The amount sold'),
      takeProfitMinOut: amount("The take-profit's least output, in tokenOut"),
      stopTrigger: amount("The stop's trigger, in tokenOut"),
      stopMinOut: amount("The stop's least output, in tokenOut, under its trigger"),
      expiresInSeconds: expiresIn,
    },
    run: async (ctx, a) => {
      const p = await prepare(ctx, a, (info) => ({ amountPerFill: rawOf(a.amount, info.decimals, 'amount'), totalFills: 1 }))
      const d = p.infos.get(p.tokenOut)!.decimals
      const takeProfit = rawOf(a.takeProfitMinOut, d, 'takeProfitMinOut'), trigger = rawOf(a.stopTrigger, d, 'stopTrigger'), stopMin = rawOf(a.stopMinOut, d, 'stopMinOut')
      if (stopMin >= trigger) throw badArgument("The stop's minOut sits under its trigger.", 'bad-stop')
      if (takeProfit <= trigger) throw badArgument("The take-profit's minOut sits over the stop's trigger.", 'bad-oco')
      const group = random32()
      const expiry = expiryOf(a.expiresInSeconds)
      const base = { amountPerFill: p.first.amountPerFill, totalFills: 1, everySec: 0, startAt: 0, expiry, maxOutPerFill: 0n }
      return answerOf(p, [
        orderOf(p, { ...base, minOutPerFill: takeProfit, triggerOutPerFill: 0n }, group),
        orderOf(p, { ...base, minOutPerFill: stopMin, triggerOutPerFill: trigger }, group),
      ], ['The first order is the take-profit, the second the stop.'])
    },
  }),
  tool({
    name: 'prepare_recurring_order',
    title: 'Prepare a recurring order',
    kind: 'build',
    description: 'A recurring order to sign: fills of amountPerFill, everySeconds apart, each within the price range where one is named. It answers the typed data and the setup it needs, which approves every fill at once, or refuses build-mismatch. Needs no key.',
    shape: {
      wallet: wallet('The maker'), tokenIn: token('The token sold'), tokenOut: token('The token bought'),
      amountPerFill: amount('The amount each fill sells'),
      fills: z.number().int().min(2).max(10_000).describe('How many fills, 2 to 10,000.'),
      everySeconds: z.number().int().min(60).max(7_776_000).describe('Seconds between fills, 60 to 90 days.'),
      minOutPerFill: z.string().optional().describe('The least each fill delivers, in tokenOut; leave it out to fill at the market.'),
      maxOutPerFill: z.string().optional().describe('The most each fill may deliver, in tokenOut: a fill waits while the market pays more.'),
      startAt: z.number().int().min(0).optional().describe('Unix seconds of the earliest first fill; at once by default.'),
      expiresInSeconds: expiresIn,
    },
    run: async (ctx, a) => {
      const p = await prepare(ctx, a, (info) => ({ amountPerFill: rawOf(a.amountPerFill, info.decimals, 'amountPerFill'), totalFills: a.fills }))
      const d = p.infos.get(p.tokenOut)!.decimals
      const minOut = a.minOutPerFill !== undefined ? rawOf(a.minOutPerFill, d, 'minOutPerFill', true) : 0n
      const maxOut = a.maxOutPerFill !== undefined ? rawOf(a.maxOutPerFill, d, 'maxOutPerFill') : 0n
      if (maxOut !== 0n && maxOut <= minOut) throw badArgument('maxOutPerFill sits over minOutPerFill.', 'bad-range')
      return answerOf(p, [orderOf(p, { amountPerFill: p.first.amountPerFill, totalFills: a.fills, everySec: a.everySeconds, startAt: a.startAt ?? 0, expiry: expiryOf(a.expiresInSeconds), minOutPerFill: minOut, triggerOutPerFill: 0n, maxOutPerFill: maxOut }, ZERO_OCO_GROUP)])
    },
  }),
  tool({
    name: 'submit_order',
    title: 'Submit a signed order',
    kind: 'write',
    description: "Rest a signed order on Mancer's book. Pass the order as a prepare answered it, the maker's EIP-712 signature over its typedData, and the contract. The API checks the signature against the maker on the book before it takes the order. Needs no key.",
    shape: {
      order: z.record(z.string(), z.unknown()).describe('The order, as the prepare answered it.'),
      signature: z.string().regex(/^0x[0-9a-fA-F]+$/).describe("The maker's EIP-712 signature."),
      contract: z.string().describe('The orders contract, as the prepare answered it: an address.'),
    },
    run: async ({ api }, a) => ask(api, { method: 'POST', path: '/v1/orders', body: { order: a.order, signature: a.signature, contract: addressOf(a.contract, 'contract') } }),
  }),
  tool({
    name: 'list_orders',
    title: 'List orders',
    kind: 'read',
    needs: 'sign-in',
    description: "The signed-in wallet's orders, newest first, with each one's terms, fills and status. With an API key, the orders submitted through it.",
    shape: { wallet: z.string().optional().describe("Only this maker's orders: an address."), status: z.enum(['open', 'filled', 'cancelled', 'expired']).optional(), limit: limit(500, 50) },
    run: async ({ api }, a) => ask(api, { method: 'GET', path: '/v1/orders', query: { maker: a.wallet ? addressOf(a.wallet, 'wallet') : undefined, status: a.status, limit: a.limit ?? 50 } }),
  }),
  tool({
    name: 'get_order',
    title: 'Get an order',
    kind: 'read',
    needs: 'sign-in',
    description: "One order by its hash: its terms, its fills, its status and what holds it. Answered to its maker's signed-in wallet, or the key that submitted it.",
    shape: { hash: z.string().describe("The order's hash.") },
    run: async ({ api }, a) => ask(api, { method: 'GET', path: `/v1/orders/${seg(ORDER_HASH(a.hash))}` }),
  }),
  tool({
    name: 'get_fills',
    title: 'List fills',
    kind: 'read',
    description: "An order's fills, or a maker's, newest first: what each fill spent and delivered and its fee. Fills are public.",
    shape: { orderHash: z.string().optional().describe("An order's hash."), wallet: wallet("The maker, where no order is named"), limit: limit(500, 50) },
    run: async (ctx, a) => {
      const maker = a.orderHash ? (a.wallet ? addressOf(a.wallet, 'wallet') : undefined) : await walletOf(ctx, a.wallet)
      return ask(ctx.api, { method: 'GET', path: '/v1/fills', query: { orderHash: a.orderHash ? ORDER_HASH(a.orderHash) : undefined, maker, limit: a.limit ?? 50 } })
    },
  }),
  tool({
    name: 'prepare_cancel_orders',
    title: 'Prepare a cancel by signature',
    kind: 'build',
    description: "The message a maker signs to cancel up to 50 of its open orders on one book, with no transaction and no gas. Sign it with personal_sign (EIP-191) from the maker, then call submit_cancel_orders within 10 minutes. Mancer's executor obeys it; build_cancel_order cancels on chain. An API that names another orders contract than the kit's is refused build-mismatch.",
    shape: {
      hashes: z.array(z.string()).min(1).max(50).describe("The orders' hashes, one maker's on one book."),
      wallet: wallet('The maker'),
      contract: z.string().optional().describe('The orders contract the orders rest on, as their prepare answered it; the current one by default.'),
    },
    run: async (ctx, a) => {
      const hashes = [...new Set((a.hashes as string[]).map(ORDER_HASH))]
      const maker = await walletOf(ctx, a.wallet)
      const contract = a.contract ? addressOf(a.contract, 'contract') : await ordersContract(ctx)
      const issuedAt = Math.floor(Date.now() / 1000)
      return {
        maker,
        contract,
        hashes,
        issuedAt,
        message: cancelOrdersMessage(hashes, CHAIN_ID, contract, issuedAt),
        next: `Sign message with personal_sign from ${maker}, then call submit_cancel_orders with hashes, issuedAt and the signature within 10 minutes. The API cancels only orders that are this maker's, open, on this contract.`,
      }
    },
  }),
  tool({
    name: 'submit_cancel_orders',
    title: 'Cancel orders by signature',
    kind: 'write',
    description: "Cancel orders with the maker's signed cancel message: the hashes and issuedAt as prepare_cancel_orders answered them, and the signature. Needs no key.",
    shape: { hashes: z.array(z.string()).min(1).max(50), issuedAt: z.number().int().describe('As prepare_cancel_orders answered it.'), signature: z.string().regex(/^0x[0-9a-fA-F]+$/).describe("The maker's personal_sign signature.") },
    run: async ({ api }, a) => ask(api, { method: 'POST', path: '/v1/orders/cancellations', body: { hashes: (a.hashes as string[]).map(ORDER_HASH), issuedAt: a.issuedAt, signature: a.signature } }),
  }),
  tool({
    name: 'build_cancel_order',
    title: 'Build an on-chain cancel',
    kind: 'build',
    description: "Build the transaction that cancels one order on chain, which holds whatever any executor does. The maker signs and sends it. It must be cancel of the order whose hash is named, on the pinned orders contract, or the build is refused build-mismatch. With no sign-in, pass the order as its prepare answered it. Needs no key.",
    shape: {
      hash: z.string().describe("The order's hash."),
      wallet: wallet('The maker'),
      order: z.record(z.string(), z.unknown()).optional().describe('The order, as the prepare answered it: needed where no sign-in of the maker reaches the order.'),
    },
    run: async (ctx, a) => {
      if (!ctx.credentialed && a.order === undefined) {
        throw badArgument('With no sign-in, an on-chain cancel names the order it cancels as its prepare answered it (order). Or sign in as its maker.', 'order-required')
      }
      const maker = await walletOf(ctx, a.wallet)
      const orderHash = ORDER_HASH(a.hash)
      const trusted = await trustedOf(ctx)
      const answer = await ask<ReadySteps & { error?: unknown; code?: unknown }>(ctx.api, { method: 'POST', path: `/v1/orders/${seg(orderHash)}/cancel-steps`, body: { wallet: maker, ...(a.order !== undefined ? { order: a.order } : {}) } })
      const checked = await checking(() => checkCancelSteps(structural(answer), { wallet: maker, orderHash }, trusted))
      const simulation = answer.simulation ?? null
      return { wallet: maker, transactions: transactionsOf(checked), simulation, next: nextFor(simulation, maker, 'Sign and send the transaction from the maker.') }
    },
  }),
  tool({
    name: 'build_cancel_all_orders',
    title: 'Build an on-chain cancel of every order',
    kind: 'build',
    description: "Build the transaction that voids every order the maker signed on the current book, by moving its epoch. The salt is the maker's own randomness, never Mancer's; the build must be cancelAll with it, or it is refused build-mismatch. Needs no key.",
    shape: { wallet: wallet('The maker'), salt: z.string().regex(/^0x[0-9a-fA-F]{64}$/).describe('32 random bytes of your own, as 0x and 64 hex digits, never zero and never reused.') },
    run: async (ctx, a) => {
      if (/^0x0{64}$/.test(a.salt)) throw badArgument('The salt is never zero.', 'bad-salt')
      const maker = await walletOf(ctx, a.wallet)
      const salt = a.salt.toLowerCase() as Hex
      const trusted = await trustedOf(ctx)
      const answer = await ask<ReadySteps>(ctx.api, { method: 'POST', path: '/v1/orders/cancel-all-steps', body: { wallet: maker, salt } })
      const checked = await checking(() => checkCancelAllSteps(structural(answer), { wallet: maker, salt }, trusted))
      const simulation = answer.simulation ?? null
      return { wallet: maker, transactions: transactionsOf(checked), simulation, next: nextFor(simulation, maker, 'Sign and send the transaction from the maker.') }
    },
  }),
]
