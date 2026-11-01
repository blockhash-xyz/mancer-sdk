import test from 'node:test'
import assert from 'node:assert/strict'
import { encodeFunctionData, getAddress, hashTypedData, zeroAddress, type Address, type Hex } from 'viem'
import { BOOK_DEPLOYMENTS } from '../src/kit/books/deployments'
import { ERC20_TRANSFER_ABI, ERC721_TRANSFER_ABI } from '../src/kit/transfer'
import { bookCallData, redeemCall, stakeCall } from '../src/kit/books/calls'
import { ORDER_EIP712_TYPES_V3, ZERO_OCO_GROUP, orderToAbiV3, ordersDomainV3, type MancerOrderV3 } from '../src/kit/orders'
import { mancerOrdersV3Abi } from '../src/kit/abi'
import {
  MancerCheckError,
  checkBookSteps,
  checkCancelAllSteps,
  checkCancelSteps,
  checkOrderSetupSteps,
  checkSwapSteps,
  checkTransferSteps,
} from '../src/index'
import type { Quote, ReadySteps } from '../src/generated/openapi'
import { NOW, SIM_OK, TRUSTED, approveData, executeData } from './helpers'

// The checks each set of steps meets before one is signed: a build that pays someone else, trades another token, carries
// a lower floor or a higher fee, or approves another spender is refused; so is a send to another recipient, a cancel of
// another order, and a Book step to a contract of no pinned deployment.

const ME = getAddress('0x' + '33'.repeat(20))
const ATTACKER = getAddress('0x' + '44'.repeat(20))

function ready(steps: ReadySteps['steps'], over: Partial<ReadySteps> = {}): ReadySteps {
  return { chainId: 4663, wallet: ME.toLowerCase(), steps, simulation: SIM_OK as never, readAfter: null, ...over }
}
const step = (kind: string, to: Address, data: Hex, value = '0') => ({ kind, to: to.toLowerCase(), data, value, gas: '100000', why: '' })

function quote(r: ReadySteps, over: Partial<Quote> = {}): Quote {
  return { amountOut: '1000', minOut: '995', fee: { bps: 10 }, latencyMs: 1, cached: false, tx: { to: TRUSTED.router, data: '0x', value: '0', approval: null }, ready: r, ...over } as Quote
}

const swapAsk = {
  wallet: ME, recipient: ME, tokenIn: TRUSTED.usdg, tokenOut: TRUSTED.weth, amountIn: 1_000_000n,
  nativeIn: false, nativeOut: false, minOut: 990n, maxFeeBps: 10, nowSec: NOW,
}

test('a plain swap: the exact approval and the router call, each read back, pass', () => {
  const r = ready([step('approval', TRUSTED.usdg, approveData(TRUSTED.allowanceTarget, 1_000_000n)), step('swap', TRUSTED.router, executeData())])
  const c = checkSwapSteps(quote(r), swapAsk, TRUSTED)
  assert.equal(c.readings.length, 2)
  assert.match(c.readings[0]!.does, /approves 0x4c16/i)
  assert.equal(c.readings[1]!.router?.delivers.atLeast, 990n)
  assert.equal(c.readings[1]!.router?.recipient, 'sender')
  // a swap with the allowance in place is the router call alone
  assert.equal(checkSwapSteps(quote(ready([step('swap', TRUSTED.router, executeData())])), swapAsk, TRUSTED).steps.length, 1)
})

