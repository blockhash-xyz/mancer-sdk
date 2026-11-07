import { decodeFunctionData, encodeFunctionData, erc20Abi, getAddress, hashTypedData, parseAbi, type Address, type Hex } from 'viem'
import type { TrustedContracts } from './contracts'
import { MancerCheckError } from './errors'
import { SDK_VERSION } from './version'
import type { BookStepsResponse, DraftOpenStepsResponse, Execution, Quote, ReadyStep, ReadySteps, ReadyStepsField } from './generated/openapi'
import {
  BOOK_DEPLOYMENTS,
  ORDER_EIP712_TYPES_V3,
  bookCallData,
  bookLaunchDeployment,
  decodeRouterCall,
  executionEnvelopeMismatch,
  mancerOrdersV3Abi,
  openBookCall,
  ordersDomainV3,
  readRouterLegs,
  routerCallMismatch,
  transferCall,
  transferTransaction,
  type BookCall,
  type BookDeployment,
  type LegReading,
  type OpenBookParams,
  type RouterCallReading,
  type TransferAsset,
} from './shared'

/**
 * The checks the SDK runs on every set of steps before one is signed. Each holds the steps' calldata to what the caller
 * asked for and to the contracts the SDK trusts (contracts.ts), never to the JSON beside it, and refuses with a
 * `MancerCheckError` naming the first thing that is not: a compromised or defective API could answer a genuine router
 * call that pays someone else, trades another token or carries a lower floor, and the chain would run it faithfully.
 * Where the kit can build the call itself (a send, a cancel, a Book's act, a Book's open), the step must be that call
 * byte for byte. Pure: no fetch and no chain; what the chain says (a Book's vault, an allowance) is read by the client
 * from the caller's own node and handed in.
 */

/** One step read back: what it calls and what that call does. */
export interface StepReading {
  step: number
  kind: string
  to: Address
  value: bigint
  /** One line on what the step does, read from its calldata. */
  does: string
  /** A router call's reading, for a swap step. */
  router?: RouterCallReading
  /** Every leg of a router call, read. */
  legs?: LegReading[]
  /** The least gas the step is sent with, the check's own word and never the API's: a step that may bond a Book in the
   * same transaction (a TraderBookPadV2 `graduate`, or a buy that closes its curve) keeps `BOOK_BONDING_GAS`, since a
   * wallet's estimate finds the least gas the step runs with, which defers the bond. */
  minGas?: bigint
  /** A settlement on a settler that settles in the base pair where chosen: the asset every one of its sales pays. The
   * sender reads the settler's `settleAssetFor(bookId)` on your node right before it sends the step, and sends nothing
   * where it names another (the liquidation would run none of its sales and settle all the same). */
  settlesIn?: BookSettlesIn
}

/** What a settlement's sales pay, and where the settler's word on it is read (`StepReading.settlesIn`). */
export interface BookSettlesIn {
  settler: Address
  abiSet: BookDeployment['abiSet']
  bookId: bigint
  pays: Address
}

declare const checkedBrand: unique symbol

/** Steps the SDK has checked: the only thing its sender sends. Its steps are the SDK's own frozen copies of what was
 * checked, never the API's objects, so nothing can change a step between its check and its signature. */
export interface CheckedSteps {
  readonly [checkedBrand]: true
  readonly chainId: number
  readonly wallet: Address
  readonly steps: readonly ReadyStep[]
  readonly readings: readonly StepReading[]
  readonly simulation: ReadySteps['simulation']
  readonly readAfter: ReadySteps['readAfter']
}

const UNBOUNDED = 1n << 128n

/**
 * The gas a step names where it may bond a Book in the same transaction (a TraderBookPadV2 `graduate`, or a buy that
 * closes its curve), as the steps route names it: the pad's own work, then the bond with 63/64 of what is left at the try
 * (the pad bonds only with 3,000,000 gas left there, and defers the bond otherwise), and a Uniswap v3 bond that creates
 * its pool takes about 6.1 million on its own. The contracts kit's `BOOK_CLAIMS_BONDING_GAS`; a test in Mancer's
 * repository holds the two equal.
 */
export const BOOK_BONDING_GAS = 9_000_000n

const WETH_ABI = parseAbi(['function deposit() payable'])
const same = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.toLowerCase() === b.toLowerCase()

function refuse(check: string, reason: string, step: number | null = null): never {
  throw new MancerCheckError(check, reason, step)
}

/** The ready steps out of a route's `ready` field, or a refusal naming the error the API put there. */
export function readyOf(field: ReadyStepsField | null | undefined, check: string): ReadySteps {
  if (!field) return refuse(check, 'the answer carries no ready-to-sign steps')
  if ('error' in field) return refuse(check, `the API built no steps: ${field.code}: ${field.error}`)
  return field
}

