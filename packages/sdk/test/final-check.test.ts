import test from 'node:test'
import assert from 'node:assert/strict'
import { encodeFunctionData, erc20Abi, getAddress, type Address, type Hex } from 'viem'
import { checkOrderSetupSteps } from '../src/index'
import type { ReadySteps } from '../src/generated/openapi'
import { SIM_OK, TRUSTED } from './helpers'

/**
 * The final reading of the unified MCP change (2026-10-31): the SDK's own client against the API's own order setup.
 */

const ME = getAddress('0x' + '33'.repeat(20))

/** The steps the API's order setup answers (packages/api/src/steps/orders.ts `orderSetupSteps`): need = this order's pull
 * plus the maker's other open pulls; a wrap of need - held where the WETH held falls short; an approval of need where the
 * allowance falls short. */
function apiSetup(o: { pull: bigint; openPulls: bigint; held: bigint; allowance: bigint; nativeIn: boolean }): { ready: ReadySteps } {
  const need = o.pull + o.openPulls
  const steps: ReadySteps['steps'] = []
  if (o.nativeIn && o.held < need) steps.push({ kind: 'wrap', to: TRUSTED.weth.toLowerCase(), data: '0xd0e30db0', value: (need - o.held).toString(), gas: '50000', why: '' })
  if (o.allowance < need) steps.push({ kind: 'approval', to: TRUSTED.weth.toLowerCase(), data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [TRUSTED.orders as Address, need] }) as Hex, value: '0', gas: '60000', why: '' })
  return { ready: { chainId: 4663, wallet: ME.toLowerCase(), steps, simulation: SIM_OK as never, readAfter: null } }
}

test("the SDK's own orderSetup passes the API's setup for a maker whose WETH fell short of its other open orders' pulls", () => {
  // Mancer.orderSetup (mancer.ts) asks with the maker's own session, so the API counts every other open order of the maker
  // (`openPullsOf: 'maker'`), and hands the check the allowance and the WETH its node reads. A maker with one open order
  // selling 1 WETH (approved for exactly that: allowance 1), whose WETH has since gone (held 0), places an order selling
  // 1 ETH: the API wraps 2 and approves 2. Round 2's bound (the allowance plus the pull) passed it; the new wrap bound
  // (never more than this order's pull) refuses it, so the SDK's own client cannot place the order.
  const one = 10n ** 18n
  const answer = apiSetup({ pull: one, openPulls: one, held: 0n, allowance: one, nativeIn: true })
  assert.doesNotThrow(() => checkOrderSetupSteps(answer, { wallet: ME, tokenIn: TRUSTED.weth, amountPerFill: one, totalFills: 1, nativeIn: true, allowance: one, held: 0n }, TRUSTED))
})

test("the API's setup the SDK's own fixture stood for (need: openPulls 500, held 0) passes the SDK's check", () => {
  // checks.test.ts's own fixture names the API's answer `need: { pull: 2000, openPulls: 500, openPullsOf: 'maker', held: 0 }`,
  // for which the API wraps need - held = 2,500. The test was changed this round to a wrap of 2,000 to pass the new bound.
  const answer = apiSetup({ pull: 2_000n, openPulls: 500n, held: 0n, allowance: 500n, nativeIn: true })
  assert.doesNotThrow(() => checkOrderSetupSteps(answer, { wallet: ME, tokenIn: TRUSTED.weth, amountPerFill: 1_000n, totalFills: 2, nativeIn: true, allowance: 500n }, TRUSTED))
})