test('a tampered build is refused before anything is signed', () => {
  const swapOf = (data: Hex, to: Address = TRUSTED.router, value = '0') => quote(ready([step('swap', to, data, value)]))
  const cases: Array<[Quote, RegExp]> = [
    [swapOf(executeData({ recipient: ATTACKER })), /recipient/],
    [swapOf(executeData({ tokenOut: ATTACKER })), /tokenOut/],
    [swapOf(executeData({ tokenIn: ATTACKER })), /tokenIn/],
    [swapOf(executeData({ amountIn: 2_000_000n })), /amountIn/],
    [swapOf(executeData({ minAmountOut: 989n })), /floor/],
    [swapOf(executeData({ feeBps: 11 })), /fee/],
    [swapOf(executeData({ deadline: BigInt(NOW + 86_400) })), /deadline/],
    [swapOf(executeData(), ATTACKER), /router this SDK trusts/],
    [swapOf(executeData(), TRUSTED.router, '1'), /ETH/],
    [swapOf('0x12345678'), /not a Mancer router call/],
    [quote(ready([step('approval', TRUSTED.usdg, approveData(ATTACKER, 1_000_000n)), step('swap', TRUSTED.router, executeData())])), /allowance target/],
    [quote(ready([step('approval', TRUSTED.usdg, approveData(TRUSTED.allowanceTarget, 2n ** 255n)), step('swap', TRUSTED.router, executeData())])), /exactly the amount/],
    [quote(ready([step('approval', ATTACKER, approveData(TRUSTED.allowanceTarget, 1_000_000n)), step('swap', TRUSTED.router, executeData())])), /token you spend/],
    [quote(ready([step('transfer', TRUSTED.usdg, '0x'), step('swap', TRUSTED.router, executeData())])), /unexpected transfer/],
    [quote(ready([step('swap', TRUSTED.router, executeData())], { wallet: ATTACKER })), /another wallet/],
    [quote(ready([step('swap', TRUSTED.router, executeData())], { chainId: 1 as never })), /another chain/],
    [quote(ready([step('swap', TRUSTED.router, executeData())], { simulation: { ok: false, block: 1, timestamp: 1, revert: { step: 0, kind: 'swap', error: 'TooLittleReceived', selector: null, args: [], message: '' } } })), /would fail/],
    [quote({ error: 'x', code: 'steps-unavailable' } as never), /steps-unavailable/],
  ]
  for (const [q, why] of cases) {
    assert.throws(() => checkSwapSteps(q, swapAsk, TRUSTED), (e: unknown) => e instanceof MancerCheckError && why.test(e.message), String(why))
  }
})

test('a swap of ether carries exactly its amount and needs no approval', () => {
  const native = { ...swapAsk, tokenIn: TRUSTED.weth, tokenOut: TRUSTED.usdg, nativeIn: true }
  const data = executeData({ tokenIn: zeroAddress, tokenOut: TRUSTED.usdg, amountIn: 1_000_000n })
  assert.equal(checkSwapSteps(quote(ready([step('swap', TRUSTED.router, data, '1000000')])), native, TRUSTED).steps.length, 1)
  assert.throws(() => checkSwapSteps(quote(ready([step('swap', TRUSTED.router, data, '999999')])), native, TRUSTED), /value/)
  assert.throws(() => checkSwapSteps(quote(ready([step('approval', TRUSTED.weth, approveData(TRUSTED.allowanceTarget, 1n)), step('swap', TRUSTED.router, data, '1000000')])), native, TRUSTED), /needs no approval/)
})