/** What every set of steps must be, whatever its act: on chain 4663, for the wallet that sends it, simulated whole. */
function common(check: string, ready: ReadySteps, wallet: Address, requireOk: boolean): void {
  if (ready.chainId !== 4663) refuse(check, 'the steps are for another chain')
  if (!same(ready.wallet, wallet)) refuse(check, 'the steps are for another wallet')
  if (!Array.isArray(ready.steps) || ready.steps.length === 0) refuse(check, 'there are no steps')
  if (requireOk && !ready.simulation?.ok) {
    const r = ready.simulation?.revert
    refuse('simulation', `the steps would fail${r ? ` at step ${r.step ?? '?'}: ${r.error ?? r.message}` : ''}`, r?.step ?? null)
  }
  ready.steps.forEach((s, i) => {
    if (!/^0x[0-9a-fA-F]{40}$/.test(s.to)) refuse(check, 'a step names no address', i)
    if (!/^0x(?:[0-9a-fA-F]{2})*$/.test(s.data)) refuse(check, "a step's calldata is not hex", i)
    if (!/^\d+$/.test(s.value)) refuse(check, "a step's value is not wei", i)
    if (s.gas !== null && !/^\d+$/.test(s.gas)) refuse(check, "a step's gas is not a number", i)
  })
}

function checked<X extends object = object>(ready: ReadySteps, readings: StepReading[], extra?: X): CheckedSteps & X {
  const steps = Object.freeze(ready.steps.map((s) => Object.freeze({ kind: String(s.kind), to: String(s.to), data: String(s.data), value: String(s.value), gas: s.gas === null ? null : String(s.gas), why: String(s.why ?? '') }))) as unknown as readonly ReadyStep[]
  return Object.freeze({
    chainId: ready.chainId,
    wallet: getAddress(ready.wallet),
    steps,
    readings: Object.freeze([...readings]),
    simulation: ready.simulation,
    readAfter: ready.readAfter,
    ...(extra ?? {}),
  }) as unknown as CheckedSteps & X
}

/** An ERC-20 `approve(spender, amount)` read back, or null where the calldata is none. */
export function readApproval(data: Hex): { spender: Address; amount: bigint } | null {
  try {
    const d = decodeFunctionData({ abi: erc20Abi, data })
    if (d.functionName !== 'approve') return null
    return { spender: d.args[0], amount: d.args[1] }
  } catch {
    return null
  }
}

// --------------------------------------------------------------------------------------------------------- a swap

export interface SwapCheck {
  wallet: Address
  /** Who the output is paid to: the wallet unless the swap names another. */
  recipient: Address
  /** The tokens as the route names them: WETH for native ether. */
  tokenIn: Address
  tokenOut: Address
  amountIn: bigint
  nativeIn: boolean
  nativeOut: boolean
  /** The least the calldata's floor may be: the caller's own (`minOut`, or a reference the caller supplied). */
  minOut: bigint
  /** The most the router's fee may be, in basis points. */
  maxFeeBps: number
  /** The integrator fee the caller asked for: its recipient and its rate. Without one, a fee leg is refused. */
  integratorFee?: { recipient: Address; bps: number } | null
  /** The most an account-bound launch route's round-trip allowance (to the pad's adapter) may be, in its own token's
   * units: a purchase's is the bought launch token, a sale's its pad's quote token. Without it, a launch route that
   * names one is refused. */
  roundTripCap?: bigint
  /** How long the call may stay valid, in seconds. Default one hour. */
  maxDeadlineSec?: number
  nowSec?: number
}

/** A leg reader's refusal, said for this SDK: a target or selector its venue table does not name may be one the router
 * admitted after this version was released, and an update is the way through. */
