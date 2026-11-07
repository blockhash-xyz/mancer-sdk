import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Address } from 'viem'
import { checkExactBookCalls, raiseCalls } from '@blockhash/mancer-sdk'
import { BOOK_BONDING_GAS } from '../../sdk/src/checks'
import { BOOK_DEPLOYMENTS, bookCallData, buyEthCall } from '../../sdk/src/shared'
import { transactionsOf } from '../src/checks'
import { BOOK, BOOK_ID, VAULT, WETH } from './helpers'

/**
 * `build_book_raise_trade` on TraderBookPadV2: a buy quoted in the seconds before `minBondAt` that reaches the mark lands
 * after it, closes the curve and tries the bond in its own transaction, so where the raise quote says the buy may bond
 * (`mayBond`, whatever `closesCurve` says at the quote's second) its transaction keeps the kit's bonding gas. The tool
 * rebuilds the call with the SDK's `raiseCalls`, and names the gas through its own `transactionsOf`.
 */

const TAKER = '0x00000000000000000000000000000000000000a1' as Address
const V2 = BOOK_DEPLOYMENTS.find((d) => d.label === 'books-1103')!

test("the raise tool carries the quote's mayBond into the call it rebuilds, beside closesCurve", () => {
  const src = readFileSync(fileURLToPath(new URL('../src/tools-books.ts', import.meta.url)), 'utf8')
  assert.match(src, /const mayBond = \(answer as \{ mayBond\?: unknown \}\)\.mayBond === true/)
  assert.match(src, /raiseCalls\(chain, book, base, wallet, \{ side: a\.side, amountIn: raw, payWith, closesCurve, mayBond \}, minOut\)/)
})

test('a buy the quote says may bond, and that does not close the curve at its second, is sent with the bonding gas', async () => {
  const book = { deployment: V2, token: BOOK as Address, bookId: BOOK_ID, vault: VAULT as Address }
  const { expected } = await raiseCalls({} as never, book, WETH as Address, TAKER, { side: 'buy', amountIn: 1_000n, payWith: 'eth', closesCurve: false, mayBond: true }, 4_950n)
  assert.equal(expected.mayBond, true)
  const c = bookCallData(buyEthCall(V2, BOOK_ID, 4_950n, TAKER, 1_000n))
  const ready = { chainId: 4663, wallet: TAKER, simulation: { ok: true }, readAfter: null, steps: [{ kind: 'buy', to: c.to, data: c.data, value: '1000', gas: '180000', why: 'Buys on the curve.' }] }
  assert.equal(transactionsOf(checkExactBookCalls('book', ready as never, TAKER, expected))[0]!.gas, BOOK_BONDING_GAS.toString())
  // neither word: the API's own gas
  const plain = await raiseCalls({} as never, book, WETH as Address, TAKER, { side: 'buy', amountIn: 1_000n, payWith: 'eth', closesCurve: false, mayBond: false }, 4_950n)
  assert.equal(transactionsOf(checkExactBookCalls('book', ready as never, TAKER, plain.expected))[0]!.gas, '180000')
})