test("a router build's ordered envelope is checked as a plain swap, paying the recipient the caller named", () => {
  // the envelope the API puts on every build that names a taker (execution/integrator-execution.ts
  // `buildRouterIntegratorExecution`): the input's exact approval, then the router's call
  const FRIEND = getAddress('0x' + '55'.repeat(20))
  const tx = (kind: string, to: Address, data: Hex, value = '0') => ({ chain: 'robinhood', chainId: 4663, kind, to, data, value })
  const envelope = (over: Record<string, unknown> = {}, data: Hex = executeData({ recipient: FRIEND })) => ({
    version: 1, taker: ME, recipient: FRIEND, entrypoint: 'router',
    requirements: [{ kind: 'erc20-allowance', token: TRUSTED.usdg, spender: TRUSTED.allowanceTarget, amount: '1000000' }],
    transactions: [tx('approval', TRUSTED.usdg, approveData(TRUSTED.allowanceTarget, 1_000_000n)), tx('swap', TRUSTED.router, data)],
    ...over,
  })
  const stepsOf = (e: { transactions: Array<{ kind: string; to: Address; data: Hex; value: string }> }) => ready(e.transactions.map((t) => step(t.kind, t.to, t.data, t.value)))
  const ask = { ...swapAsk, recipient: FRIEND }
  const e = envelope()
  const c = checkSwapSteps(quote(stepsOf(e), { execution: e } as never), ask, TRUSTED)
  assert.equal(String(c.readings[1]!.router?.recipient).toLowerCase(), FRIEND.toLowerCase())
  assert.match(c.readings[0]!.does, /approves 0x4c16/i)
  // a swap of ether's envelope names no allowance, and its one transaction is the swap
  const native = { ...ask, tokenIn: TRUSTED.weth, tokenOut: TRUSTED.usdg, nativeIn: true }
  const ethData = executeData({ tokenIn: zeroAddress, tokenOut: TRUSTED.usdg, recipient: FRIEND })
  const ethEnvelope = envelope({ requirements: [], transactions: [tx('swap', TRUSTED.router, ethData, '1000000')] })
  assert.equal(checkSwapSteps(quote(stepsOf(ethEnvelope), { execution: ethEnvelope } as never), native, TRUSTED).steps.length, 1)
  const refused: Array<[Record<string, any>, ReadySteps | null, RegExp]> = [
    // the caller named itself as the recipient, and the envelope pays another
    [e, null, /another recipient/],
    [envelope({ taker: ATTACKER }), null, /another wallet/],
    // a protocol's authorization rides in no plain swap
    [envelope({ requirements: [{ kind: 'protocol-operator', protocol: 'safe-launch-v2', target: ATTACKER, launchId: '1', operator: ATTACKER }] }), null, /protocol-operator/],
    [envelope({ requirements: [], transactions: [tx('authorization', ATTACKER, '0x12345678'), tx('swap', TRUSTED.router, executeData({ recipient: FRIEND }))] }), null, /authorization/],
    [envelope({ requirements: [{ kind: 'erc20-allowance', token: TRUSTED.usdg, spender: ATTACKER, amount: '1000000' }] }), null, /allowance target/],
    [envelope({ requirements: [{ kind: 'erc20-allowance', token: TRUSTED.usdg, spender: TRUSTED.allowanceTarget, amount: '1000001' }] }), null, /another amount/],
    // a step that is not its envelope transaction
    [e, ready([step('approval', TRUSTED.usdg, approveData(TRUSTED.allowanceTarget, 1_000_000n)), step('swap', TRUSTED.router, executeData({ recipient: ATTACKER }))]), /not its envelope transaction/],
    // the envelope and its steps agree, and the router's call pays someone else: the plain swap's check reads it
    [envelope({}, executeData({ recipient: ATTACKER })), null, /recipient/],
  ]
  for (const [ex, steps, why] of refused) {
    const asked = ex === e && steps === null ? swapAsk : ask
    assert.throws(() => checkSwapSteps(quote(steps ?? stepsOf(ex as never), { execution: ex } as never), asked, TRUSTED), (err: unknown) => err instanceof MancerCheckError && why.test(err.message), String(why))
  }
})

