// SPDX-License-Identifier: MIT
// Part of Mancer's contracts kit as the SDK uses it, mirrored with the rest of this repository at each release.
import { decodeFunctionData, erc20Abi } from 'viem'
import type { Address, Hex } from 'viem'

import { safeLaunchV2OperatorAbi } from '../abi'

export type ExecutionRequirement =
  | { kind: 'erc20-allowance'; token: Address; spender: Address; amount: string }
  | {
      kind: 'protocol-operator'
      protocol: string
      target: Address
      launchId: string
      operator: Address
    }

export interface ExecutionTransaction {
  chain: string
  chainId: number
  kind: 'approval' | 'authorization' | 'swap'
  to: Address
  data: Hex
  value: string
}

export interface IntegratorExecution {
  version: 1
  taker: Address
  recipient: Address
  entrypoint: 'router' | 'launch-coordinator'
  requirements: ExecutionRequirement[]
  transactions: ExecutionTransaction[]
}

export interface LaunchOrderAuthorization {
  protocol: string
  origin: Address
  launchId: string
  requirements: ExecutionRequirement[]
  transactions: ExecutionTransaction[]
}

export interface ExecutionExpectation {
  account: Address
  chainId: number
  router: Address
  tokenIn: Address
  tokenOut: Address

  routerAllowanceTarget?: Address

  coordinator?: Address
  coordinatorAllowanceTarget?: Address
  safeLaunchPads?: readonly { pad: Address; adapter: Address }[]
}

const UNBOUNDED_ALLOWANCE = 1n << 128n

function same(a: string, b: string): boolean {
  return typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase()
}

function asUint(value: string): bigint | null {
  try {
    const parsed = BigInt(value)
    return parsed >= 0n ? parsed : null
  } catch {
    return null
  }
}

export function setupRequirementIndex(
  tx: ExecutionTransaction,
  requirements: readonly ExecutionRequirement[],
  fromIndex = 0,
): number {
  if (tx.value !== '0' || tx.kind === 'swap') return -1

  for (let i = fromIndex; i < requirements.length; i++) {
    const requirement = requirements[i]
    if (!requirement) continue
    try {
      if (tx.kind === 'approval' && requirement.kind === 'erc20-allowance') {
        if (!same(tx.to, requirement.token)) continue
        const decoded = decodeFunctionData({ abi: erc20Abi, data: tx.data })
        if (
          decoded.functionName === 'approve' &&
          same(decoded.args[0], requirement.spender) &&
          decoded.args[1] === BigInt(requirement.amount)
        ) {
          return i
        }
      }
      if (tx.kind === 'authorization' && requirement.kind === 'protocol-operator') {
        if (requirement.protocol !== 'safe-launch-v2' || !same(tx.to, requirement.target)) continue
        const decoded = decodeFunctionData({ abi: safeLaunchV2OperatorAbi, data: tx.data })
        if (
          decoded.functionName === 'setOperator' &&
          decoded.args[0] === BigInt(requirement.launchId) &&
          same(decoded.args[1], requirement.operator) &&
          decoded.args[2] === true
        ) {
          return i
        }
      }
    } catch {

    }
  }
  return -1
}

