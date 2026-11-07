import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { getAddress, keccak256, type Address, type Hex, type PublicClient, type WalletClient } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { BOOKS_1103_DEPLOYMENT, BOOKS_DEPLOYMENT, BOOKS_V2C_DEPLOYMENT, BOOK_SHARED, type BookDeployment } from '../src/kit/books/deployments'
import { ORDER_TYPEHASH_V3 } from '../src/kit/orders'
import { bookCallData, buyEthCall, graduateCall, liquidateCall, openBookCall, padClaimCall, sellCall, setSettleAssetCall, sweepLeftoverCall } from '../src/kit/books/calls'
import { hashBookQuote, parseBookQuote } from '../src/kit/books/typed-data'
import {
  Mancer,
  MancerCheckError,
  bookActCalls,
  bookQuoteDigest,
  bookRedeemPayouts,
  checkDraftOpenSteps,
  checkExactBookCalls,
  checkVaultQuote,
  openBookParamsOf,
  raiseCalls,
  readBookRedemption,
  readBookSettleAsset,
  readChainBook,
  settlementCalls,
  settlementPaysAsset,
  type ChainBook,
} from '../src/index'
import { BOOK_DEPLOYMENTS } from '../src/shared'
import { BOOK_BONDING_GAS } from '../src/checks'
import { NOW, SIM_OK, TRUSTED, approveData, codeAt, contractsAnswer, executeData, fakeChain, mockApi } from './helpers'

// A Book on StonkBrokers' later stacks, end to end against a stand-in API and chain: the stack of 2026-11-03, whose pad
// (TraderBookPadV2) names a sale's recipient, bonds in the same transaction as the closing buy or the graduation, and
// keeps a claim ledger; and the stack that settles a Book in its own base pair where a trader or the creator chooses it,
// whose sweeps, redemptions and settlement sales are all in that asset. A Book of the Books contracts is checked as it
// always was.

const account = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d')
const session = `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: account.address.toLowerCase(), iat: 1, exp: 4_000_000_000 })).toString('base64url')}.x`
const ME = account.address
const ATTACKER = getAddress('0x' + '44'.repeat(20))
const BOOK = getAddress('0x' + 'aa'.repeat(20))
const VAULT = getAddress('0x' + 'bb'.repeat(20))
const NFT = getAddress('0x' + 'dd'.repeat(20))
const STONK = getAddress('0x' + 'ee'.repeat(20))
const PONS = getAddress('0x39dbed3a2bd333467115de45665cc57f813c4571')
const WETH = getAddress(BOOK_SHARED.weth)
const E = 10n ** 18n

const hashAt = (a: string) => keccak256(codeAt(a))
function standInDeployment(d: BookDeployment): BookDeployment {
  const pin = <T extends { address: Address; runtimeCodeHash: Hex }>(p: T): T => ({ ...p, runtimeCodeHash: hashAt(p.address) })
  return {
    ...d,
    factory: pin(d.factory), pad: pin(d.pad), settler: pin(d.settler), lpFees: pin(d.lpFees), locker: pin(d.locker), operatorNft: pin(d.operatorNft),
    ...(d.lockerV4 ? { lockerV4: pin(d.lockerV4) } : {}),
    adapters: { uniswap: pin(d.adapters.uniswap), ...(d.adapters.mancer ? { mancer: pin(d.adapters.mancer) } : {}) },
    bookTokenCodeHash: hashAt(BOOK), vaultCloneCodeHash: hashAt(VAULT),
  }
}

/** The stack of 2026-11-03: TraderBookPadV2, every Book settled in WETH. */
const V2 = standInDeployment(BOOKS_1103_DEPLOYMENT)
/** A stack of origin/settle-in-base (deployed nowhere yet): the same pad, and a settler that settles in the base pair where
 * chosen, its vaults signing under "Mancer Books". */
const SETTLE_IN_BASE: BookDeployment = standInDeployment({
  ...BOOKS_1103_DEPLOYMENT,
  label: 'books-settle-in-base',
  abiSet: 'books-e8d92ea',
  factory: { address: getAddress('0x' + '5b'.repeat(20)), runtimeCodeHash: BOOKS_1103_DEPLOYMENT.factory.runtimeCodeHash },
  settler: { address: getAddress('0x' + '5c'.repeat(20)), runtimeCodeHash: BOOKS_1103_DEPLOYMENT.settler.runtimeCodeHash },
  opensNewBooks: false,
  expected: { ...BOOKS_1103_DEPLOYMENT.expected, vaultDomainName: 'Mancer Books' },
})
/** The Books contracts, as the stack new Books open on in these tests whichever stack the kit's launch factory names. */
const GEN3: BookDeployment = { ...standInDeployment(BOOKS_DEPLOYMENT), opensNewBooks: true }

const bookOn = (deployment: BookDeployment): ChainBook => ({ deployment, token: BOOK, bookId: 7n, vault: VAULT })

/** A chain that answers reads by function name, each by its arguments. */
function chainOf(reads: Record<string, (args: readonly unknown[], address: Address) => unknown>) {
  const asked: string[] = []
  return {
    asked,
    readContract: async (r: { address: Address; functionName: string; args?: readonly unknown[] }) => {
      asked.push(r.functionName)
      const f = reads[r.functionName]
      if (!f) throw new Error(`no stand-in read for ${r.functionName}`)
      return f(r.args ?? [], getAddress(r.address))
    },
  } as unknown as Pick<PublicClient, 'readContract'> & { asked: string[] }
}