test("a launch route's steps are its envelope's transactions, held to the site's envelope check and the pinned launch stack", () => {
  const launch = TRUSTED.launch!
  const tx = (kind: 'approval' | 'swap', to: Address, data: Hex) => ({ chain: 'robinhood' as const, chainId: 4663 as const, kind, to, data, value: '0' })
  const approval = approveData(launch.allowanceTarget, 1_000_000n)
  const execution = {
    version: 1 as const, taker: ME, recipient: ME, entrypoint: 'launch-coordinator' as const,
    requirements: [
      { kind: 'erc20-allowance' as const, token: TRUSTED.usdg, spender: launch.allowanceTarget, amount: '1000000' },
      { kind: 'erc20-allowance' as const, token: TRUSTED.weth, spender: launch.pads[0]!.adapter, amount: '5' },
    ],
    transactions: [tx('approval', TRUSTED.usdg, approval), tx('approval', TRUSTED.weth, approveData(launch.pads[0]!.adapter, 5n)), tx('swap', launch.coordinator, executeData())],
  }
  const steps = execution.transactions.map((t) => step(t.kind, t.to, t.data))
  const q = quote(ready(steps), { execution })
  const launchAsk = { ...swapAsk, roundTripCap: 10n }
  assert.equal(checkSwapSteps(q, launchAsk, TRUSTED).steps.length, 3)
  // the round trip's allowance (the output to the pad's adapter) is held under the cap the swap names, and refused with none
  assert.throws(() => checkSwapSteps(q, swapAsk, TRUSTED), /round-trip allowance/)
  assert.throws(() => checkSwapSteps(q, { ...swapAsk, roundTripCap: 4n }, TRUSTED), /round-trip allowance/)
  // the terminal sent somewhere else than the pinned coordinator
  const moved = { ...execution, transactions: [...execution.transactions.slice(0, 2), tx('swap', ATTACKER, executeData())] }
  assert.throws(() => checkSwapSteps(quote(ready(moved.transactions.map((t) => step(t.kind, t.to, t.data))), { execution: moved }), launchAsk, TRUSTED), /terminal execution target/)
  // a step that is not its envelope transaction
  const swapped = [...steps.slice(0, 2), step('swap', launch.coordinator, executeData({ recipient: ATTACKER }))]
  assert.throws(() => checkSwapSteps(quote(ready(swapped), { execution }), launchAsk, TRUSTED), /not its envelope transaction/)
  // an envelope whose own terminal pays someone else passes the envelope check and fails the router call's
  const paysOther = { ...execution, transactions: [...execution.transactions.slice(0, 2), tx('swap', launch.coordinator, executeData({ recipient: ATTACKER }))] }
  assert.throws(() => checkSwapSteps(quote(ready(paysOther.transactions.map((t) => step(t.kind, t.to, t.data))), { execution: paysOther }), launchAsk, TRUSTED), /recipient/)
})

test("an order's setup: a wrap and the orders contract's approval, held to the allowance the bot's own node reads plus the order's pull", () => {
  const deposit = '0xd0e30db0' as Hex
  // the wallet's allowance to the orders contract, as its own node reads it: 500; the order pulls 2,000
  const setup = { tokenIn: TRUSTED.weth, amountPerFill: 1_000n, totalFills: 2, wallet: ME, nativeIn: true, allowance: 500n }
  const need = { book: TRUSTED.orders.toLowerCase(), pull: '2000', openPulls: '500', openPullsOf: 'maker', allowance: '0', held: '0' }
  // the setup's own count rides beside its steps, in `ready.need`, as the API answers it
  const withNeed = (r: ReadySteps) => Object.assign(r, { need })
  // the API wraps what the book will pull less the WETH held (need - held: 2,500), and approves the same
  const ok = { ready: withNeed(ready([step('wrap', TRUSTED.weth, deposit, '2500'), step('approval', TRUSTED.weth, approveData(TRUSTED.orders, 2_500n))])) }
  assert.equal(checkOrderSetupSteps(ok, setup, TRUSTED)!.steps.length, 2)
  assert.throws(() => checkOrderSetupSteps({ ready: withNeed(ready([step('approval', TRUSTED.weth, approveData(ATTACKER, 2_500n))])) }, setup, TRUSTED), /orders contract/)
  assert.throws(() => checkOrderSetupSteps({ ready: withNeed(ready([step('approval', TRUSTED.weth, approveData(TRUSTED.orders, 1n << 200n))])) }, setup, TRUSTED), /unbounded/)
  assert.throws(() => checkOrderSetupSteps({ ready: withNeed(ready([step('approval', TRUSTED.weth, approveData(TRUSTED.orders, 1_999n))])) }, setup, TRUSTED), /cover/)
  assert.ok(checkOrderSetupSteps({ ready: withNeed(ready([step('approval', TRUSTED.weth, approveData(TRUSTED.orders, 2_499n))])) }, setup, TRUSTED))
  // more than the node's 500 plus the order's 2,000, whatever count of open pulls the answer names beside it
  assert.throws(() => checkOrderSetupSteps({ ready: withNeed(ready([step('approval', TRUSTED.weth, approveData(TRUSTED.orders, 2_501n))])) }, setup, TRUSTED), /allowance your node reads/)
  // with no allowance read, the approval is the order's pull at the most
  assert.throws(() => checkOrderSetupSteps({ ready: withNeed(ready([step('approval', TRUSTED.weth, approveData(TRUSTED.orders, 2_500n))])) }, { ...setup, allowance: undefined }, TRUSTED), /allowance your node reads/)
  assert.throws(() => checkOrderSetupSteps({ ready: withNeed(ready([step('wrap', ATTACKER, deposit, '2500')])) }, setup, TRUSTED), /WETH/)
  assert.throws(() => checkOrderSetupSteps({ ready: withNeed(ready([step('wrap', TRUSTED.weth, deposit, '2501')])) }, setup, TRUSTED), /more than/)
  assert.throws(() => checkOrderSetupSteps({ ready: withNeed(ready([step('authorization', ATTACKER, '0x')])) }, setup, TRUSTED), /launch pair/)
  assert.equal(checkOrderSetupSteps({ ready: { error: 'nothing', code: 'nothing-to-do' } }, setup, TRUSTED), null)
})

