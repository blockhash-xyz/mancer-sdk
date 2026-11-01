import { BaseError, getAddress, type Address, type Hex } from 'viem'
import { MancerCheckError, contractsMismatch, pinnedContracts, type CheckedSteps, type StepReading, type TrustedContracts } from '@blockhash/mancer-sdk'
import type { ToolContext } from './tool'
import { CHAIN_ID, ask, ToolRefusal, type UnsignedTx } from './values'

/**
 * Every build is held to the SDK's own checks before it is answered: the ones `@blockhash/mancer-sdk`'s client runs
 * before a bot's wallet signs (`checkSwapSteps`, `checkTransferSteps`, `checkOrderSetupSteps`, `checkCancelSteps`,
 * `checkCancelAllSteps`, `checkBookSteps`, `checkExactBookCalls`, `checkDraftOpenSteps`), against the contracts the kit
 * pins (`pinnedContracts`), never against the contracts an answer names. A swap is sent to the pinned MancerRouter, its
 * approval is of the token it spends to the pinned allowance target for exactly what it spends, every leg runs through a
 * venue of the kit's table, its floor is the quote less the slippage the caller asked, and nothing comes before it that
 * the check does not read. Where the kit can build the call itself (a send, a cancel, a Book's act, a raise trade, a
 * settlement, a Book's open), each step must be that call byte for byte, from the arguments asked and what the chain
 * reads. A build that fails any check is refused `build-mismatch`, naming the check and the step, and nothing of it is
 * answered to sign.
 *
 * What the chain says (a Book's id and vault, its base pair, a vault's pending trade, a balance, a token's decimals, the
 * pool a trustQuote floor is held beside) is read on this server's own node where `MANCER_MCP_RPC_URL` names one, so a
 * local copy takes no API's word for the chain, and through the API's own chain door (`POST /rpc`) otherwise, as Mancer's
 * hosted copy reads it. The code at each pinned address is not read here: `get_contracts` names each one's code hash for
 * an agent to read on its own node, and the SDK reads them there itself.
 */

/** The kit's own contracts for Robinhood Chain: what every build is held to. */
export function pinned(): TrustedContracts {
  const p = pinnedContracts(CHAIN_ID)
  if (!p) throw new Error('the contracts kit pins no contracts for chain 4663')
  return p
}

/** A check's refusal: the SDK's own reason (never another party's text) and which check and step it is. */
export function buildMismatch(check: string, reason: string, step: number | null = null): ToolRefusal {
  return new ToolRefusal({
    error: `The build does not read back as asked (${check}${step === null ? '' : `, step ${step}`}): ${reason.slice(0, 400)}. Nothing was answered to sign.`,
    code: 'build-mismatch',
    retryable: false,
    detail: { check, step },
    hint: "Build again. If it is refused again, the API's build and this server's checks disagree: sign nothing for it.",
  })
}

/** The refusal a thrown error stands for: a check's as `build-mismatch`, a refusal of the API's as it came, and a read of
 * the chain that did not answer as `chain-unavailable`. Anything else is the tool's own fault, and goes on as it is. */
export function refusalOfError(e: unknown): unknown {
  if (e instanceof MancerCheckError) return buildMismatch(e.check, e.reason, e.step)
  if (e instanceof ToolRefusal) return e
  // a read through the chain door wraps the door's own refusal in viem's error classes
  let cause: unknown = e
  for (let i = 0; i < 8 && cause; i++) {
    if (cause instanceof ToolRefusal) return cause
    cause = (cause as { cause?: unknown }).cause
  }
  if (e instanceof BaseError) return new ToolRefusal({ error: 'The chain did not answer a read the check needs.', code: 'chain-unavailable', retryable: true })
  return e
}

/** Runs a check (or a read it needs), its failure as the refusal it stands for. */
export async function checking<T>(run: () => T | Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (e) {
    throw refusalOfError(e)
  }
}

// ------------------------------------------------------------------------------------------------ the contracts

/** The answers of `GET /v1/contracts` held to the kit, by API: a check that passed is kept ten minutes. Only a pass is kept,
 * and only once it has passed: a call in flight is no one else's, so a session never waits on another session's call or
 * is handed its refusal (the API's words, its hint, a sign-in of that session's that had ended). */
const trustedMemo = new Map<string, number>()
const TRUSTED_TTL_MS = 10 * 60_000

/** Test-only: forget every contracts answer held. */
export function _resetTrustedForTests(): void {
  trustedMemo.clear()
}

/**
 * The kit's pinned contracts, once `GET /v1/contracts` names the same ones (the SDK's `contractsMismatch`: the router,
 * its allowance target, the orders contract and its EIP-712 domain, WETH, USDG, the launch stack, and every code hash the
 * kit pins). A build is held to the pins, never to the answer: an API that names another contract than this server's kit
 * is refused `build-mismatch` (this server may be behind the API, or the API wrong) before anything is built against it.
 * The answer is asked as the caller asks, and a refusal of it is that caller's alone.
 */
