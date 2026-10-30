import test from 'node:test'
import assert from 'node:assert/strict'
import { encodeAbiParameters, encodeFunctionData, getAddress, zeroAddress, type Address, type Hex } from 'viem'
import { ROUTER_ADDRESS_THIS, ROUTER_MSG_SENDER } from '../src/kit/router-legs'
import { universalRouterAbi } from '../src/kit/abi'
import { checkSwapSteps } from '../src/index'
import type { Quote, ReadySteps } from '../src/generated/openapi'
import { NOW, SIM_OK, TRUSTED, approveData, executeData } from './helpers'

/**
 * The second reader's third pass (2026-10-30), on the Universal Router's ledger. A SETTLE from the Universal Router's own
 * balance, a SETTLE_ALL of ether and a WRAP_ETH each spend the amount they name, yet the ledger reads each as taking
 * the whole of its currency out: with an amount under what rests, the rest stays in the Universal Router, whose SWEEP
 * pays anyone. The router's CashStranded guard reads the leg's input token alone, so an output, or ether unwrapped from
 * the input, passes it. Bounded by the caller's floor, as every leg-level loss is.
 */

const ME = getAddress('0x' + '33'.repeat(20))
const UR = getAddress('0x8876789976decbfcbbbe364623c63652db8c0904')
const ready = (steps: ReadySteps['steps']): ReadySteps => ({ chainId: 4663, wallet: ME.toLowerCase(), steps, simulation: SIM_OK as never, readAfter: null })
const step = (kind: string, to: Address, data: Hex) => ({ kind, to: to.toLowerCase(), data, value: '0', gas: '100000', why: '' })
const enc = (types: { type: string }[], values: unknown[]) => encodeAbiParameters(types, values as never)
const two = (a: Address, n: bigint) => enc([{ type: 'address' }, { type: 'uint256' }], [a, n])
/** TAKE(currency, recipient, amount), or SETTLE(currency, amount, payerIsUser) where the second is a boolean. */
const three = (a: Address, b: Address | boolean, n: bigint): Hex =>
  typeof b === 'boolean'
    ? enc([{ type: 'address' }, { type: 'uint256' }, { type: 'bool' }], [a, n, b])
    : enc([{ type: 'address' }, { type: 'address' }, { type: 'uint256' }], [a, b, n])
const v4 = (actions: Hex, params: Hex[]) => enc([{ type: 'bytes' }, { type: 'bytes[]' }], [actions, params])
const ur = (commands: Hex, inputs: Hex[]) => encodeFunctionData({ abi: universalRouterAbi, functionName: 'execute', args: [commands, inputs, BigInt(NOW + 600)] })

function swapThrough(payload: Hex, tokenIn: Address, tokenOut: Address, fund: number, nativeOut = false) {
  const plan = executeData({ tokenIn, tokenOut: nativeOut ? zeroAddress : tokenOut, legs: [{ target: UR, payload, tokenIn, tokenOut, amountIn: 0n, fund }] })
  const steps = [step('approval', tokenIn, approveData(TRUSTED.allowanceTarget, 1_000_000n)), step('swap', TRUSTED.router, plan)]
  const q = { amountOut: '1000', minOut: '995', fee: { bps: 10 }, latencyMs: 1, cached: false, tx: { to: TRUSTED.router, data: '0x', value: '0', approval: null }, ready: ready(steps) } as Quote
  return () => checkSwapSteps(q, { wallet: ME, recipient: ME, tokenIn, tokenOut, amountIn: 1_000_000n, nativeIn: false, nativeOut, minOut: 990n, maxFeeBps: 10, nowSec: NOW }, TRUSTED)
}

test('LOW: a Universal Router call that pays out less than rests in it, by a SETTLE, a SETTLE_ALL or a WRAP_ETH of an amount, is refused', () => {
  const cases: Record<string, () => unknown> = {
    // Permit2: the swap's WETH TAKEn to the Universal Router, SETTLE(WETH, 1, from its balance) and TAKE_ALL hand one
    // wei on to the router, and the rest of the WETH stays in the Universal Router
    'SETTLE of one wei after a TAKE to ADDRESS_THIS': swapThrough(
      ur('0x10', [v4('0x060c0e0b0f', ['0x00', two(TRUSTED.usdg, 1_000_000n), three(TRUSTED.weth, ROUTER_ADDRESS_THIS, 0n), three(TRUSTED.weth, false, 1n), two(TRUSTED.weth, 0n)])]),
      TRUSTED.usdg, TRUSTED.weth, 2,
    ),
    // transfer-funded WETH unwrapped whole in the Universal Router, a swap of one wei of ether settled by SETTLE_ALL: the
    // router's CashStranded reads WETH (now none) and lets the ether that rests through
    'SETTLE_ALL of one wei of ether after an UNWRAP_WETH': swapThrough(
      ur('0x0c10', [two(ROUTER_ADDRESS_THIS, 0n), v4('0x060c0f', ['0x00', two(zeroAddress, 1n), two(TRUSTED.usdg, 0n)])]),
      TRUSTED.weth, TRUSTED.usdg, 1,
    ),
    // native out: the ether TAKEn to the Universal Router, WRAP_ETH(the router, one wei): the rest of the ether stays
    'WRAP_ETH of one wei after a TAKE of ether': swapThrough(
      ur('0x100b', [v4('0x060c0e', ['0x00', two(TRUSTED.usdg, 1_000_000n), three(zeroAddress, ROUTER_ADDRESS_THIS, 0n)]), two(ROUTER_MSG_SENDER, 1n)]),
      TRUSTED.usdg, TRUSTED.weth, 2, true,
    ),
  }
  const passed = Object.entries(cases).filter(([, run]) => {
    try {
      run()
      return true
    } catch {
      return false
    }
  }).map(([name]) => name)
  assert.deepEqual(passed, [], `the ledger took these for paid out whole: ${passed.join('; ')}`)
})