test("an order's wrap is at most what the book will pull, this order's and the other orders', less the WETH the wallet holds", () => {
  const deposit = '0xd0e30db0' as Hex
  const wrap = (v: bigint) => ({ ready: ready([step('wrap', TRUSTED.weth, deposit, v.toString())]) })
  const one = 10n ** 18n
  const base = { tokenIn: TRUSTED.weth, amountPerFill: one, totalFills: 1, wallet: ME, nativeIn: true }
  // a maker whose node reads 100 WETH approved for its other orders, and that holds none, is wrapped at most the 101 the
  // book will pull: what the API wraps for a maker whose open orders pull 100
  assert.ok(checkOrderSetupSteps(wrap(101n * one), { ...base, allowance: 100n * one, held: 0n }, TRUSTED))
  assert.throws(() => checkOrderSetupSteps(wrap(101n * one + 1n), { ...base, allowance: 100n * one, held: 0n }, TRUSTED), /more than the order pulls/)
  assert.ok(checkOrderSetupSteps(wrap(one), { ...base, allowance: 100n * one, held: 0n }, TRUSTED))
  // with no other order counted or read, the wrap is the pull less what the wallet holds at the most
  assert.throws(() => checkOrderSetupSteps(wrap(one + 1n), { ...base, held: 0n }, TRUSTED), /more than the order pulls/)
  assert.throws(() => checkOrderSetupSteps(wrap(0n), { ...base, held: 0n }, TRUSTED), /wraps nothing/)
  // no other order, 0.4 WETH held: the wrap is the 0.6 the order still lacks, at the most
  const fresh = { ...base, held: (4n * one) / 10n }
  assert.ok(checkOrderSetupSteps(wrap((6n * one) / 10n), fresh, TRUSTED))
  assert.throws(() => checkOrderSetupSteps(wrap((6n * one) / 10n + 1n), fresh, TRUSTED), /less the WETH the wallet holds/)
  // a wallet that holds the whole pull already wraps nothing
  assert.throws(() => checkOrderSetupSteps(wrap(1n), { ...base, held: one }, TRUSTED), /less the WETH the wallet holds/)
  // another open order pulls 1 WETH and the wallet holds it: this order's 1 ETH is wrapped whole, and no more
  const beside = { ...base, openPulls: one, held: one }
  assert.ok(checkOrderSetupSteps(wrap(one), beside, TRUSTED))
  assert.throws(() => checkOrderSetupSteps(wrap(one + 1n), beside, TRUSTED), /more than the order pulls/)
  // the approval with the count beside it: this order's pull and the other orders' at the most
  const approve = (n: bigint) => ({ ready: ready([step('approval', TRUSTED.weth, approveData(TRUSTED.orders, n))]) })
  assert.ok(checkOrderSetupSteps(approve(2n * one), beside, TRUSTED))
  assert.throws(() => checkOrderSetupSteps(approve(2n * one + 1n), beside, TRUSTED), /as counted/)
  // with nothing counted and nothing read, the approval is exactly the pull
  assert.throws(() => checkOrderSetupSteps(approve(one + 1n), { ...base, openPulls: 0n }, TRUSTED), /as counted/)
  assert.ok(checkOrderSetupSteps(approve(one), { ...base, openPulls: 0n }, TRUSTED))
  assert.throws(() => checkOrderSetupSteps(approve(one), { ...base, held: -1n }, TRUSTED), /held is raw units/)
})