test('a Book on the stack of 2026-11-03 is the one its factory names, beside the Books contracts', async () => {
  const chain = chainOf({
    bookIdOfToken: (_a, factory) => (factory === getAddress(V2.factory.address) ? 3n : 0n),
    bookOf: () => [BOOK, VAULT, NFT],
  })
  const book = await readChainBook(chain, BOOK, [GEN3, V2])
  assert.equal(book.deployment.label, 'books-1103')
  assert.equal(book.bookId, 3n)
})

test("a sale on TraderBookPadV2 names the wallet that sells as its recipient, and on the Books pad is the call it always was", async () => {
  const chain = chainOf({ allowance: () => 0n })
  const sale = await raiseCalls(chain, bookOn(V2), WETH, ME, { side: 'sell', amountIn: 20n, payWith: 'eth' }, 15n)
  assert.equal(bookCallData(sale.expected.calls[0]!).data, bookCallData(sellCall(V2, 7n, 20n, 15n, 'eth', ME)).data)
  assert.notEqual(bookCallData(sale.expected.calls[0]!).data, bookCallData(sellCall(V2, 7n, 20n, 15n, 'eth', ATTACKER)).data)
  // the Books pad's sale names no recipient: the same bytes as before
  const gen3 = await raiseCalls(chain, bookOn(GEN3), WETH, ME, { side: 'sell', amountIn: 20n, payWith: 'eth' }, 15n)
  assert.equal(bookCallData(gen3.expected.calls[0]!).data, bookCallData(sellCall(GEN3, 7n, 20n, 15n, 'eth')).data)
  // the approval of the Book's tokens to the pad stays exact
  assert.deepEqual(sale.expected.approval, { token: BOOK, spender: V2.pad.address, amount: 20n })
  // a sale paying another wallet is not the act's own call
  const ready = { chainId: 4663, wallet: ME.toLowerCase(), simulation: SIM_OK, readAfter: null }
  const step = (c: { to: Address; data: Hex; value: bigint }) => ({ kind: 'sell', to: c.to.toLowerCase(), data: c.data, value: c.value.toString(), gas: '100000', why: '' })
  const approve = { kind: 'approval', to: BOOK.toLowerCase(), data: approveData(V2.pad.address, 20n), value: '0', gas: '50000', why: '' }
  assert.throws(() => checkExactBookCalls('book', { ...ready, steps: [approve, step(bookCallData(sellCall(V2, 7n, 20n, 15n, 'eth', ATTACKER)))] } as never, ME, sale.expected), /not the act's own call/)
  assert.ok(checkExactBookCalls('book', { ...ready, steps: [approve, step(bookCallData(sellCall(V2, 7n, 20n, 15n, 'eth', ME)))] } as never, ME, sale.expected))
})

test("a graduation and a closing buy on TraderBookPadV2 keep the gas the bond needs; the Books pad's never do", async () => {
  const chain = chainOf({ allowance: () => 0n })
  const ready = (steps: unknown[]) => ({ chainId: 4663, wallet: ME.toLowerCase(), steps, simulation: SIM_OK, readAfter: null })
  const asStep = (kind: string, c: { to: Address; data: Hex; value: bigint }) => ({ kind, to: c.to.toLowerCase(), data: c.data, value: c.value.toString(), gas: BOOK_BONDING_GAS.toString(), why: '' })
  const grad = await bookActCalls(chain, bookOn(V2), ME, 'graduate', {}, TRUSTED.router)
  assert.equal(grad.expected.mayBond, true)
  const checked = checkExactBookCalls('book', ready([asStep('graduate', bookCallData(graduateCall(V2, 7n)))]) as never, ME, grad.expected)
  assert.equal(checked.readings[0]!.minGas, BOOK_BONDING_GAS)
  const old = await bookActCalls(chain, bookOn(GEN3), ME, 'graduate', {}, TRUSTED.router)
  assert.equal(old.expected.mayBond, undefined)
  assert.equal(checkExactBookCalls('book', ready([asStep('graduate', bookCallData(graduateCall(GEN3, 7n)))]) as never, ME, old.expected).readings[0]!.minGas, undefined)
  // a buy that closes the curve on TraderBookPadV2, and one that does not
  const closing = await raiseCalls(chain, bookOn(V2), WETH, ME, { side: 'buy', amountIn: 1000n, payWith: 'eth', closesCurve: true }, 4950n)
  assert.equal(closing.expected.mayBond, true)
  const plain = await raiseCalls(chain, bookOn(V2), WETH, ME, { side: 'buy', amountIn: 1000n, payWith: 'eth' }, 4950n)
  assert.equal(plain.expected.mayBond, undefined)
  const gen3 = await raiseCalls(chain, bookOn(GEN3), WETH, ME, { side: 'buy', amountIn: 1000n, payWith: 'eth', closesCurve: true }, 4950n)
  assert.equal(gen3.expected.mayBond, undefined, 'the Books pad bonds in a call of its own')
})

/** A stand-in client of the API and the chain for one deployment's Book. */
function stand(d: BookDeployment, routes: Parameters<typeof mockApi>[0], reads: Record<string, (args: readonly unknown[]) => unknown> = {}) {
  const sent: Array<{ to: string; data: string; value: bigint; gas: bigint }> = []
  const wallet = {
    getChainId: async () => 4663,
    sendTransaction: async (tx: { to: string; data: string; value: bigint; gas: bigint }) => {
      sent.push(tx)
      return (`0x${String(sent.length).padStart(64, '0')}`) as Hex
    },
  } as unknown as WalletClient
  const chain = {
    ...fakeChain({
      bookIdOfToken: ([t]) => (String(t).toLowerCase() === BOOK.toLowerCase() ? 7n : 0n),
      bookOf: () => [BOOK, VAULT, NFT],
      quoteOf: () => WETH,
      allowance: () => 0n,
      balanceOf: () => 25n,
      ORDER_TYPEHASH: () => ORDER_TYPEHASH_V3,
      ...reads,
    }),
    waitForTransactionReceipt: async ({ hash }: { hash: Hex }) => ({ status: 'success', transactionHash: hash, logs: [] }),
  } as unknown as PublicClient
  return mockApi({ 'GET /v1/contracts': () => ({ body: contractsAnswer() }), ...routes }).then((api) => ({
    api, sent, m: new Mancer({ baseUrl: api.url, account, session, trusted: TRUSTED, bookDeployments: [d], publicClient: chain, walletClient: wallet }),
  }))
}

test("a TraderBookPadV2 buy that closes the curve is sent with the bonding gas, where the wallet's estimate would defer the bond", async () => {
  const buy = bookCallData(buyEthCall(V2, 7n, 4950n, ME, 1000n))
  let closes = true
  const answer = () => ({
    head: { block: 100, timestamp: NOW }, deployment: { factory: V2.factory.address.toLowerCase(), abiSet: 'books-4e07ea0', label: 'books-1103' }, bookId: '7', side: 'buy', payWith: 'eth',
    quote: { token: WETH.toLowerCase(), symbol: 'WETH', decimals: 18, isWeth: true, usd8: null, source: 'frozen' }, amountIn: '1000', taxBps: 100, taxQuote: '10', curveQuote: '990',
    amountOut: '5000', minOut: '4950', closesCurve: closes, pad: 'claims',
    ready: { chainId: 4663, wallet: ME.toLowerCase(), steps: [{ kind: 'buy', to: buy.to.toLowerCase(), data: buy.data, value: '1000', gas: BOOK_BONDING_GAS.toString(), why: '' }], simulation: SIM_OK, readAfter: null },
  })
  const { api, m, sent } = await stand(V2, { 'GET /v1/books/:token/raise-quote': () => ({ body: answer() }) })
  try {
    const r = await m.raiseSteps(BOOK, { side: 'buy', amountIn: 1000n, minOut: 4900n })
    assert.equal(r.checked.readings[0]!.minGas, BOOK_BONDING_GAS)
    await m.sendSteps(r.checked)
    // the stand-in node estimates 100,000 gas: the step goes out with the bond's room all the same
    assert.equal(sent[0]!.gas, BOOK_BONDING_GAS)
    // a buy that does not close the curve takes the node's estimate, and an API's gas that far from it is refused
    closes = false
    const plain = await m.raiseSteps(BOOK, { side: 'buy', amountIn: 1000n, minOut: 4900n })
    assert.equal(plain.checked.readings[0]!.minGas, undefined)
    await assert.rejects(m.sendSteps(plain.checked), /far from your node's estimate/)
    assert.equal(sent.length, 1)
  } finally {
    await api.close()
  }
})

test("a TraderBookPadV2 buy quoted in the seconds before minBondAt that reaches the mark keeps the bonding gas (the answer's mayBond)", async () => {
  const buy = bookCallData(buyEthCall(V2, 7n, 4950n, ME, 1000n))
  // at the quote's own second the curve stays open (closesCurve false), and wherever the buy lands from minBondAt on it
  // closes it and tries the bond: the raise quote says so (`mayBond`), and the step keeps the bond's room
  let mayBond = true
  const answer = () => ({
    head: { block: 100, timestamp: NOW }, deployment: { factory: V2.factory.address.toLowerCase(), abiSet: 'books-4e07ea0', label: 'books-1103' }, bookId: '7', side: 'buy', payWith: 'eth',
    quote: { token: WETH.toLowerCase(), symbol: 'WETH', decimals: 18, isWeth: true, usd8: null, source: 'fixed' }, amountIn: '1000', taxBps: 100, taxQuote: '10', curveQuote: '990',
    amountOut: '5000', minOut: '4950', closesCurve: false, mayBond, pad: 'claims',
    ready: { chainId: 4663, wallet: ME.toLowerCase(), steps: [{ kind: 'buy', to: buy.to.toLowerCase(), data: buy.data, value: '1000', gas: BOOK_BONDING_GAS.toString(), why: '' }], simulation: SIM_OK, readAfter: null },
  })
  const { api, m, sent } = await stand(V2, { 'GET /v1/books/:token/raise-quote': () => ({ body: answer() }) })
  try {
    const r = await m.raiseSteps(BOOK, { side: 'buy', amountIn: 1000n, minOut: 4900n })
    assert.equal(r.checked.readings[0]!.minGas, BOOK_BONDING_GAS)
    await m.sendSteps(r.checked)
    assert.equal(sent[0]!.gas, BOOK_BONDING_GAS, "sent with the bond's room, where the node's estimate would defer the bond")
    // the answer's word only adds gas: without it the step is the node's estimate
    mayBond = false
    assert.equal((await m.raiseSteps(BOOK, { side: 'buy', amountIn: 1000n, minOut: 4900n })).checked.readings[0]!.minGas, undefined)
  } finally {
    await api.close()
  }
  const chain = chainOf({ allowance: () => 0n })
  assert.equal((await raiseCalls(chain, bookOn(V2), WETH, ME, { side: 'buy', amountIn: 1000n, payWith: 'eth', mayBond: true }, 4950n)).expected.mayBond, true)
  assert.equal((await raiseCalls(chain, bookOn(GEN3), WETH, ME, { side: 'buy', amountIn: 1000n, payWith: 'eth', mayBond: true }, 4950n)).expected.mayBond, undefined, 'the Books pad bonds in a call of its own')
  assert.equal((await raiseCalls(chain, bookOn(V2), WETH, ME, { side: 'sell', amountIn: 20n, payWith: 'eth', mayBond: true }, 15n)).expected.mayBond, undefined, 'a sale never bonds')
})

test("a pad's claim is the kit's claim of the Book's base pair, paid as ether on a WETH Book unless unwrap is false; the Books pad has none", async () => {
  let quote: Address = WETH
  const chain = chainOf({ quoteOf: () => quote })
  const asked = await bookActCalls(chain, bookOn(V2), ME, 'padClaim', {}, TRUSTED.router)
  assert.equal(bookCallData(asked.expected.calls[0]!).data, bookCallData(padClaimCall(V2, WETH, true)).data)
  assert.deepEqual(asked.fields, { unwrap: true })
  const asWeth = await bookActCalls(chain, bookOn(V2), ME, 'padClaim', { unwrap: false }, TRUSTED.router)
  assert.equal(bookCallData(asWeth.expected.calls[0]!).data, bookCallData(padClaimCall(V2, WETH, false)).data)
  assert.deepEqual(asWeth.fields, { unwrap: false })
  // a Book of another base pair claims that token, never paid as ether
  quote = STONK
  const listed = await bookActCalls(chain, bookOn(V2), ME, 'padClaim', { unwrap: true }, TRUSTED.router)
  assert.equal(bookCallData(listed.expected.calls[0]!).data, bookCallData(padClaimCall(V2, STONK, false)).data)
  await assert.rejects(bookActCalls(chain, bookOn(V2), ME, 'padClaim', { token: WETH }, TRUSTED.router), /the Book's own base pair/)
  await assert.rejects(bookActCalls(chain, bookOn(GEN3), ME, 'padClaim', {}, TRUSTED.router), (e) => e instanceof MancerCheckError && /keeps no claim ledger/.test(e.reason))
})

test('a settlement asset is chosen only on a settler that settles in the base pair where chosen', async () => {
  // a Book trading on your node's clock: its unlock is a day off
  const chain = chainOf({ unlockAt: () => BigInt(NOW) + 86_400n, getCurrentBlockTimestamp: () => BigInt(NOW) })
  const pick = await bookActCalls(chain, bookOn(SETTLE_IN_BASE), ME, 'setSettleAsset', { inQuote: true }, TRUSTED.router)
  assert.equal(bookCallData(pick.expected.calls[0]!).data, bookCallData(setSettleAssetCall(SETTLE_IN_BASE, 7n, true)).data)
  assert.equal(bookCallData(pick.expected.calls[0]!).to, SETTLE_IN_BASE.settler.address)
  assert.deepEqual(pick.fields, { inQuote: true })
  const back = await bookActCalls(chain, bookOn(SETTLE_IN_BASE), ME, 'setSettleAsset', { inQuote: false }, TRUSTED.router)
  assert.equal(bookCallData(back.expected.calls[0]!).data, bookCallData(setSettleAssetCall(SETTLE_IN_BASE, 7n, false)).data)
  assert.deepEqual([...new Set(chain.asked)].sort(), ['getCurrentBlockTimestamp', 'unlockAt'], "the Book's unlock and your node's clock")
  const unasked = chainOf({})
  await assert.rejects(bookActCalls(unasked, bookOn(SETTLE_IN_BASE), ME, 'setSettleAsset', {}, TRUSTED.router), /inQuote true/)
  for (const d of [V2, GEN3]) {
    await assert.rejects(bookActCalls(unasked, bookOn(d), ME, 'setSettleAsset', { inQuote: true }, TRUSTED.router), /settles every Book in WETH/)
  }
  assert.deepEqual(unasked.asked, [], 'nothing is read for a refusal of the arguments or the deployment')
})

test('M1: no settlement asset change is built once the Book has ended, when a settlement on signed sales may be in flight', async () => {
  // past its unlock (frozen, or liquidated after it): the settler's liquidation reads the asset as it runs and runs no
  // sale signed into another, so a change then could leave every signed sale unrun
  for (const now of [BigInt(NOW), BigInt(NOW) + 1n, BigInt(NOW) + 86_400n]) {
    const ended = chainOf({ unlockAt: () => BigInt(NOW), getCurrentBlockTimestamp: () => now })
    await assert.rejects(
      bookActCalls(ended, bookOn(SETTLE_IN_BASE), ME, 'setSettleAsset', { inQuote: false }, TRUSTED.router),
      (e) => e instanceof MancerCheckError && /term has ended/.test(e.reason),
    )
  }
  // a Book not yet bonded has no unlock (0): the change is built
  const unbonded = chainOf({ unlockAt: () => 0n, getCurrentBlockTimestamp: () => BigInt(NOW) })
  assert.ok(await bookActCalls(unbonded, bookOn(SETTLE_IN_BASE), ME, 'setSettleAsset', { inQuote: false }, TRUSTED.router))
})

test("M1-R: no settlement asset change is built in a quote's lifetime before the unlock, where it would land after it", async () => {
  // the switch names no deadline: sent from a wallet whose prompt stood minutes, one built a second before the unlock lands
  // after it, when a settlement's sales may already be signed into the asset as it stood
  const unlock = BigInt(NOW) + 86_400n
  for (const before of [1n, 60n, 300n]) {
    const late = chainOf({ unlockAt: () => unlock, getCurrentBlockTimestamp: () => unlock - before })
    await assert.rejects(
      bookActCalls(late, bookOn(SETTLE_IN_BASE), ME, 'setSettleAsset', { inQuote: true }, TRUSTED.router),
      (e) => e instanceof MancerCheckError && /five minutes/.test(e.reason),
      `${before} s before the unlock`,
    )
  }
  const inTime = chainOf({ unlockAt: () => unlock, getCurrentBlockTimestamp: () => unlock - 301n })
  assert.ok(await bookActCalls(inTime, bookOn(SETTLE_IN_BASE), ME, 'setSettleAsset', { inQuote: true }, TRUSTED.router), 'five minutes and a second before it')
})

/**
 * Second reader, I-2: npm's @blockhash/mancer-sdk and @blockhash/mancer-mcp 0.2.3 were published from main before v2c,
 * and pin no v2c entry. The public repository's publish runs only for a version npm lacks, so a tree that pins v2c under
 * 0.2.3 would publish nothing and differ from npm's 0.2.3 of the same number.
 */
const NPM_BEFORE_V2C = '0.2.3'
const newerThan = (a: string, b: string): boolean => {
  const [x, y] = [a, b].map((v) => v.split('.').map(Number))
  for (let i = 0; i < 3; i++) if (x![i] !== y![i]) return x![i]! > y![i]!
  return false
}

test("I-2: the SDK pins v2c, and its version moves past npm's 0.2.3, which pins none", () => {
  assert.ok(BOOK_DEPLOYMENTS.some((d) => d.factory.address === BOOKS_V2C_DEPLOYMENT.factory.address), 'the tree pins v2c')
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
  assert.ok(newerThan(pkg.version, NPM_BEFORE_V2C), `the SDK is ${pkg.version}, the number npm holds without v2c or before it`)
})

test("a Book's settlement asset is its settler's word on a chosen settlement, and WETH read from nothing elsewhere", async () => {
  let named: Address = '0x0000000000000000000000000000000000000000'
  const chain = chainOf({ settleAssetFor: () => named, quoteOf: () => STONK })
  assert.equal(await readBookSettleAsset(chain, bookOn(SETTLE_IN_BASE)), WETH, 'unset reads as WETH')
  named = STONK
  assert.equal(await readBookSettleAsset(chain, bookOn(SETTLE_IN_BASE)), STONK)
  named = PONS
  await assert.rejects(readBookSettleAsset(chain, bookOn(SETTLE_IN_BASE)), /neither WETH nor the Book's own base pair/)
  const none = chainOf({})
  assert.equal(await readBookSettleAsset(none, bookOn(V2)), WETH)
  assert.equal(await readBookSettleAsset(none, bookOn(GEN3)), WETH)
  assert.deepEqual(none.asked, [])
})

/** A signed sale of the vault's `tokenIn` for `tokenOut`, paying the vault, through the Mancer adapter of `d`. */
function saleQuote(d: BookDeployment, o: { tokenIn: Address; tokenOut: Address; salt?: string }) {
  const deadline = BigInt(NOW + 300)
  const route = executeData({ tokenIn: o.tokenIn, tokenOut: o.tokenOut, amountIn: 1_000_000n, minAmountOut: 990n, recipient: VAULT, deadline, feeBps: 2 })
  return { adapter: d.adapters.mancer!.address.toLowerCase(), tokenIn: o.tokenIn.toLowerCase(), tokenOut: o.tokenOut.toLowerCase(), amountIn: '1000000', minOut: '990', route, deadline: deadline.toString(), salt: o.salt ?? '9', signature: '0x12' }
}

test("a Book settled in its base pair sweeps that pair with no sale, sells WETH into it, and never sells for WETH", async () => {
  const chain = chainOf({ settleAssetFor: () => STONK, quoteOf: () => STONK })
  const book = bookOn(SETTLE_IN_BASE)
  const unsigned = (token: Address) => sweepLeftoverCall(SETTLE_IN_BASE, 7n, { adapter: '0x0000000000000000000000000000000000000000', tokenIn: token, tokenOut: '0x0000000000000000000000000000000000000000', amountIn: 0n, minOut: 0n, route: '0x', deadline: 0n, salt: 0n, signature: '0x' })
  const swept = await bookActCalls(chain, book, ME, 'sweepLeftover', { token: STONK }, TRUSTED.router)
  assert.equal(bookCallData(swept.expected.calls[0]!).data, bookCallData(unsigned(STONK)).data)
  await bookActCalls(chain, book, ME, 'sweepLeftover', { token: BOOK }, TRUSTED.router)
  await assert.rejects(bookActCalls(chain, book, ME, 'sweepLeftover', { token: WETH }, TRUSTED.router), /settlement asset \(its own base pair\) or its own token/)
  // a signed sweep sells into the asset
  const hold = async () => {}
  const intoBase = saleQuote(SETTLE_IN_BASE, { tokenIn: WETH, tokenOut: STONK })
  const ok = await bookActCalls(chain, book, ME, 'sweepLeftover', { quote: intoBase, trustQuote: true }, TRUSTED.router, hold)
  assert.equal(bookCallData(ok.expected.calls[0]!).data, bookCallData(sweepLeftoverCall(SETTLE_IN_BASE, 7n, parseBookQuote(intoBase))).data)
  await assert.rejects(bookActCalls(chain, book, ME, 'sweepLeftover', { quote: saleQuote(SETTLE_IN_BASE, { tokenIn: PONS, tokenOut: WETH }), trustQuote: true }, TRUSTED.router, hold), /sells for the Book's settlement asset/)
  await assert.rejects(bookActCalls(chain, book, ME, 'sweepLeftover', { quote: saleQuote(SETTLE_IN_BASE, { tokenIn: STONK, tokenOut: STONK }), trustQuote: true }, TRUSTED.router, hold), /sells nothing/)
  // a Book that settles in WETH sweeps WETH unsigned and refuses a sale for any other token, as it always did
  const gen3 = chainOf({})
  await bookActCalls(gen3, bookOn(GEN3), ME, 'sweepLeftover', { token: WETH }, TRUSTED.router)
  await assert.rejects(bookActCalls(gen3, bookOn(GEN3), ME, 'sweepLeftover', { token: STONK }, TRUSTED.router), /a sweep names WETH or the Book's own token/)
  await assert.rejects(bookActCalls(gen3, bookOn(GEN3), ME, 'sweepLeftover', { quote: saleQuote(GEN3, { tokenIn: PONS, tokenOut: STONK }), trustQuote: true }, TRUSTED.router, hold), /a sweep sells for WETH/)
  assert.deepEqual(gen3.asked, [])
})

test("a sweep's vault quote sells for the settlement asset the bot's node reads", () => {
  const answer = (tokenOut: Address) => ({ purpose: 'sweep', ...saleQuote(SETTLE_IN_BASE, { tokenIn: PONS, tokenOut }), vault: VAULT.toLowerCase() }) as never
  const body = { purpose: 'sweep', tokenIn: PONS } as const
  assert.throws(() => checkVaultQuote(answer(STONK), body, bookOn(SETTLE_IN_BASE), TRUSTED.router), /read on your node/)
  assert.ok(checkVaultQuote(answer(STONK), body, bookOn(SETTLE_IN_BASE), TRUSTED.router, STONK))
  assert.throws(() => checkVaultQuote(answer(WETH), body, bookOn(SETTLE_IN_BASE), TRUSTED.router, STONK), /its own base pair/)
  // an answer that names the asset it counts in names the settler's, whether it sells or not
  const named = (tokenOut: Address, asset: Address, route = true) => ({ ...(answer(tokenOut) as object), ...(route ? {} : { route: '0x', adapter: '0x0000000000000000000000000000000000000000' }), settleAsset: { token: asset.toLowerCase() } }) as never
  assert.ok(checkVaultQuote(named(STONK, STONK), body, bookOn(SETTLE_IN_BASE), TRUSTED.router, STONK))
  assert.throws(() => checkVaultQuote(named(STONK, WETH), body, bookOn(SETTLE_IN_BASE), TRUSTED.router, STONK), /another settlement asset/)
  assert.throws(() => checkVaultQuote(named(STONK, WETH, false), { purpose: 'sweep', tokenIn: PONS }, bookOn(SETTLE_IN_BASE), TRUSTED.router, STONK), /another settlement asset/)
  // a Book that settles in WETH sweeps for WETH, named or not
  const gen3 = (tokenOut: Address) => ({ purpose: 'sweep', ...saleQuote(GEN3, { tokenIn: PONS, tokenOut }), vault: VAULT.toLowerCase() }) as never
  assert.ok(checkVaultQuote(gen3(WETH), body, bookOn(GEN3), TRUSTED.router))
  assert.throws(() => checkVaultQuote(gen3(STONK), { ...body, tokenOut: STONK }, bookOn(GEN3), TRUSTED.router), /a sweep sells for WETH/)
})

test("a settlement in the base pair sells every token into it, and an answer naming another asset than the settler's is refused", async () => {
  const chain = chainOf({ settleAssetFor: () => STONK, quoteOf: () => STONK })
  const book = bookOn(SETTLE_IN_BASE)
  const answerOf = (quotes: ReturnType<typeof saleQuote>[], asset?: Address) => ({ bookId: '7', vault: VAULT.toLowerCase(), quotes, preSync: null, ...(asset ? { asset: { token: asset.toLowerCase() } } : {}) })
  const ok = [saleQuote(SETTLE_IN_BASE, { tokenIn: WETH, tokenOut: STONK }), saleQuote(SETTLE_IN_BASE, { tokenIn: PONS, tokenOut: STONK, salt: '10' })]
  const calls = await settlementCalls(chain, book, ME, answerOf(ok, STONK) as never, TRUSTED.router)
  assert.equal(bookCallData(calls.calls[0]!).data, bookCallData(liquidateCall(SETTLE_IN_BASE, 7n, ok.map((q) => parseBookQuote(q)))).data)
  await settlementCalls(chain, book, ME, answerOf(ok) as never, TRUSTED.router)
  await assert.rejects(settlementCalls(chain, book, ME, answerOf(ok, WETH) as never, TRUSTED.router), /another settlement asset/)
  await assert.rejects(settlementCalls(chain, book, ME, answerOf([saleQuote(SETTLE_IN_BASE, { tokenIn: PONS, tokenOut: WETH })]) as never, TRUSTED.router), /settlement asset/)
  await assert.rejects(settlementCalls(chain, book, ME, answerOf([saleQuote(SETTLE_IN_BASE, { tokenIn: STONK, tokenOut: STONK })]) as never, TRUSTED.router), /settlement asset or the Book token/)
  // a Book that settles in WETH: sales for WETH, as always, and none of WETH
  const gen3 = chainOf({})
  await settlementCalls(gen3, bookOn(GEN3), ME, answerOf([saleQuote(GEN3, { tokenIn: PONS, tokenOut: WETH })]) as never, TRUSTED.router)
  await assert.rejects(settlementCalls(gen3, bookOn(GEN3), ME, answerOf([saleQuote(GEN3, { tokenIn: WETH, tokenOut: STONK })]) as never, TRUSTED.router), /pay WETH/)
})

test("a redemption of a Book settled in its base pair is counted in that pair, its cost basis at the rate the pad froze", async () => {
  const me = getAddress('0x' + '70'.repeat(20))
  const balances: Record<string, bigint> = { [`${BOOK}:${me}`]: 50n * E, [`${STONK}:${VAULT}`]: 500n * E, [`${WETH}:${VAULT}`]: E, [`${PONS}:${VAULT}`]: 4_000n * E }
  const chain = chainOf({
    settleAssetFor: () => STONK,
    quoteOf: () => STONK,
    // a WETH wei per 10^18 of STONK's units: one STONK is a thousandth of an ether
    ethPerQuoteOf: () => 10n ** 15n,
    settleOf: () => [true, 2_000n * E, 1_000n * E, 0n, 0n, 0n],
    navTotalOf: () => 2_000n * E,
    lpPotOf: () => 0n,
    costBasis: () => 2n * E,
    tradersOf: () => [ATTACKER],
    trackedTokens: () => [BOOK, PONS],
    balanceOf: ([holder], token) => balances[`${token}:${getAddress(holder as Address)}`] ?? 0n,
  })
  const r = await readBookRedemption(chain, bookOn(SETTLE_IN_BASE), me)
  assert.equal(r.asset, STONK)
  assert.equal(r.costBasis, 2_000n * E, 'two ether at a thousandth of an ether a STONK')
  // the asset and WETH count tracked or not, the Book's own token never
  assert.deepEqual(r.unswept, [{ token: STONK, amount: 500n * E }, { token: WETH, amount: E }, { token: PONS, amount: 4_000n * E }])
  // the asset sweeps at its balance; WETH and PONS at the caller's price in the asset
  const priced = bookRedeemPayouts(r, 50n * E, (u) => (u.token === WETH ? 1_000n * E : null))!
  assert.equal(priced.now, 100n * E, '2,000 STONK over 1,000 tokens, 50 of them')
  assert.deepEqual(priced.unpriced, [PONS])
  assert.ok(priced.afterSweeps > priced.now)
  // with no price at all the asset's own sweep still adds
  const bare = bookRedeemPayouts(r, 50n * E, () => null)!
  assert.ok(bare.afterSweeps > bare.now && bare.afterSweeps < priced.afterSweeps)
  // a pad that froze no rate leaves a Book settled in its base pair unmeasured: refused
  const unrated = chainOf({ ...Object.fromEntries(['settleAssetFor', 'quoteOf'].map((k) => [k, () => STONK])), ethPerQuoteOf: () => 0n, settleOf: () => [true, 0n, 1n, 0n, 0n, 0n], navTotalOf: () => 0n, lpPotOf: () => 0n, costBasis: () => E, tradersOf: () => [], trackedTokens: () => [], balanceOf: () => 0n })
  await assert.rejects(readBookRedemption(unrated, bookOn(SETTLE_IN_BASE), me), /no WETH rate/)
})

test("a vault quote's digest is its Book's domain: the deployment's name, never a constant", () => {
  const quote = { adapter: getAddress('0x' + 'ad'.repeat(20)), tokenIn: PONS, tokenOut: WETH, amountIn: 10n * E, minOut: 4n * 10n ** 15n, route: ('0x' + 'ab'.repeat(40)) as Hex, deadline: 4_000_000_000n, salt: 76n }
  const domain = (name: string) => ({ name, version: '1', chainId: 4663, verifyingContract: VAULT })
  assert.equal(bookQuoteDigest(bookOn(SETTLE_IN_BASE), quote), hashBookQuote(domain('Mancer Books'), quote))
  assert.equal(bookQuoteDigest(bookOn(V2), quote), hashBookQuote(domain('TOKENIZE.FUN'), quote))
  // a bare vault names its domain: the pinned deployments sign under two names (the Books contracts' and v2c's)
  assert.throws(() => bookQuoteDigest(VAULT, quote), /more than one EIP-712 name/)
  assert.equal(bookQuoteDigest(VAULT, quote, 4663, 'TOKENIZE.FUN'), hashBookQuote(domain('TOKENIZE.FUN'), quote))
  assert.equal(bookQuoteDigest(VAULT, quote, 4663, 'Mancer Books'), hashBookQuote(domain('Mancer Books'), quote))
})

test('an open is on the factory new Books open on: never the stack of 2026-11-03', () => {
  const id = 'e'.repeat(32)
  const terms = { traders: [ME], durationSecs: 604_800 }
  const open = (d: BookDeployment) => bookCallData(openBookCall(d, openBookParamsOf(terms, { name: 'Mine', symbol: 'MINE' })))
  const answer = (d: BookDeployment) => ({
    chainId: 4663, wallet: ME.toLowerCase(), simulation: SIM_OK, readAfter: null,
    steps: [{ kind: 'open', to: open(d).to.toLowerCase(), data: open(d).data, value: '0', gas: '100000', why: '' }],
    draft: { id, factory: d.factory.address.toLowerCase(), name: 'Mine', symbol: 'MINE' }, bind: { method: 'PATCH', path: `/v1/books/drafts/${id}` },
  }) as never
  const e = (d: BookDeployment) => ({ wallet: ME, draftId: id, open: openBookParamsOf(terms, { name: 'Mine', symbol: 'MINE' }), factory: d.factory.address, deployments: [GEN3, V2] })
  assert.ok(checkDraftOpenSteps(answer(GEN3), e(GEN3)))
  assert.throws(() => checkDraftOpenSteps(answer(V2), e(V2)), /opens no new Books/)
})

test('M1: a settlement names the asset its sales pay for the sender, and whether an answer pays an asset is read off every sale', async () => {
  const chain = chainOf({ settleAssetFor: () => STONK, quoteOf: () => STONK })
  const sales = [saleQuote(SETTLE_IN_BASE, { tokenIn: WETH, tokenOut: STONK })]
  const answer = { bookId: '7', vault: VAULT.toLowerCase(), quotes: sales, preSync: null, asset: { token: STONK.toLowerCase() } }
  const calls = await settlementCalls(chain, bookOn(SETTLE_IN_BASE), ME, answer as never, TRUSTED.router)
  assert.deepEqual(calls.settlesIn, { settler: getAddress(SETTLE_IN_BASE.settler.address), abiSet: SETTLE_IN_BASE.abiSet, bookId: 7n, pays: STONK })
  const liquidate = bookCallData(calls.calls[0]!)
  const checked = checkExactBookCalls('book', { chainId: 4663, wallet: ME.toLowerCase(), steps: [{ kind: 'liquidate', to: liquidate.to.toLowerCase(), data: liquidate.data, value: '0', gas: '400000', why: '' }], simulation: SIM_OK, readAfter: null } as never, ME, calls)
  assert.deepEqual(checked.readings[0]!.settlesIn, calls.settlesIn)
  // a settler that settles in WETH names none: nothing to read again
  const gen3 = await settlementCalls(chainOf({}), bookOn(GEN3), ME, { ...answer, quotes: [saleQuote(GEN3, { tokenIn: PONS, tokenOut: WETH })], asset: undefined } as never, TRUSTED.router)
  assert.equal(gen3.settlesIn, undefined)
  assert.equal(settlementPaysAsset(answer, STONK), true)
  assert.equal(settlementPaysAsset(answer, WETH), false)
  assert.equal(settlementPaysAsset({ ...answer, asset: undefined }, STONK), true, 'an answer that names no asset is read off its sales')
  assert.equal(settlementPaysAsset({ ...answer, quotes: [...sales, saleQuote(SETTLE_IN_BASE, { tokenIn: PONS, tokenOut: WETH })], asset: undefined }, STONK), false)
})

test('M1: where the asset moved after Mancer signed, settleSteps asks once more, and the sender sends nothing once it moves again', async () => {
  const sales = (asset: Address) => (asset === STONK ? [saleQuote(SETTLE_IN_BASE, { tokenIn: WETH, tokenOut: STONK })] : [saleQuote(SETTLE_IN_BASE, { tokenIn: STONK, tokenOut: WETH })])
  // Mancer signs into the asset it reads at the head; the first answer was signed before the creator moved it to WETH
  let signedInto: Address = STONK
  let onChain: Address = WETH
  let asked = 0
  const answer = () => {
    asked++
    const quotes = sales(signedInto)
    const liquidate = bookCallData(liquidateCall(SETTLE_IN_BASE, 7n, quotes.map((q) => parseBookQuote(q))))
    const body = {
      head: { block: 100, timestamp: NOW }, deployment: { factory: SETTLE_IN_BASE.factory.address.toLowerCase(), abiSet: SETTLE_IN_BASE.abiSet, label: SETTLE_IN_BASE.label },
      bookId: '7', vault: VAULT.toLowerCase(), quotes, unquoted: [], call: { to: liquidate.to.toLowerCase(), data: liquidate.data, value: '0' }, preSync: null,
      asset: { token: signedInto.toLowerCase(), symbol: signedInto === STONK ? 'STONK' : 'WETH', decimals: 18, isWeth: signedInto === WETH, source: 'chosen', choosable: false },
      ready: { chainId: 4663, wallet: ME.toLowerCase(), steps: [{ kind: 'liquidate', to: liquidate.to.toLowerCase(), data: liquidate.data, value: '0', gas: '400000', why: '' }], simulation: SIM_OK, readAfter: null },
    }
    signedInto = onChain
    return { body }
  }
  const { api, m, sent } = await stand(SETTLE_IN_BASE, { 'POST /v1/books/:token/liquidation-quotes': answer }, { settleAssetFor: () => onChain, quoteOf: () => STONK })
  try {
    const r = await m.settleSteps(BOOK)
    assert.equal(asked, 2, 'asked once more, where the first sales paid another asset than the settler names')
    assert.equal(r.checked.readings.at(-1)!.settlesIn?.pays, WETH)
    // the creator moves it back before the settlement goes: nothing is sent
    onChain = STONK
    await assert.rejects(m.sendSteps(r.checked), /now settles in .* so nothing more was sent/)
    assert.equal(sent.length, 0)
    // as it was: sent
    onChain = WETH
    await m.sendSteps(r.checked)
    assert.equal(sent.length, 1)
  } finally {
    await api.close()
  }
})