export function executionEnvelopeMismatch(
  execution: IntegratorExecution,
  expected: ExecutionExpectation,
): string | null {
  if (execution.version !== 1) return 'unsupported execution version'
  if (!same(execution.taker, expected.account) || !same(execution.recipient, expected.account)) {
    return 'taker and recipient must both be the connected wallet'
  }
  if (!Array.isArray(execution.requirements) || !Array.isArray(execution.transactions)) {
    return 'execution requirements are malformed'
  }
  if (execution.transactions.length === 0) return 'execution has no transactions'
  if (execution.transactions.some((tx) => tx.chainId !== expected.chainId)) {
    return 'execution is for a different chain'
  }
  if (execution.transactions.some((tx) => asUint(tx.value) === null)) {
    return 'execution contains an invalid transaction value'
  }
  const terminal = execution.transactions.at(-1)!
  if (terminal.kind !== 'swap') return 'the final transaction is not the swap'
  if (execution.transactions.slice(0, -1).some((tx) => tx.kind === 'swap')) {
    return 'execution contains an early swap transaction'
  }

  const expectedTarget =
    execution.entrypoint === 'router'
      ? expected.router
      : expected.coordinator
  if (!expectedTarget) return 'account-bound launch execution is not configured on this chain'
  if (!same(terminal.to, expectedTarget)) return 'terminal execution target is not trusted'

  for (const requirement of execution.requirements) {
    if (requirement.kind !== 'erc20-allowance') continue
    const amount = asUint(requirement.amount)
    if (amount === null || amount >= UNBOUNDED_ALLOWANCE) return 'an allowance requirement is unbounded'
  }

  if (execution.entrypoint === 'router') {

    if (!expected.routerAllowanceTarget) return 'router allowance target is not configured on this chain'
    for (const requirement of execution.requirements) {
      if (requirement.kind !== 'erc20-allowance') return 'router execution carries a protocol requirement'
      if (!same(requirement.token, expected.tokenIn)) return 'router input allowance is not for the sold token'
      if (!same(requirement.spender, expected.routerAllowanceTarget)) {
        return 'router input allowance spender is not the allowance target'
      }
    }
  }

  if (execution.entrypoint === 'launch-coordinator') {
    const pads = expected.safeLaunchPads ?? []
    if (!expected.coordinatorAllowanceTarget || pads.length === 0) {
      return 'account-bound launch requirements are not configured on this chain'
    }
    let outputRoundTripCount = 0
    let outputRoundTripAdapter: Address | undefined
    let outputRoundTripToken: Address | undefined
    const operatorAdapters: Address[] = []
    for (const requirement of execution.requirements) {
      if (requirement.kind === 'erc20-allowance') {
        if (same(requirement.token, expected.tokenIn)) {
          if (!same(requirement.spender, expected.coordinatorAllowanceTarget)) {
            return 'input allowance spender is not the coordinator allowance target'
          }
        } else {
          if (!pads.some((entry) => same(entry.adapter, requirement.spender))) {
            return 'output round-trip spender is not a configured pad adapter'
          }
          outputRoundTripCount++
          outputRoundTripAdapter = requirement.spender
          outputRoundTripToken = requirement.token
        }
      } else {
        if (
          requirement.protocol !== 'safe-launch-v2' ||
          !pads.some(
            (entry) => same(entry.pad, requirement.target) && same(entry.adapter, requirement.operator),
          )
        ) {
          return 'operator requirement is not for a configured pad adapter'
        }
        operatorAdapters.push(requirement.operator)
      }
    }
    if (outputRoundTripCount !== 1) return 'execution does not contain one output round-trip allowance'
    if (operatorAdapters.some((operator) => !outputRoundTripAdapter || !same(operator, outputRoundTripAdapter))) {
      return 'operator and output round-trip requirements name different adapters'
    }

    if (operatorAdapters.length === 0 && outputRoundTripToken && !same(outputRoundTripToken, expected.tokenOut)) {
      return 'output round-trip allowance is not for the bought launch token'
    }
  }

  let requirementCursor = 0
  for (const tx of execution.transactions.slice(0, -1)) {
    const index = setupRequirementIndex(tx, execution.requirements, requirementCursor)
    if (index < 0) return 'a setup transaction does not match its ordered requirement'
    requirementCursor = index + 1
  }
  return null
}