test('a send is rebuilt from the kit and held to it byte for byte', () => {
  const to = getAddress('0x' + '77'.repeat(20))
  const eth = ready([step('transfer', to, '0x', '5')])
  assert.equal(checkTransferSteps(eth, { wallet: ME, to, asset: { kind: 'native' }, amount: 5n }).recipient, to)
  assert.throws(() => checkTransferSteps(ready([step('transfer', ATTACKER, '0x', '5')]), { wallet: ME, to, asset: { kind: 'native' }, amount: 5n }), /not the transfer/)
  assert.throws(() => checkTransferSteps(ready([step('transfer', to, '0x', '6')]), { wallet: ME, to, asset: { kind: 'native' }, amount: 5n }), /not the transfer/)
  const token = TRUSTED.usdg
  const erc20 = encodeFunctionData({ abi: ERC20_TRANSFER_ABI, functionName: 'transfer', args: [to, 7n] })
  assert.ok(checkTransferSteps(ready([step('transfer', token, erc20)]), { wallet: ME, to, asset: { kind: 'erc20', token }, amount: 7n }))
  const toAttacker = encodeFunctionData({ abi: ERC20_TRANSFER_ABI, functionName: 'transfer', args: [ATTACKER, 7n] })
  assert.throws(() => checkTransferSteps(ready([step('transfer', token, toAttacker)]), { wallet: ME, to, asset: { kind: 'erc20', token }, amount: 7n }))
  const nft = getAddress('0x' + '88'.repeat(20))
  const piece = encodeFunctionData({ abi: ERC721_TRANSFER_ABI, functionName: 'safeTransferFrom', args: [ME, to, 12n] })
  assert.ok(checkTransferSteps(ready([step('transfer', nft, piece)]), { wallet: ME, to, asset: { kind: 'nft', collection: nft, tokenId: 12n } }))
  // a username is held to the address the answer names it resolved to
  const named = ready([step('transfer', token, erc20)], { simulation: { ...SIM_OK, outcome: { ...SIM_OK.outcome, recipient: to.toLowerCase() } } as never })
  assert.equal(checkTransferSteps(named, { wallet: ME, to: '@friend', asset: { kind: 'erc20', token }, amount: 7n }).recipient, to)
  assert.throws(() => checkTransferSteps(ready([step('transfer', token, erc20)]), { wallet: ME, to: '@friend', asset: { kind: 'erc20', token }, amount: 7n }), /no address for the username/)
})

function orderOf(over: Partial<MancerOrderV3> = {}): MancerOrderV3 {
  return {
    maker: ME, tokenIn: TRUSTED.weth, tokenOut: TRUSTED.usdg, amountPerFill: '1000', totalFills: 1, everySec: 0, fillWindowSec: 0, startAt: 0, expiry: 0,
    minOutPerFill: '5', triggerOutPerFill: '0', maxOutPerFill: '0', maxFeeBps: 15, epoch: `0x${'00'.repeat(32)}`, nonce: '9', ocoGroup: ZERO_OCO_GROUP, ...over,
  }
}

test("an order's on-chain cancel is cancel(order) of the order asked for, the wallet's own, on the trusted book", () => {
  const o = orderOf()
  const hash = hashTypedData({ domain: ordersDomainV3(4663, TRUSTED.orders), types: ORDER_EIP712_TYPES_V3, primaryType: 'Order', message: orderToAbiV3(o) })
  const data = encodeFunctionData({ abi: mancerOrdersV3Abi, functionName: 'cancel', args: [orderToAbiV3(o)] })
  assert.ok(checkCancelSteps(ready([step('cancel', TRUSTED.orders, data)]), { wallet: ME, orderHash: hash }, TRUSTED))
  const other = encodeFunctionData({ abi: mancerOrdersV3Abi, functionName: 'cancel', args: [orderToAbiV3(orderOf({ nonce: '10' }))] })
  assert.throws(() => checkCancelSteps(ready([step('cancel', TRUSTED.orders, other)]), { wallet: ME, orderHash: hash }, TRUSTED), /not the one asked for/)
  assert.throws(() => checkCancelSteps(ready([step('cancel', ATTACKER, data)]), { wallet: ME, orderHash: hash }, TRUSTED), /orders contract/)
  const salt = `0x${'5a'.repeat(32)}` as Hex
  const all = encodeFunctionData({ abi: mancerOrdersV3Abi, functionName: 'cancelAll', args: [salt] })
  assert.ok(checkCancelAllSteps(ready([step('cancelAll', TRUSTED.orders, all)]), { wallet: ME, salt }, TRUSTED))
  assert.throws(() => checkCancelAllSteps(ready([step('cancelAll', TRUSTED.orders, all)]), { wallet: ME, salt: `0x${'5b'.repeat(32)}` }, TRUSTED), /your salt/)
})

