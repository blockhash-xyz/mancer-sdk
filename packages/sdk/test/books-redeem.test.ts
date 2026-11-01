import test from 'node:test'
import assert from 'node:assert/strict'
import { getAddress, type Address, type Hex } from 'viem'
import { BOOK_DEPLOYMENTS, BOOK_SHARED } from '../src/kit/books/deployments'
import { BOOK_EIP712_NAME, BOOK_EIP712_VERSION, hashBookQuote } from '../src/kit/books/typed-data'
import { bookQuoteDigest, bookRedeemPayouts, readBookRedemption, type ChainBook } from '../src/index'

// A vault quote's digest as the vault keys it, and a settled Book's redemption read from its settler, its factory and its
// vault: what pays now, and what a sweep of each token still on the vault would add.

const VAULT = getAddress('0x' + 'bb'.repeat(20))
const BOOK = getAddress('0x' + 'aa'.repeat(20))
const PONS = getAddress('0x39dbed3a2bd333467115de45665cc57f813c4571')
const DEAD = getAddress('0x' + 'de'.repeat(20))
const WETH = getAddress(BOOK_SHARED.weth)
const E = 10n ** 18n

const quote = { adapter: getAddress('0x' + 'ad'.repeat(20)), tokenIn: PONS, tokenOut: WETH, amountIn: 10n * E, minOut: 4n * 10n ** 15n, route: ('0x' + 'ab'.repeat(40)) as Hex, deadline: 4_000_000_000n, salt: 76n }

test("a vault quote's digest is its MancerQuote under the vault's own domain, and every field of the quote moves it", () => {
  const d = bookQuoteDigest(VAULT, quote)
  assert.equal(d, hashBookQuote({ name: BOOK_EIP712_NAME, version: BOOK_EIP712_VERSION, chainId: 4663, verifyingContract: VAULT }, quote))
  assert.equal(bookQuoteDigest(VAULT.toLowerCase() as Address, { ...quote, tokenIn: PONS.toLowerCase() as Address }), d, 'an address in any case is the same quote')
  for (const other of [{ deadline: quote.deadline + 1n }, { minOut: quote.minOut - 1n }, { route: ('0x' + 'ac'.repeat(40)) as Hex }, { salt: 77n }]) {
    assert.notEqual(bookQuoteDigest(VAULT, { ...quote, ...other }), d, JSON.stringify(other, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)))
  }
  assert.notEqual(bookQuoteDigest(getAddress('0x' + 'bc'.repeat(20)), quote), d, "another vault's domain")
})

/** A chain that answers the settler's, the factory's and the vault's reads, and each token's balance by holder. */
function chain(o: { liquidated?: boolean; holderPot: bigint; circulating: bigint; tracked: Address[]; balances: Record<string, bigint> }) {
  const d = BOOK_DEPLOYMENTS[0]!
  const reads: string[] = []
  return {
    reads,
    book: { deployment: d, token: BOOK, bookId: 7n, vault: VAULT } as ChainBook,
    readContract: async (r: { address: Address; functionName: string; args?: readonly unknown[] }) => {
      reads.push(r.functionName)
      switch (r.functionName) {
        case 'settleOf':
          return [o.liquidated ?? true, o.holderPot, o.circulating, 0n, 0n, 0n]
        case 'navTotalOf':
          return o.holderPot
        case 'lpPotOf':
          return 0n
        case 'costBasis':
          return o.holderPot
        case 'tradersOf':
          return [DEAD]
        case 'trackedTokens':
          return o.tracked
        case 'balanceOf':
          return o.balances[`${getAddress(r.address)}:${getAddress(r.args![0] as Address)}`] ?? 0n
      }
      throw new Error(`no read ${r.functionName}`)
    },
  }
}

test("a redemption pays the pot's share as it stands, and a sweep of what the vault still holds adds to it", async () => {
  const me = getAddress('0x' + '70'.repeat(20))
  const c = chain({ holderPot: 2n * E, circulating: 1_000n * E, tracked: [BOOK, PONS], balances: { [`${BOOK}:${me}`]: 50n * E, [`${WETH}:${VAULT}`]: E, [`${PONS}:${VAULT}`]: 4_000n * E, [`${BOOK}:${VAULT}`]: 9n * E } })
  const r = await readBookRedemption(c as never, c.book, me)
  assert.equal(r.held, 50n * E)
  assert.equal(r.liquidated, true)
  // WETH counts tracked or not, and the Book's own token, which its sweep burns, never
  assert.deepEqual(r.unswept, [{ token: WETH, amount: E }, { token: PONS, amount: 4_000n * E }])
  const priced = bookRedeemPayouts(r, 50n * E, (u) => (u.token === PONS ? E : null))
  assert.equal(priced!.now, E / 10n, '2 WETH over 1,000 tokens, 50 of them')
  assert.ok(priced!.afterSweeps > priced!.now)
  assert.deepEqual(priced!.unpriced, [])
  // a token no price reads is left out of the second figure, and named
  const unpriced = bookRedeemPayouts(r, 50n * E, () => null)
  assert.deepEqual(unpriced!.unpriced, [PONS])
  assert.ok(unpriced!.afterSweeps < priced!.afterSweeps && unpriced!.afterSweeps > unpriced!.now, 'the WETH sweep alone still adds')
  // the settler refuses more than circulates, and nothing
  assert.equal(bookRedeemPayouts(r, 1_001n * E, () => null), null)
  assert.equal(bookRedeemPayouts(r, 0n, () => null), null)
  // nothing left to sweep: both figures are the same
  const done = await readBookRedemption(chain({ holderPot: 2n * E, circulating: 1_000n * E, tracked: [BOOK], balances: {} }) as never, c.book, me)
  assert.deepEqual(done.unswept, [])
  const same = bookRedeemPayouts(done, 10n * E, () => null)!
  assert.equal(same.afterSweeps, same.now)
})