export function orderAuthorizationMismatch(
  authorization: LaunchOrderAuthorization,
  expected: Pick<ExecutionExpectation, 'chainId' | 'safeLaunchPads'>,
): string | null {
  if (authorization.protocol !== 'safe-launch-v2') return 'unsupported launch authorization protocol'
  const pads = expected.safeLaunchPads ?? []
  let launchId: bigint
  try { launchId = BigInt(authorization.launchId) } catch { return 'invalid launch id' }
  if (launchId <= 0n) return 'invalid launch id'
  const configured = pads.find((entry) => same(entry.pad, authorization.origin))
  if (!configured) return 'launch pad is not configured on this chain'
  if (!Array.isArray(authorization.requirements) || !Array.isArray(authorization.transactions)) {
    return 'launch authorization is malformed'
  }
  for (const requirement of authorization.requirements) {
    if (requirement.kind === 'erc20-allowance') {
      if (!same(requirement.spender, configured.adapter)) return 'round-trip spender is not the pad adapter'
    } else if (
      requirement.protocol !== 'safe-launch-v2' ||
      !same(requirement.target, configured.pad) ||
      !same(requirement.operator, configured.adapter) ||
      asUint(requirement.launchId) !== launchId
    ) {
      return 'operator requirement is not for the configured launch'
    }
  }
  let cursor = 0
  for (const tx of authorization.transactions) {
    if (tx.chainId !== expected.chainId) return 'authorization is for a different chain'
    if (tx.kind === 'swap') return 'order authorization contains a swap'
    const index = setupRequirementIndex(tx, authorization.requirements, cursor)
    if (index < 0) return 'a setup transaction does not match its ordered requirement'
    cursor = index + 1
  }
  return null
}

export const LAUNCH_UNAVAILABLE_MESSAGES: Readonly<Record<string, string>> = {
  'launch-waiting': 'This launch is not trading yet.',
  'launch-migrating': 'This launch is migrating. Trading resumes on its permanent pool.',
  'launch-migrated': 'The bonding curve has migrated. Fetching the permanent-pool route.',
  'launch-aborted': 'This launch was aborted and cannot trade.',
  'launch-eoa-only': 'This launch currently supports direct wallet transactions only.',
  'launch-buys-disabled': 'Buys are temporarily unavailable for this launch.',
  'launch-sells-disabled': 'Sells are temporarily unavailable for this launch.',
  'launch-maker-required': 'Connect the wallet that owns this launch position.',
  'launch-account-bound-excluded': 'Account-bound launch routes were excluded for this request.',
  'launch-manual-only': 'This launch requires a direct wallet transaction.',
  'launch-limits-unsupported': 'Limit orders are not available for this launch yet.',
  'launch-twap-unsupported': 'Recurring orders are not available for this launch yet.',
  'launch-unavailable': 'This launch route is temporarily unavailable.',
}

export class LaunchUnavailableError extends Error {
  constructor(readonly code: string) {
    super(LAUNCH_UNAVAILABLE_MESSAGES[code] ?? LAUNCH_UNAVAILABLE_MESSAGES['launch-unavailable'])
    this.name = 'LaunchUnavailableError'
  }
}

export function launchUnavailableCode(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const record = body as Record<string, unknown>
  const candidates = [
    record.unavailable,
    record.unavailableReason,
    record.executionEligibility,
    record.eligibility,
    record.reason,
    record.code,
  ]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.startsWith('launch-')) return candidate
    if (candidate && typeof candidate === 'object') {
      const code = (candidate as Record<string, unknown>).code
      if (typeof code === 'string' && code.startsWith('launch-')) return code
    }
  }
  return null
}

export function requirementLabel(
  requirement: ExecutionRequirement,
  tokenIn: Address,
  tokenOut: Address,
): string {
  if (requirement.kind === 'protocol-operator') {
    return `Authorize this launch adapter for launch #${requirement.launchId}`
  }
  if (same(requirement.token, tokenIn)) return 'Allow Mancer to transfer the input amount'
  if (same(requirement.token, tokenOut)) return 'Allow the output round trip back through Mancer'
  return 'Allow the launch output round trip back through Mancer'
}
