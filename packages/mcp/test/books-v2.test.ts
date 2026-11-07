import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { decodeFunctionData, getAddress, parseAbi, zeroAddress, type Address, type Hex } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { checkExactBookCalls } from '@blockhash/mancer-sdk'
import { BOOK_BONDING_GAS } from '../../sdk/src/checks'
import { BOOK_DEPLOYMENTS, bookCallData, bookLaunchDeployment, bookSettlesInChosenAsset, graduateCall, liquidateCall, sweepLeftoverCall } from '../../sdk/src/shared'
import { _resetTrustedForTests, settlementSendLine, transactionsOf } from '../src/checks'
import { _resetTokenMemoForTests } from '../src/values'
import { BOOK, BOOKS, BOOK_ID, USDG, VAULT, WETH, call, configFor, httpClient, standIn, type StandIn } from './helpers'

/**
 * The Books tools on StonkBrokers' later stacks: a TraderBookPadV2 step that bonds in the same transaction keeps the gas
 * the bond needs, the pad's claim and the settlement asset's choice are refused on a deployment that has neither, a sweep
 * answers the asset it pays, and a Book's record is saved on the factory new Books open on alone.
 */

const TAKER = '0x00000000000000000000000000000000000000a1' as Address
/** The stack of 2026-11-03 (TraderBookPadV2), as the kit lists it. */
const BOOKS_1103_DEPLOYMENT = BOOK_DEPLOYMENTS.find((d) => d.label === 'books-1103')!
afterEach(() => {
  _resetTokenMemoForTests()
  _resetTrustedForTests()
})

async function run(api: StandIn, name: string, args: Record<string, unknown>, headers: Record<string, string> = {}) {
  const { client, close } = await httpClient(configFor(api), headers)
  try {
    return await call(client, name, args)
  } finally {
    await close()
  }
}

test("a TraderBookPadV2 graduation's transaction names the gas its bond needs, whatever the API named", () => {
  const c = bookCallData(graduateCall(BOOKS_1103_DEPLOYMENT, BOOK_ID))
  const ready = { chainId: 4663, wallet: TAKER, simulation: { ok: true }, readAfter: null, steps: [{ kind: 'graduate', to: c.to, data: c.data, value: '0', gas: '400000', why: 'Graduates.' }] }
  const bonds = checkExactBookCalls('book', ready as never, TAKER, { calls: [graduateCall(BOOKS_1103_DEPLOYMENT, BOOK_ID)], mayBond: true })
  assert.equal(transactionsOf(bonds)[0]!.gas, BOOK_BONDING_GAS.toString())
  // more than the bond needs, as the API named it, stands; and a step that does not bond keeps the API's gas
  const more = checkExactBookCalls('book', { ...ready, steps: [{ ...ready.steps[0]!, gas: '9500000' }] } as never, TAKER, { calls: [graduateCall(BOOKS_1103_DEPLOYMENT, BOOK_ID)], mayBond: true })
  assert.equal(transactionsOf(more)[0]!.gas, '9500000')
  const plain = checkExactBookCalls('book', ready as never, TAKER, { calls: [graduateCall(BOOKS_1103_DEPLOYMENT, BOOK_ID)] })
  assert.equal(transactionsOf(plain)[0]!.gas, '400000')
})

/**
 * Second reader, finding L-3 (M1's re-read, on this server). The SDK's sender reads the settler's `settleAssetFor(bookId)`
 * again right before a liquidation goes, and the site and the app read it at the preflight's pinned block. This server
 * sends nothing: `build_book_settlement` reads the asset once, at the build, and hands the agent the liquidation unsigned,
 * which it may send minutes later inside the sales' five minutes. A switch that lands in between leaves every sale unrun,
 * so the transaction carries the read as its precondition: the settler, `settleAssetFor(bookId)`, the asset the sales pay,
 * and to build again where it differs.
 */
test("L-3: a settlement's transaction tells the agent to read settleAssetFor again before it sends, and to build again where it moved", () => {
  const d = BOOK_DEPLOYMENTS.find((x) => bookSettlesInChosenAsset(x))!
  const me = getAddress('0x59c6995e998f97a5a0044966f0945389dc9e86da')
  const stonk = getAddress('0xe934e36a439c94017b64a3fece66af12099abf50')
  const call = liquidateCall(d, 7n, [])
  const data = bookCallData(call)
  const settlesIn = { settler: getAddress(d.settler.address), abiSet: d.abiSet, bookId: 7n, pays: stonk as Address }
  const ready = { chainId: 4663, wallet: me.toLowerCase(), steps: [{ kind: 'liquidate', to: data.to.toLowerCase(), data: data.data, value: '0', gas: '400000', why: '' }], simulation: { ok: true }, readAfter: null }
  const checked = checkExactBookCalls('book', ready as never, me, { calls: [call], approval: null, settlesIn })
  assert.deepEqual(checked.readings[0]!.settlesIn, settlesIn, 'the SDK reading carries what the sender must hold')
  const [tx] = transactionsOf(checked)
  const said = JSON.stringify(tx)
  assert.match(said, /settleAssetFor/, `the agent is told nothing of the asset's re-read before it sends: ${said}`)
  // the read itself, ready to make: the settler, its calldata, the asset the sales pay, and what to do where it moved
  const p = tx!.precondition!
  assert.equal(p.read, 'settleAssetFor(7)')
  assert.equal(p.call.to, d.settler.address.toLowerCase())
  assert.deepEqual(decodeFunctionData({ abi: parseAbi(['function settleAssetFor(uint256) view returns (address)']), data: p.call.data as Hex }).args, [7n])
  assert.equal(p.answers, stonk.toLowerCase())
  assert.equal(p.zeroAddressIs, WETH)
  assert.match(p.otherwise, /^Send nothing and build the settlement again/)
  // the tool's next says it before the send
  assert.equal(
    settlementSendLine([tx!]),
    `Right before sending the liquidation, call settleAssetFor(7) on the settler ${d.settler.address.toLowerCase()}, as its precondition says. Where it answers another asset than ${stonk.toLowerCase()} (its zero address is WETH), send nothing and build the settlement again. Sign and send each transaction in order from the wallet.`,
  )
  // a settlement on a settler that settles in WETH carries none: nothing there can move its asset
  const plain = checkExactBookCalls('book', { ...ready, steps: [{ ...ready.steps[0]!, to: bookCallData(liquidateCall(BOOKS, 7n, [])).to.toLowerCase(), data: bookCallData(liquidateCall(BOOKS, 7n, [])).data }] } as never, me, { calls: [liquidateCall(BOOKS, 7n, [])], approval: null })
  assert.equal(transactionsOf(plain)[0]!.precondition, undefined)
  assert.equal(settlementSendLine(transactionsOf(plain)), 'Sign and send each transaction in order from the wallet.')
})