test("a Book's act is its own calls, rebuilt by the kit from the bot's arguments, byte for byte, and nothing else", () => {
  const d = BOOK_DEPLOYMENTS[0]!
  const token = getAddress('0x' + 'aa'.repeat(20)), vault = getAddress('0x' + 'bb'.repeat(20))
  const answer = (steps: ReadySteps['steps'], over: { factory?: string; vault?: Address; bookId?: string; action?: string } = {}) => ({
    ...ready(steps), action: over.action ?? 'redeem', book: { token, bookId: over.bookId ?? '1', factory: over.factory ?? d.factory.address, vault: over.vault ?? vault, phase: 'settled' as never },
  })
  const asStep = (kind: string, c: { to: Address; data: Hex; value: bigint }) => step(kind, c.to, c.data, c.value.toString())
  const redeem = bookCallData(redeemCall(d, 1n, 10n))
  const ask = { wallet: ME, token, action: 'redeem', bookId: 1n, vault, expected: { calls: [redeemCall(d, 1n, 10n)], approval: null } }
  assert.equal(checkBookSteps(answer([asStep('redeem', redeem)]), ask).deployment.label, d.label)
  // an exact approval of what the act pulls, to its own spender, where the bot's node read the allowance short
  const short = { ...ask, expected: { calls: [redeemCall(d, 1n, 10n)], approval: { token, spender: d.settler.address, amount: 10n } } }
  assert.ok(checkBookSteps(answer([step('approval', token, approveData(d.settler.address, 10n)), asStep('redeem', redeem)]), short))
  assert.throws(() => checkBookSteps(answer([step('approval', token, approveData(d.settler.address, 11n)), asStep('redeem', redeem)]), short), /exactly what the act pulls/)
  assert.throws(() => checkBookSteps(answer([step('approval', token, approveData(d.settler.address, 10n)), asStep('redeem', redeem)]), ask), /needs no approval/)
  // another amount, another contract, another act's call, ether beside it
  assert.throws(() => checkBookSteps(answer([asStep('redeem', bookCallData(redeemCall(d, 1n, 11n)))]), ask), /not the act's own call/)
  assert.throws(() => checkBookSteps(answer([step('redeem', ATTACKER, redeem.data)]), ask), /not the act's own call/)
  assert.throws(() => checkBookSteps(answer([asStep('redeem', bookCallData(stakeCall(d, 1n, 10n)))]), ask), /not the act's own call/)
  assert.throws(() => checkBookSteps(answer([step('redeem', redeem.to, redeem.data, '1')]), ask), /not the act's own call/)
  assert.throws(() => checkBookSteps(answer([asStep('redeem', redeem), asStep('redeem', redeem)]), ask), /1 call and needs no approval, and the answer is 2 steps/)
  // the Book is the one the bot's node reads: its factory, its id and its vault
  assert.throws(() => checkBookSteps(answer([asStep('redeem', redeem)], { factory: ATTACKER }), ask), /does not pin/)
  assert.throws(() => checkBookSteps(answer([asStep('redeem', redeem)], { vault: ATTACKER }), ask), /another vault/)
  assert.throws(() => checkBookSteps(answer([asStep('redeem', redeem)], { bookId: '2' }), ask), /another vault or Book id/)
  assert.throws(() => checkBookSteps(answer([asStep('redeem', redeem)]), { ...ask, action: 'claim' }), /another act/)
  assert.throws(() => checkBookSteps(answer([asStep('redeem', redeem)]), { wallet: ME, token, action: 'redeem', bookId: 1n, vault }), /rebuilt from your own arguments/)
})