export function legRefusal(mismatch: string): string {
  if (!/the kit's venue table/.test(mismatch)) return mismatch
  return `${mismatch}. This SDK's venue table may be behind the router's allowlist: update @blockhash/mancer-sdk (this is ${SDK_VERSION}), and \`venueTableDrift()\` lists what the router admits and the table does not`
}

/** A router call's every field and every leg, or the refusal of the first that is not what was asked. The legs run in
 * the router whoever the step is sent to (the launch coordinator hands the same plan to `router.execute`), so `runner`
 * is the router, and `to` is where the step goes. */
function swapCall(i: number, data: Hex, value: string, e: SwapCheck, runner: Address, to: Address = runner): StepReading & { router: RouterCallReading } {
  const why = routerCallMismatch(data, {
    tokenIn: e.tokenIn,
    tokenOut: e.tokenOut,
    amountIn: e.amountIn,
    recipient: e.recipient,
    minOut: e.minOut,
    nativeIn: e.nativeIn,
    nativeOut: e.nativeOut,
    maxFeeBps: e.maxFeeBps,
    value: BigInt(value),
    ...(e.maxDeadlineSec !== undefined ? { maxDeadlineSec: e.maxDeadlineSec } : {}),
    ...(e.nowSec !== undefined ? { nowSec: e.nowSec } : {}),
  })
  if (why) refuse('swap', why, i)
  const legs = readRouterLegs(data, { runner, caller: e.recipient, integratorFee: e.integratorFee ?? null })
  if (legs.mismatch) refuse('swap', legRefusal(legs.mismatch), i)
  const router = decodeRouterCall(data)!
  return { step: i, kind: 'swap', to: getAddress(to), value: BigInt(value), does: describeSwap(router, legs.legs), router, legs: legs.legs }
}

/**
 * The most a launch route's round-trip allowance may be, in its own token's units, for `SwapCheck.roundTripCap`. A
 * purchase's round trip is the bought launch token, the swap's output, held to `outputCap` (twice what the caller's own
 * reference says the swap pays, or twice the caller's floor). A sale, marked by its operator requirement, is paid in
 * its pad's quote token: held to `outputCap` where that is the swap's output, and otherwise to twice what the pinned
 * lens says the pad pays this sale (`saleQuote`, read on the caller's own node). A pad or lens this SDK does not pin, a
 * launch id that is no number, or a lens that does not answer leaves a cap of zero, and the check then refuses any round
 * trip. Hey Research Lab's second note (2026-11-03): the cap had been in the output's units whatever token it held.
 */
export async function launchRoundTripCap(
  execution: Execution,
  stack: NonNullable<TrustedContracts['launch']>,
  o: { tokenOut: Address; outputCap: bigint; saleQuote: (lens: Address, pad: Address, launchId: bigint) => Promise<bigint> },
): Promise<bigint> {
  const requirements = Array.isArray(execution.requirements) ? execution.requirements : []
  const operator = requirements.find((r) => !!r && typeof r === 'object' && r.kind === 'protocol-operator')
  if (!operator) return o.outputCap
  const pad = stack.pads.find((p) => same(p.pad, String(operator.target ?? '')))
  if (!pad) return 0n
  if (same(pad.quoteToken, o.tokenOut)) return o.outputCap
  let launchId: bigint
  try {
    launchId = BigInt(String(operator.launchId))
  } catch {
    return 0n
  }
  if (!stack.lens || launchId <= 0n) return 0n
  try {
    const paid = await o.saleQuote(stack.lens, pad.pad, launchId)
    return paid > 0n ? 2n * paid : 0n
  } catch {
    return 0n
  }
}

/**
 * A swap's steps (`GET /v1/quote` with `steps=1`): an exact approval of the input to the router's allowance target where
 * one is needed, then the router's `execute(Plan)` read field by field (`routerCallMismatch`: the tokens, the amount,
 * the recipient, the floor, the deadline, the fee and the ether it carries) and leg by leg (`readRouterLegs`: each leg a
 * venue or adapter of Mancer's own routing, paying the router or the caller, and an integrator fee only where asked). The
 * ordered envelope every build for a taker carries (`entrypoint: 'router'`) is held to that same plain swap: its
 * transactions the steps, the approval and the swap, for the wallet and the recipient named, and nothing else in it
 * (`routerEnvelopeCheck`). A launch route's steps are its envelope's transactions in order, held to the site's own envelope check
 * (`executionEnvelopeMismatch`) and the pinned launch stack, each allowance exact, its last the same router call
 * through the launch coordinator.
 */
export function checkSwapSteps(quote: Quote, e: SwapCheck, trusted: TrustedContracts, options: { requireSimulation?: boolean } = {}): CheckedSteps {
  const ready = readyOf(quote.ready, 'swap')
  common('swap', ready, e.wallet, options.requireSimulation ?? true)
  const readings: StepReading[] = []
  const steps = ready.steps
  const execution = quote.execution as Execution | undefined
  // the ordered envelope the API puts on every build that names a taker (`entrypoint: 'router'`): the input's exact
  // approval and the router's call, nothing else. Its steps are a plain swap's, and are checked as one below, with the
  // recipient the caller named
  if (execution && Array.isArray(execution.transactions) && execution.transactions.length && execution.entrypoint === 'router') {
    routerEnvelopeCheck(execution, steps, e, trusted)
  } else if (execution && Array.isArray(execution.transactions) && execution.transactions.length) {
    // the answer is JSON: an entrypoint the types name is no promise, and any other name is refused before it is read
    if (execution.entrypoint !== 'launch-coordinator') refuse('swap', "the answer's envelope names an entrypoint this SDK does not read")
    const launch = trusted.launch
    if (!launch) refuse('swap', 'no launch stack is pinned on this chain')
    const wrong = executionEnvelopeMismatch(execution as never, {
      account: e.wallet,
      chainId: trusted.chainId,
      router: trusted.router,
      tokenIn: e.tokenIn,
      tokenOut: e.tokenOut,
      routerAllowanceTarget: trusted.allowanceTarget,
      ...(launch ? { coordinator: launch.coordinator, coordinatorAllowanceTarget: launch.allowanceTarget, safeLaunchPads: launch.pads } : {}),
    })
    if (wrong) refuse('swap', `the launch envelope does not pass the site's check: ${wrong}`)
    if (!same(e.recipient, e.wallet)) refuse('swap', 'an execution envelope pays the wallet that sends it, and this swap names another recipient')
    // every allowance exact and to its pinned spender: the input's to what the swap spends, for the coordinator's allowance
    // target alone; a launch's round trip under the cap the caller named, for a pinned pad's adapter alone
    for (const r of execution.requirements) {
      if (r.kind !== 'erc20-allowance') continue
      const amount = BigInt(String(r.amount ?? '0'))
      if (same(r.token, e.tokenIn)) {
        if (!same(r.spender, launch!.allowanceTarget)) refuse('swap', "the envelope approves the input to a spender other than the launch coordinator's allowance target")
        if (amount !== e.amountIn) refuse('swap', 'the envelope approves the input for another amount than the one you spend')
      } else {
        if (!launch!.pads.some((p) => same(p.adapter, r.spender))) refuse('swap', "the envelope's round-trip allowance names a spender that is no pinned pad's adapter")
        if (amount > (e.roundTripCap ?? 0n)) refuse('swap', "the envelope's round-trip allowance is over the cap the swap allows")
      }
    }
    if (steps.length !== execution.transactions.length) refuse('swap', 'the steps are not the envelope transactions')
    execution.transactions.forEach((t, i) => {
      const s = steps[i]!
      if (!same(s.to, t.to) || s.data.toLowerCase() !== t.data.toLowerCase() || s.value !== t.value) refuse('swap', 'a step is not its envelope transaction', i)
    })
    steps.forEach((s, i) => {
      const last = i === steps.length - 1
      if (!last) {
        if (s.value !== '0') refuse('swap', 'a setup step carries ether', i)
        readings.push({ step: i, kind: s.kind, to: getAddress(s.to), value: 0n, does: s.kind === 'authorization' ? "lets the launch's adapter act for the wallet on its pad" : `approves ${readApproval(s.data as Hex)?.spender ?? 'a spender'} for an amount the envelope names` })
        return
      }
      readings.push({ ...swapCall(i, s.data as Hex, s.value, e, trusted.router, getAddress(s.to)), kind: s.kind })
    })
    return checked(ready, readings)
  }
  if (steps.length > 2) refuse('swap', 'a plain swap is at most an approval and the swap')
  steps.forEach((s, i) => {
    const last = i === steps.length - 1
    if (!last) {
      if (s.kind !== 'approval') refuse('swap', `an unexpected ${s.kind} step comes before the swap`, i)
      if (e.nativeIn) refuse('swap', 'a swap of ether needs no approval', i)
      if (!same(s.to, e.tokenIn)) refuse('swap', 'the approval is not of the token you spend', i)
      if (s.value !== '0') refuse('swap', 'the approval carries ether', i)
      const a = readApproval(s.data as Hex)
      if (!a) refuse('swap', 'the approval step is no approve call', i)
      if (!same(a.spender, trusted.allowanceTarget)) refuse('swap', "the approval's spender is not the router's allowance target", i)
      if (a.amount !== e.amountIn) refuse('swap', 'the approval is not for exactly the amount you spend', i)
      readings.push({ step: i, kind: s.kind, to: getAddress(s.to), value: 0n, does: `approves ${a.spender} for exactly ${a.amount}` })
      return
    }
    if (s.kind !== 'swap') refuse('swap', 'the last step is not the swap', i)
    if (!same(s.to, trusted.router)) refuse('swap', 'the swap is not sent to the router this SDK trusts', i)
    readings.push(swapCall(i, s.data as Hex, s.value, e, trusted.router))
  })
  return checked(ready, readings)
}

/**
 * A router build's ordered envelope (`entrypoint: 'router'`), held to what a plain swap is before its steps are checked as
 * one: for the wallet that sends it and paying the recipient the caller named; its requirements the input's exact
 * allowance to the router's allowance target alone (none for ether in), never a protocol's authorization; its transactions
 * an approval and the swap, on this chain, each the step of its place byte for byte. The steps are what the wallet signs:
 * the plain swap's check then reads every field of the approval and the router's call.
 */
function routerEnvelopeCheck(execution: Execution, steps: readonly ReadyStep[], e: SwapCheck, trusted: TrustedContracts): void {
  if (execution.version !== 1) refuse('swap', "the router's envelope is of a version this SDK does not read")
  if (!same(execution.taker, e.wallet)) refuse('swap', "the router's envelope is for another wallet")
  if (!same(execution.recipient, e.recipient)) refuse('swap', "the router's envelope pays another recipient than the one you named")
  if (!Array.isArray(execution.requirements)) refuse('swap', "the router's envelope names no requirements")
  for (const r of execution.requirements) {
    if (r.kind !== 'erc20-allowance') refuse('swap', `the router's envelope asks for a ${String(r.kind)}, which a plain swap never carries`)
    if (e.nativeIn) refuse('swap', 'a swap of ether needs no allowance, and the envelope names one')
    if (!same(r.token, e.tokenIn) || !same(r.spender, trusted.allowanceTarget)) refuse('swap', "the envelope's allowance is not of the token you spend to the router's allowance target")
    if (String(r.amount) !== e.amountIn.toString()) refuse('swap', 'the envelope approves the input for another amount than the one you spend')
  }
  if (execution.requirements.length > 1) refuse('swap', "the router's envelope names more than the input's one allowance")
  if (steps.length !== execution.transactions.length) refuse('swap', 'the steps are not the envelope transactions')
  execution.transactions.forEach((t, i) => {
    const last = i === execution.transactions.length - 1
    if (t.kind !== (last ? 'swap' : 'approval')) refuse('swap', `the router's envelope carries a step of kind ${String(t.kind)} where a plain swap has ${last ? 'the swap' : 'its approval'}`, i)
    if (t.chainId !== trusted.chainId) refuse('swap', "a transaction of the router's envelope is for another chain", i)
    const s = steps[i]!
    if (s.kind !== t.kind || !same(s.to, t.to) || s.data.toLowerCase() !== t.data.toLowerCase() || s.value !== t.value) refuse('swap', 'a step is not its envelope transaction', i)
  })
}

function describeSwap(r: RouterCallReading, legs: LegReading[]): string {
  const tok = (t: Address | null) => t ?? 'ETH'
  const to = r.recipient === 'sender' ? 'the sender' : r.recipient
  const venues = legs.map((l) => (l.inner ? `${l.venue}>${l.inner.venue}` : l.venue)).join(', ')
  return `spends ${r.spends.amount} of ${tok(r.spends.token)} for at least ${r.delivers.atLeast} of ${tok(r.delivers.token)} to ${to}, fee ${r.fee.bps} bps on the ${r.fee.side}, by ${r.deadline}, through ${venues}`
}

// ------------------------------------------------------------------------------------------------- an order's setup

export interface OrderSetupCheck {
  wallet: Address
  tokenIn: Address
  amountPerFill: bigint
  totalFills: number
  nativeIn: boolean
  /** The wallet's allowance of `tokenIn` to the orders contract now, read on the caller's own node (0 where unread):
   * what the maker's other orders were approved to pull. */
  allowance?: bigint
  /** What the maker's other open orders on `tokenIn` still pull, as the caller counts them itself (0 where it counts
   * none). */
  openPulls?: bigint
  /** The wallet's WETH balance now, read on the caller's own node like the allowance (0 where unread): what a wrap need
   * not wrap again. */
  held?: bigint
}

/**
 * An order's setup steps (`GET /v1/orders/setup` with `steps=1`): a wrap of ether into WETH, and the orders contract's
 * approval, each bounded by what the caller reads itself, never the API's count of other open orders. What the maker's
 * other orders pull (`others`) is the greater of the allowance the caller's node reads (what they were approved for) and
 * the open pulls the caller counts, 0 where it reads neither.
 *
 * - The approval covers this order's whole pull, and is at most `others` plus that pull.
 * - The wrap is at most what the book will pull, this order's and the other orders', less the WETH the wallet holds
 *   (`others` + pull - `held`, never under zero), as the API's own builder wraps it. A caller with no credential, whose
 *   setup counts no other order, names no `others` (no allowance and no count): its wrap is at most the pull less what
 *   the wallet holds.
 *
 * A launch pair's setup is not checked here, and is refused.
 */
export function checkOrderSetupSteps(answer: { ready?: ReadyStepsField; need?: Record<string, unknown> }, e: OrderSetupCheck, trusted: TrustedContracts): CheckedSteps | null {
  if (!answer.ready) return refuse('order', 'the setup answer carries no steps')
  if ('error' in answer.ready && answer.ready.code === 'nothing-to-do') return null
  const ready = readyOf(answer.ready, 'order')
  common('order', ready, e.wallet, true)
  for (const [name, v] of [['allowance', e.allowance], ['openPulls', e.openPulls], ['held', e.held]] as const) {
    if (v !== undefined && (typeof v !== 'bigint' || v < 0n)) refuse('order', `${name} is raw units, zero or more`)
  }
  const pull = e.amountPerFill * BigInt(e.totalFills)
  const allowance = e.allowance ?? 0n
  const counted = e.openPulls ?? 0n
  const others = allowance > counted ? allowance : counted
  const most = others + pull
  // the API's own builder (packages/api/src/steps/orders.ts `orderSetupSteps`) wraps what the book will pull (this order's
  // and, where the asker may read them, the maker's other open orders') less the WETH the wallet holds: the same bound
  const short = others + pull - (e.held ?? 0n)
  const wrapMost = short <= 0n ? 0n : short
  const readings: StepReading[] = []
  ready.steps.forEach((s, i) => {
    if (s.kind === 'wrap') {
      if (!e.nativeIn) refuse('order', 'a wrap for an order that does not sell ether', i)
      if (!same(s.to, trusted.weth)) refuse('order', 'the wrap is not sent to WETH', i)
      if (s.data.toLowerCase() !== encodeFunctionData({ abi: WETH_ABI, functionName: 'deposit' })) refuse('order', 'the wrap is no deposit()', i)
      const v = BigInt(s.value)
      if (v === 0n) refuse('order', 'the wrap wraps nothing', i)
      if (v > wrapMost) refuse('order', "the wrap is for more than the order pulls, with what the maker's other orders pull, less the WETH the wallet holds", i)
      readings.push({ step: i, kind: s.kind, to: getAddress(s.to), value: v, does: `wraps ${v} wei into WETH` })
      return
    }
    if (s.kind === 'approval') {
      if (!same(s.to, e.tokenIn)) refuse('order', 'the approval is not of the token the order spends', i)
      if (s.value !== '0') refuse('order', 'the approval carries ether', i)
      const a = readApproval(s.data as Hex)
      if (!a) refuse('order', 'the approval step is no approve call', i)
      if (!same(a.spender, trusted.orders)) refuse('order', "the approval's spender is not the orders contract", i)
      if (a.amount < pull) refuse('order', "the approval does not cover the order's pull", i)
      if (a.amount >= UNBOUNDED) refuse('order', 'the approval is unbounded', i)
      if (a.amount > most) {
        refuse('order', e.openPulls === undefined
          ? "the approval is for more than the allowance your node reads plus this order's pull"
          : "the approval is for more than this order's pull plus what the maker's other open orders pull, as counted", i)
      }
      readings.push({ step: i, kind: s.kind, to: getAddress(s.to), value: 0n, does: `approves the orders contract for ${a.amount}` })
      return
    }
    refuse('order', `a ${s.kind} step (a launch pair's setup) is not checked by this SDK`, i)
  })
  return checked(ready, readings)
}

// ------------------------------------------------------------------------------------------------------- a transfer

export type TransferAssetInput = { kind: 'native' } | { kind: 'erc20'; token: Address } | { kind: 'nft'; collection: Address; tokenId: bigint }

export interface TransferCheck {
  wallet: Address
  /** The recipient as asked: an address, or `@username`, which the API resolves. */
  to: string
  asset: TransferAssetInput
  /** Raw units; for an NFT the count of an ERC-1155 piece (1 by default). */
  amount?: bigint
}

/** A send's one step (`POST /v1/transfers/steps`), rebuilt from the kit's own transfer call and held to it byte for byte.
 * A `@username` is held to the address the API resolved it to, which the answer names (`recipient`). */
export function checkTransferSteps(answer: ReadySteps, e: TransferCheck): CheckedSteps & { recipient: Address } {
  common('transfer', answer, e.wallet, true)
  if (answer.steps.length !== 1) refuse('transfer', 'a send is one step')
  const s = answer.steps[0]!
  let recipient: Address
  if (/^0x[0-9a-fA-F]{40}$/.test(e.to)) recipient = getAddress(e.to)
  else {
    const named = (answer.simulation?.outcome as { recipient?: unknown } | undefined)?.recipient
    if (typeof named !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(named)) refuse('transfer', 'the API names no address for the username', 0)
    recipient = getAddress(named)
  }
  const candidates: TransferAsset[] = e.asset.kind === 'native'
    ? [{ kind: 'native' }]
    : e.asset.kind === 'erc20'
      ? [{ kind: 'erc20', token: e.asset.token }]
      : [{ kind: 'erc721', collection: e.asset.collection, tokenId: e.asset.tokenId }, { kind: 'erc1155', collection: e.asset.collection, tokenId: e.asset.tokenId }]
  const matches = candidates.some((asset) => {
    const amount = asset.kind === 'erc721' ? 1n : asset.kind === 'erc1155' ? (e.amount ?? 1n) : (e.amount ?? -1n)
    if (amount < 0n) return false
    if (asset.kind === 'erc721' && e.amount !== undefined && e.amount !== 1n) return false
    const tx = transferTransaction(transferCall(asset, e.wallet, recipient, amount))
    return same(s.to, tx.to) && s.data.toLowerCase() === (tx.data ?? '0x').toLowerCase() && s.value === tx.value.toString()
  })
  if (!matches) refuse('transfer', 'the send is not the transfer of what you asked to whom you named', 0)
  const reading: StepReading = { step: 0, kind: s.kind, to: getAddress(s.to), value: BigInt(s.value), does: `sends to ${recipient}` }
  return checked(answer, [reading], { recipient })
}

// -------------------------------------------------------------------------------------------- an order's on-chain exits

/** An order's on-chain cancel (`POST /v1/orders/{hash}/cancel-steps`): `cancel(order)` on the trusted orders contract,
 * the order the wallet's own, and its EIP-712 hash the one asked for. */
export function checkCancelSteps(answer: ReadySteps, e: { wallet: Address; orderHash: Hex }, trusted: TrustedContracts): CheckedSteps {
  common('cancel', answer, e.wallet, true)
  if (answer.steps.length !== 1) refuse('cancel', 'a cancel is one step')
  const s = answer.steps[0]!
  if (!same(s.to, trusted.orders)) refuse('cancel', 'the cancel is not sent to the orders contract this SDK trusts', 0)
  if (s.value !== '0') refuse('cancel', 'the cancel carries ether', 0)
  let order: Record<string, unknown>
  try {
    const d = decodeFunctionData({ abi: mancerOrdersV3Abi, data: s.data as Hex })
    if (d.functionName !== 'cancel') refuse('cancel', 'the step is no cancel(order)', 0)
    order = d.args[0] as unknown as Record<string, unknown>
  } catch (err) {
    if (err instanceof MancerCheckError) throw err
    return refuse('cancel', 'the step is no cancel(order)', 0)
  }
  if (!same(order.maker as string, e.wallet)) refuse('cancel', "the order is not the wallet's own", 0)
  const hash = hashTypedData({ domain: ordersDomainV3(trusted.chainId, trusted.orders), types: ORDER_EIP712_TYPES_V3, primaryType: 'Order', message: order as never })
  if (!same(hash, e.orderHash)) refuse('cancel', 'the order cancelled is not the one asked for', 0)
  return checked(answer, [{ step: 0, kind: s.kind, to: getAddress(s.to), value: 0n, does: `cancels order ${hash}` }])
}

/** Voiding every order the wallet signed (`POST /v1/orders/cancel-all-steps`): `cancelAll(salt)` on the trusted orders
 * contract, with the salt the caller made. */
export function checkCancelAllSteps(answer: ReadySteps, e: { wallet: Address; salt: Hex }, trusted: TrustedContracts): CheckedSteps {
  common('cancel', answer, e.wallet, true)
  if (answer.steps.length !== 1) refuse('cancel', 'a cancel of all orders is one step')
  const s = answer.steps[0]!
  if (!same(s.to, trusted.orders)) refuse('cancel', 'the cancel is not sent to the orders contract this SDK trusts', 0)
  if (s.value !== '0') refuse('cancel', 'the cancel carries ether', 0)
  const want = encodeFunctionData({ abi: mancerOrdersV3Abi, functionName: 'cancelAll', args: [e.salt] })
  if (s.data.toLowerCase() !== want.toLowerCase()) refuse('cancel', 'the step is not cancelAll with your salt', 0)
  return checked(answer, [{ step: 0, kind: s.kind, to: getAddress(s.to), value: 0n, does: "moves the wallet's epoch, voiding every order it signed" }])
}

// ------------------------------------------------------------------------------------------------------------- Books

/** The Books deployment a factory is, among those trusted (the kit's by default), or null. */
export function bookDeploymentOf(factory: string, deployments: readonly BookDeployment[] = BOOK_DEPLOYMENTS): BookDeployment | null {
  return deployments.find((d) => same(d.factory.address, factory)) ?? null
}

/** A Book's act as its own calls, rebuilt from the kit's builders: what its steps must be, byte for byte. */
export interface BookActCalls {
  /** An exact approval the act needs where the allowance falls short: the token, its spender, the amount. */
  approval?: { token: Address; spender: Address; amount: bigint } | null
  calls: BookCall[]
  /** The act's last call may bond the Book in the same transaction (a TraderBookPadV2 `graduate`, or a buy that closes
   * its curve): its step is read with `BOOK_BONDING_GAS` as its least gas (`StepReading.minGas`). */
  mayBond?: boolean
  /** The act's last call is a settlement whose sales pay this asset, on a settler that settles in the base pair where
   * chosen: its step is read with it (`StepReading.settlesIn`). */
  settlesIn?: BookSettlesIn
}

export interface BookStepsCheck {
  wallet: Address
  token: Address
  action: string
  /** The Book's id and vault, read on the caller's own node from the Book's factory (`bookIdOfToken`, `bookOf`). */
  bookId?: bigint
  vault?: Address
  /** The act's own calls, rebuilt from the kit's builders out of the arguments the caller asked for and what its own
   * node reads (`Mancer.bookSteps` builds them). Without them nothing is taken. */
  expected?: BookActCalls
  /** The Books deployments trusted: the kit's by default. */
  deployments?: readonly BookDeployment[]
}

function sameCall(s: ReadyStep, c: { to: Address; data: Hex; value: bigint }): boolean {
  return same(s.to, c.to) && s.data.toLowerCase() === c.data.toLowerCase() && s.value === c.value.toString()
}

/** Steps that are exactly a set of the kit's calls, an exact approval first where one is named. */
function exactCalls(check: string, ready: ReadySteps, expected: BookActCalls): StepReading[] {
  const want = expected.calls.map(bookCallData)
  const steps = ready.steps
  const readings: StepReading[] = []
  let i = 0
  if (steps.length === want.length + 1) {
    const a = expected.approval
    if (!a) refuse(check, `the act is ${want.length} call${want.length === 1 ? '' : 's'} and needs no approval, and the answer is ${steps.length} steps`, 0)
    const s = steps[0]!
    const got = readApproval(s.data as Hex)
    if (!same(s.to, a.token) || s.value !== '0' || !got || !same(got.spender, a.spender) || got.amount !== a.amount) refuse(check, 'the approval is not of exactly what the act pulls, to its own spender', 0)
    readings.push({ step: 0, kind: s.kind, to: getAddress(s.to), value: 0n, does: `approves ${a.spender} for exactly ${a.amount}` })
    i = 1
  } else if (steps.length !== want.length) {
    refuse(check, `the act is ${want.length} call${want.length === 1 ? '' : 's'}, and the answer is ${steps.length} steps`)
  }
  want.forEach((c, j) => {
    const s = steps[i + j]!
    if (!sameCall(s, c)) refuse(check, `the step is not the act's own call (${expected.calls[j]!.functionName}) to its own contract, with its own arguments and ether`, i + j)
    const bonds = expected.mayBond === true && j === want.length - 1
    const settles = expected.settlesIn && j === want.length - 1 ? expected.settlesIn : null
    readings.push({
      step: i + j, kind: s.kind, to: getAddress(s.to), value: c.value,
      does: `${expected.calls[j]!.functionName} on ${getAddress(c.to)}${bonds ? ', and may bond the Book in the same transaction' : ''}${settles ? `, its sales paying ${getAddress(settles.pays)}` : ''}`,
      ...(bonds ? { minGas: BOOK_BONDING_GAS } : {}),
      ...(settles ? { settlesIn: Object.freeze({ ...settles }) } : {}),
    })
  })
  return readings
}

/**
 * A Book's act (`POST /v1/books/{token}/steps`): the act named, for the Book named, on a factory the kit pins, with the
 * Book's id and vault the caller's own node reads, and every step exactly the act's own call as the kit builds it from
 * the arguments asked for (`expected`), an exact approval of what the act pulls before it where one is needed. Nothing
 * else is taken: no other call, no other approval, no other ether.
 */
export function checkBookSteps(answer: BookStepsResponse, e: BookStepsCheck): CheckedSteps & { deployment: BookDeployment } {
  if (answer.action !== e.action) refuse('book', 'the steps are for another act')
  if (!same(answer.book?.token, e.token)) refuse('book', 'the steps are for another Book')
  const deployment = bookDeploymentOf(answer.book?.factory ?? '', e.deployments)
  if (!deployment) refuse('book', 'the Book is on a factory this SDK does not pin')
  if (e.vault === undefined || e.bookId === undefined) refuse('book', "the Book's id and vault are read on your own node (Mancer.bookSteps): the answer's word is not taken")
  if (!same(answer.book.vault, e.vault) || String(answer.book.bookId) !== e.bookId.toString()) refuse('book', 'the answer names another vault or Book id than the Book your node reads')
  if (!e.expected) refuse('book', "the act's calls are rebuilt from your own arguments and node (Mancer.bookSteps): the answer's calldata is not taken")
  common('book', answer, e.wallet, true)
  return checked(answer, exactCalls('book', answer, e.expected), { deployment })
}

/**
 * A Book's act carried by another route's ready-to-sign steps (a raise trade's `raise-quote`, a settlement's
 * `liquidation-quotes`): on chain 4663, for the wallet that sends it, simulated whole, and every step exactly the kit's
 * call rebuilt by the caller (`expected`), an exact approval of what the act pulls before it where one is named.
 */
export function checkExactBookCalls(check: string, ready: ReadySteps, wallet: Address, expected: BookActCalls): CheckedSteps {
  common(check, ready, wallet, true)
  return checked(ready, exactCalls(check, ready, expected))
}

export interface DraftOpenCheck {
  wallet: Address
  draftId: string
  /** The open the bot asked for: the draft's own name and ticker, and the terms it named, as the kit takes them. */
  open?: OpenBookParams
  /** The factory the bot saved the draft on: held exactly where given. */
  factory?: Address
  /** The Books deployments trusted: the kit's by default. */
  deployments?: readonly BookDeployment[]
}

/** A saved Book's open (`POST /v1/books/drafts/{id}/steps`): one step, exactly `openBook` on the factory new Books open
 * on (the kit's launch deployment, `bookLaunchDeployment`, among those trusted), with the name, ticker, traders and terms
 * the bot asked for. */
export function checkDraftOpenSteps(answer: DraftOpenStepsResponse, e: DraftOpenCheck): CheckedSteps & { deployment: BookDeployment } {
  if (answer.draft?.id !== e.draftId) refuse('book', 'the steps are for another draft')
  const deployment = bookDeploymentOf(answer.draft.factory, e.deployments)
  if (!deployment) refuse('book', "the draft's factory is not one this SDK pins")
  if (e.factory && !same(answer.draft.factory, e.factory)) refuse('book', 'the open is on another factory than the one you saved the draft on')
  const launch = bookLaunchDeployment(e.deployments ?? BOOK_DEPLOYMENTS)
  if (!deployment.opensNewBooks || !launch || !same(launch.factory.address, deployment.factory.address)) refuse('book', 'the factory opens no new Books')
  if (!e.open) refuse('book', "the open is rebuilt from the draft you made and the terms you named: the answer's calldata is not taken")
  if (answer.draft.name !== undefined && answer.draft.name !== e.open.name) refuse('book', "the answer names another name than the draft's")
  if (answer.draft.symbol !== undefined && answer.draft.symbol !== e.open.symbol) refuse('book', "the answer names another ticker than the draft's")
  common('book', answer, e.wallet, true)
  return checked(answer, exactCalls('book', answer, { calls: [openBookCall(deployment, e.open)] }), { deployment })
}