export async function trustedOf(ctx: Pick<ToolContext, 'api' | 'config'>, now = Date.now()): Promise<TrustedContracts> {
  const pins = pinned()
  const key = ctx.config.apiUrl
  const at = trustedMemo.get(key)
  if (at !== undefined && now - at < TRUSTED_TTL_MS) return pins
  const answer = await ask<Record<string, unknown>>(ctx.api, { method: 'GET', path: '/v1/contracts' })
  let wrong: string | null
  try {
    wrong = contractsMismatch(answer as never, pins)
  } catch {
    wrong = "the API's contracts answer is not one this server reads"
  }
  if (wrong) throw buildMismatch('contracts', wrong)
  trustedMemo.set(key, now)
  return pins
}

/** A contract as `get_contracts` names it: the kit's address, and the hash of its code: the kit's own where it pins one
 * (`kit`), and otherwise the API's word for a contract at the kit's address (`api`), to read on a node of one's own. */
function pinnedEntry(pins: TrustedContracts, address: Address, named: unknown): { address: string; codeHash: string | null; codeHashFrom: 'kit' | 'api' | null } {
  const pin = pins.codeHashes[address.toLowerCase()]
  if (pin) return { address: address.toLowerCase(), codeHash: pin.toLowerCase(), codeHashFrom: 'kit' }
  const hash = (named as { codeHash?: unknown } | null | undefined)?.codeHash
  return typeof hash === 'string' && /^0x[0-9a-fA-F]{64}$/.test(hash)
    ? { address: address.toLowerCase(), codeHash: hash.toLowerCase(), codeHashFrom: 'api' }
    : { address: address.toLowerCase(), codeHash: null, codeHashFrom: null }
}

/**
 * The contracts every build is held to, as `get_contracts` answers them: the kit's pins (`pinned`), once `GET
 * /v1/contracts` names the same ones (`contractsMismatch`), and never another address the answer names. Where the API
 * names another contract than the kit's, the tool refuses `build-mismatch`, as every build would.
 */
export async function contractsToCheck(ctx: Pick<ToolContext, 'api' | 'config'>, now = Date.now()): Promise<Record<string, unknown>> {
  const pins = pinned()
  const answer = await ask<Record<string, any>>(ctx.api, { method: 'GET', path: '/v1/contracts' })
  let wrong: string | null
  try {
    wrong = contractsMismatch(answer as never, pins)
  } catch {
    wrong = "the API's contracts answer is not one this server reads"
  }
  if (wrong) throw buildMismatch('contracts', wrong)
  trustedMemo.set(ctx.config.apiUrl, now)
  return {
    chainId: pins.chainId,
    source: "The kit this server was built with pins these, and the API's GET /v1/contracts names the same ones. Read each code hash on a node of your own (eth_getCode, then keccak-256): codeHashFrom says whether the kit pins the hash or the API names it.",
    router: pinnedEntry(pins, pins.router, answer.router),
    allowanceTarget: pinnedEntry(pins, pins.allowanceTarget, answer.allowanceTarget),
    orders: {
      ...pinnedEntry(pins, pins.orders, answer.orders),
      // contractsMismatch held the answer's domain and typehash to the kit's (Mancer Orders, version 3, V3's typehash)
      eip712: { domain: { name: 'Mancer Orders', version: '3', chainId: pins.chainId, verifyingContract: pins.orders.toLowerCase() }, primaryType: 'Order', typehash: String(answer.orders?.eip712?.typehash).toLowerCase() },
    },
    weth: pinnedEntry(pins, pins.weth, answer.weth),
    usdg: pinnedEntry(pins, pins.usdg, answer.usdg),
    launchCoordinator: pins.launch ? pinnedEntry(pins, pins.launch.coordinator, answer.launchCoordinator) : null,
    launchAllowanceTarget: pins.launch ? pinnedEntry(pins, pins.launch.allowanceTarget, answer.launchAllowanceTarget) : null,
  }
}

// --------------------------------------------------------------------------------------------------- the chain

/** The chain reader the checks take (values.ts): this server's own node where `MANCER_MCP_RPC_URL` names one, the API's
 * chain door otherwise. */
export { chainOf } from './values'

// ------------------------------------------------------------------------------------------- answering a build

/** The steps answer an SDK check that always asks for a simulation that passed is given: the same steps with a
 * simulation that passed. The answer's own simulation goes back to the caller beside the transactions whatever it says,
 * so a build whose simulation failed is answered as such (`nextFor`), and its revert is never a check's refusal. */
export function structural<T extends { simulation?: unknown }>(ready: T): T {
  return { ...ready, simulation: { ...(ready.simulation && typeof ready.simulation === 'object' ? ready.simulation : {}), ok: true } }
}

/** The transactions a check passed, as a tool answers them: the SDK's own frozen copies, never the API's objects, each with
 * what its calldata does in the check's reading and in the tool's own where it reads more. */
export function transactionsOf(checked: CheckedSteps, does: (step: { kind: string; to: string; data: string; value: string }, reading: StepReading | undefined) => Record<string, unknown> | undefined = () => undefined): UnsignedTx[] {
  return checked.steps.map((s, i): UnsignedTx => {
    const step = { kind: String(s.kind), to: getAddress(String(s.to)).toLowerCase(), data: String(s.data), value: String(s.value) }
    const reading = checked.readings.find((r) => r.step === i)
    const extra = does(step, reading)
    return {
      ...step,
      chainId: CHAIN_ID,
      gas: s.gas === null ? null : String(s.gas),
      why: String(s.why ?? ''),
      does: extra ?? (reading ? { reads: reading.does } : { reads: 'nothing this server reads further' }),
    }
  })
}

export type { Address, Hex }