test("a pad's claim and a settlement asset's choice are refused on the Books contracts, and their arguments are their acts' alone", async () => {
  const api = await standIn()
  try {
    for (const [action, extra] of [['padClaim', {}], ['setSettleAsset', { inQuote: true }]] as const) {
      const r = await run(api, 'build_book_act', { token: BOOK, action, wallet: TAKER, ...extra })
      assert.equal(r.isError, true, r.text)
      assert.equal(r.body.code, 'build-mismatch', r.text)
      assert.equal(r.body.detail.check, 'book')
    }
    assert.equal((await run(api, 'build_book_act', { token: BOOK, action: 'setSettleAsset', wallet: TAKER })).body.code, 'bad-argument')
    assert.equal((await run(api, 'build_book_act', { token: BOOK, action: 'arm', wallet: TAKER, unwrap: true })).body.code, 'bad-argument')
    assert.equal((await run(api, 'build_book_act', { token: BOOK, action: 'arm', wallet: TAKER, inQuote: false })).body.code, 'bad-argument')
    assert.equal(api.seen.filter((s) => s.path.endsWith('/steps')).length, 0, 'nothing was asked to build')
  } finally {
    await api.close()
  }
})

test("a sweep of a Book that settles in WETH is the settler's own sweep, and its answer names the asset it pays", async () => {
  const q = { adapter: zeroAddress, tokenIn: WETH, tokenOut: zeroAddress, amountIn: 0n, minOut: 0n, route: '0x' as const, deadline: 0n, salt: 0n, signature: '0x' as const }
  const c = bookCallData(sweepLeftoverCall(BOOKS, BOOK_ID, q))
  const api = await standIn({
    'POST /v1/books/:token/steps': ({ body }) => ({
      body: {
        action: 'sweepLeftover', book: { token: BOOK, bookId: '7', factory: BOOKS.factory.address, vault: VAULT, phase: 'settled' },
        chainId: 4663, wallet: (body as { wallet: string }).wallet, steps: [{ kind: 'sweepLeftover', to: c.to, data: c.data, value: '0', gas: '300000', why: 'Sweeps.' }], simulation: { ok: true }, readAfter: null,
      },
    }),
  })
  try {
    const r = await run(api, 'build_book_act', { token: BOOK, action: 'sweepLeftover', wallet: TAKER, sweepToken: WETH })
    assert.equal(r.isError, false, r.text)
    assert.equal(r.body.settleAsset.token, WETH)
    assert.equal(r.body.settleAsset.symbol, 'WETH')
    assert.equal(r.body.transactions[0].to, BOOKS.settler.address.toLowerCase())
    // a token that is neither the asset nor the Book's own needs a signed sweep quote
    const other = await run(api, 'build_book_act', { token: BOOK, action: 'sweepLeftover', wallet: TAKER, sweepToken: USDG })
    assert.equal(other.body.code, 'build-mismatch')
  } finally {
    await api.close()
  }
})

test("a Book's record is saved on the factory new Books open on: by default, and never another", async () => {
  const agent = privateKeyToAccount(generatePrivateKey())
  const api = await standIn({ 'POST /v1/books/drafts': () => ({ status: 201, body: { draft: { id: 'c'.repeat(32) } } }) })
  const { client, close } = await httpClient(configFor(api))
  try {
    const begun = await call(client, 'sign_in', { wallet: agent.address })
    await call(client, 'complete_sign_in', { signature: await agent.signMessage({ message: begun.body.message }) })
    const saved = await call(client, 'create_book_draft', { name: 'Real Book', symbol: 'REAL', targets: [USDG] })
    assert.equal(saved.isError, false, saved.text)
    // the kit's launch deployment: the Books contracts until BOOK_LAUNCH_FACTORY names v2c's factory
    assert.equal((api.seen.filter((s) => s.path === '/v1/books/drafts').at(-1)!.body as { factory: string }).factory, bookLaunchDeployment()!.factory.address.toLowerCase())
    const elsewhere = await call(client, 'create_book_draft', { factory: BOOKS_1103_DEPLOYMENT.factory.address, name: 'Real Book', symbol: 'REAL', targets: [USDG] })
    assert.equal(elsewhere.body.code, 'factory-not-open')
    assert.equal(api.seen.filter((s) => s.path === '/v1/books/drafts').length, 1, 'nothing was saved for the other factory')
  } finally {
    await close()
    await api.close()
  }
})
