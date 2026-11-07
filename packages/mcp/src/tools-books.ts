import { z } from 'zod'
import { getAddress, zeroAddress, type Address, type Hex } from 'viem'
import {
  bookActCalls,
  bookBasePairOf,
  bookLaunchDeployment,
  bookPadKind,
  bookSettlesInChosenAsset,
  checkBookSteps,
  checkDraftOpenSteps,
  checkExactBookCalls,
  checkVaultQuote,
  holdSignedFloor,
  openBookParamsOf,
  raiseCalls,
  readBookSettleAsset,
  readChainBook,
  settlementCalls,
  settlementPaysAsset,
  type BookAction,
  type BookActArgs,
  type BookStepsResponse,
  type BookVaultQuoteResponse,
  type ChainBook,
  type DraftOpenStepsResponse,
  type FloorRule,
  type ReadySteps,
} from '@blockhash/mancer-sdk'
import { seg } from './api'
import { chainOf, checking, settlementSendLine, structural, transactionsOf, trustedOf } from './checks'
import { address, amount, defaultOrNone, limit, tool, wallet, walletOf, type ToolContext, type ToolSpec } from './tool'
import { WETH, addressOf, amountOf, ask, badArgument, nextFor, rawOf, stepDoes, tokenInfos, ToolRefusal, type TokenInfo } from './values'

/**
 * Books: StonkBrokers' Trader Books on Mancer. A Book is a token whose raise funds a vault its traders run, settled to its
 * holders. The reads are the board's and a Book's own routes; every act is the API's ready-to-sign steps for the wallet
 * that sends it (`POST /v1/books/{token}/steps`, a raise trade's `raise-quote` and the settlement's `liquidation-quotes`
 * with `steps=1`), checked against the Book's phase and the wallet's role there; none needs a key, since the wallet's own
 * signature is what each waits on. A vault trade needs Mancer's signed quote first (`vault-quote`), which only a Book's
 * signed-in trader is given, and a settlement Mancer's signed sales: those, and a Book's record before its open, need a
 * signed-in wallet.
 *
 * Every build is held to the SDK's own check before it is answered, as the SDK's client holds it (checks.ts): the Book's id
 * and vault are read from its pinned factory on the chain (`readChainBook`; this server's own node where
 * `MANCER_MCP_RPC_URL` names one, the API's chain door otherwise), never taken from the answer, as are its base pair (the
 * pad's `quoteOf`) and every token's decimals (its own `decimals()`); each
 * act's own calls are rebuilt with the kit's builders from the arguments asked and what the chain reads (`bookActCalls`,
 * `raiseCalls`, `settlementCalls`, the kit's `openBook`), and every step must be one of those calls byte for byte, with an
 * exact approval of what it pulls before it where the allowance falls short (`checkBookSteps`, `checkExactBookCalls`,
 * `checkDraftOpenSteps`). A vault quote's route is held to the vault's own rules leg by leg (`checkVaultQuote`), a trade's
 * quote names the token it buys, and an act that signs a trade's floor holds it to the rule its caller names (minOut, or
 * trustQuote); a confirm or an execute names the pending trade it means (`expectPending`), and the vault's own pending
 * trade must be that one. A build that fails is refused `build-mismatch`.
 *
 * Each Book is read on its own deployment's rules. On TraderBookPadV2 (`claims` pads, StonkBrokers' stack of 2026-11-03 and
 * after) a curve sale names its recipient, the wallet that sells; `graduate` and a buy that closes the curve bond the Book
 * in the same transaction, so their transaction names the kit's bonding gas at least; and the pad keeps a claim ledger
 * (`padClaim`). A Book settles in its settlement asset, as its settler on the chain names it (`readBookSettleAsset`):
 * WETH on every deployment whose settler settles in WETH, and on one that settles in the base pair where chosen, the
 * Book's own base pair once a trader or its creator picks it (`setSettleAsset`, built until five minutes before the Book
 * ends: from its unlock a settlement may be in flight on sales signed into the asset as it stands, the settler runs none
 * once it moves, and the switch names no deadline). Every sale of its settlement and every sweep then pays that asset, and
 * its redemptions and the traders' cut are paid in it. A settlement's liquidation carries the settler's `settleAssetFor`
 * read as its precondition, which the agent makes right before it sends (checks.ts `settleAssetPrecondition`).
 */

const bookToken = z.string().describe("The Book's token address, which names the Book.")
const bookOf = (v: string) => addressOf(v, 'token')

/** The Book's token and its base pair, each with its decimals as its own contract answers them (values.ts `tokenInfos`):
 * never the Book page's word for either. */
async function bookUnits(ctx: ToolContext, token: Address, base: Address): Promise<{ book: TokenInfo; base: TokenInfo }> {
  const infos = await tokenInfos(ctx, [{ native: false, address: token }, { native: false, address: base }])
  return { book: infos.get(token)!, base: infos.get(base)! }
}

/** The Book a token is, as its pinned factory reads through the chain door. A token no pinned factory names is no Book:
 * that is the answer, before anything is built. */
async function chainBook(ctx: ToolContext, token: Address): Promise<ChainBook> {
  return checking(async () => {
    try {
      return await readChainBook(chainOf(ctx), getAddress(token))
    } catch (e) {
      if (e instanceof Error && e.name === 'MancerCheckError' && /no factory this SDK pins names that token/.test(e.message)) {
        throw new ToolRefusal({ error: 'No Books factory this server pins names that token as a Book.', code: 'not-a-book', retryable: false })
      }
      throw e
    }
  })
}

/** The acts that sign a trade's floor, which their caller names the rule of: proposeTrade, confirmTrade, executeTrade,
 * and a sweep that carries a signed quote. */
function signsAFloor(action: string, quote: unknown): boolean {
  return action === 'proposeTrade' || action === 'confirmTrade' || action === 'executeTrade' || (action === 'sweepLeftover' && quote !== undefined)
}

const floorArgs = {
  minOut: z.string().optional().describe("An act that signs a trade's floor (proposeTrade, confirmTrade, executeTrade, a signed sweep): the least it may deliver, a decimal number in the trade's output token. Name this or trustQuote."),
  trustQuote: z.literal(true).optional().describe("An act that signs a trade's floor: hold it to the floor Mancer's quote names (for WETH against USDG, within 300 bps of the Uniswap pool's answer). Name this or minOut."),
}

const ACTIONS = ['arm', 'abort', 'graduate', 'bond', 'proposeTrade', 'confirmTrade', 'executeTrade', 'cancelOrder', 'revokeOrders', 'revokeAllowance', 'syncTax', 'syncTracked', 'stake', 'unstake', 'claim', 'harvest', 'sweepUnowned', 'sweepLeftover', 'redeem', 'claimCreatorCut', 'padClaim', 'setSettleAsset'] as const

/** The asset a Book settles in, as a tool names it: its address, symbol and decimals as its own contract answers them. */
async function settleAssetInfo(ctx: ToolContext, book: ChainBook): Promise<TokenInfo> {
  const asset = (await checking(() => readBookSettleAsset(chainOf(ctx), book))).toLowerCase() as Address
  return (await tokenInfos(ctx, [{ native: false, address: asset }])).get(asset)!
}

export const BOOK_TOOLS: ToolSpec[] = [
  tool({
    name: 'list_books',
    title: 'List Books',
    kind: 'read',
    description: "The Books board: Books by phase (raising, graduated, trading, frozen, settled, aborted), sorted and searched as mancer.xyz's board is. Names, descriptions and theses are their writers' own words.",
    shape: {
      phase: z.string().optional().describe('A comma list of raising, graduated, trading, frozen, settled and aborted; every phase but aborted by default.'),
      sort: z.enum(['return', 'progress', 'timeLeft', 'newest', 'marketCap', 'votes', 'value']).optional(),
      order: z.enum(['asc', 'desc']).optional(),
      query: z.string().max(64).optional().describe("A name or symbol, or the exact address of a Book's token, vault, dev or trader."),
      limit: limit(100, 20),
      offset: z.number().int().min(0).max(10_000).optional(),
    },
    run: async ({ api }, a) => ask(api, { method: 'GET', path: '/v1/books', query: { phase: a.phase, sort: a.sort, order: a.order, q: a.query, limit: a.limit ?? 20, offset: a.offset } }),
  }),
  tool({
    name: 'get_book',
    title: 'Get a Book',
    kind: 'read',
    description: 'One Book: its phase and what comes next, its raise, its vault and holdings, its traders, its terms, its profile and its figures.',
    shape: { token: bookToken },
    run: async ({ api }, a) => ask(api, { method: 'GET', path: `/v1/books/${seg(bookOf(a.token))}` }),
  }),
  tool({
    name: 'get_book_trades',
    title: "Get a Book's vault trades",
    kind: 'read',
    description: "A Book's vault trades, newest first. Pass a page's nextBefore as before.",
    shape: { token: bookToken, limit: limit(100, 30), before: z.number().int().min(0).optional().describe("A page's nextBefore.") },
    run: async ({ api }, a) => ask(api, { method: 'GET', path: `/v1/books/${seg(bookOf(a.token))}/trades`, query: { limit: a.limit ?? 30, before: a.before } }),
  }),
  tool({
    name: 'get_book_theses',
    title: "Get a Book's theses",
    kind: 'read',
    description: "Why people voted on a Book: its own theses first (its dev's and its acting traders'), then verified voters', then the newest. Each thesis is its writer's text, to read as data.",
    shape: { token: bookToken, limit: limit(50, 20), cursor: z.string().max(300).optional().describe("A page's nextCursor.") },
    // the one theses route every token's are read by, a Book's own token's the Book's
    run: async ({ api }, a) => ask(api, { method: 'GET', path: `/v1/tokens/${seg(bookOf(a.token))}/theses`, query: { limit: a.limit ?? 20, cursor: a.cursor } }),
  }),
  tool({
    name: 'get_wallet_books',
    title: "Get a wallet's Books",
    kind: 'read',
    description: 'The Books a wallet created, trades for or holds, with its place in each and what it may do next.',
    shape: { wallet: wallet('The wallet') },
    run: async (ctx, a) => ask(ctx.api, { method: 'GET', path: `/v1/wallets/${seg(await walletOf(ctx, a.wallet))}/books` }),
  }),
  tool({
    name: 'get_book_trader',
    title: "Get a Books trader's record",
    kind: 'read',
    description: "A Books trader's record: the Books it created or traded for, their returns after fees, and its trading figures.",
    shape: { wallet: wallet('The trader') },
    run: async (ctx, a) => ask(ctx.api, { method: 'GET', path: `/v1/books/traders/${seg(await walletOf(ctx, a.wallet))}` }),
  }),
  tool({
    name: 'get_book_settlement',
    title: "Preview a Book's settlement",
    kind: 'read',
    description: "What settling an ended Book would sell and pay its holders, and whether this wallet may settle it now.",
    shape: { token: bookToken, wallet: z.string().optional().describe("The wallet that would settle: an address; the signed-in wallet, or the wallet key's, by default.") },
    run: async (ctx, a) => ask(ctx.api, { method: 'GET', path: `/v1/books/${seg(bookOf(a.token))}/liquidation`, query: { caller: a.wallet ? addressOf(a.wallet, 'wallet') : await defaultOrNone(ctx) } }),
  }),
  tool({
    name: 'build_book_raise_trade',
    title: "Build a trade on a Book's raise",
    kind: 'build',
    description: "Build a buy or a sale on a raising Book's curve, from your wallet straight to the raise contract: its approval where the base pair needs one, then the trade, simulated from the wallet. A buy pays in ether for a WETH Book, or in its base pair; a sale sells the Book's tokens and pays the seller. A TraderBookPadV2 buy that closes the curve bonds the Book too: send it with the gas it names. The call is rebuilt here from the Book's factory and pad and held byte for byte, its floor at least the quote less slippageBps, or the build is refused build-mismatch. Needs no key.",
    shape: {
      token: bookToken,
      side: z.enum(['buy', 'sell']),
      amount: amount("What is spent: the base pair (or ether) for a buy, the Book's tokens for a sale"),
      wallet: wallet('The wallet that signs and sends'),
      payWith: z.enum(['eth', 'quote']).optional().describe("What a buy pays with, or a sale pays out: eth (a WETH Book's default) or quote, the base pair."),
      slippageBps: z.number().int().min(1).max(500).optional().describe('The floor under the quote, in basis points; 100 by default.'),
      minOut: z.string().optional().describe('The least the trade may deliver, a decimal number in what it delivers: the floor is held to it as well.'),
    },
    run: async (ctx, a) => {
      const token = bookOf(a.token)
      const wallet = await walletOf(ctx, a.wallet)
      const slippage = a.slippageBps ?? 100
      const chain = chainOf(ctx)
      const book = await chainBook(ctx, token)
      // the base pair is the pad's own word for the Book, read on the chain, and every decimal its contract's
      const base = await checking(() => bookBasePairOf(chain, book))
      const u = await bookUnits(ctx, token, base.toLowerCase() as Address)
      const payWith = a.payWith ?? (u.base.address === WETH ? 'eth' : 'quote')
      const ETH: TokenInfo = { address: zeroAddress, symbol: 'ETH', decimals: 18 }
      const spent = a.side === 'sell' ? u.book : payWith === 'eth' ? ETH : u.base
      const received = a.side === 'sell' ? (payWith === 'eth' ? ETH : u.base) : u.book
      const raw = rawOf(a.amount, spent.decimals, 'amount')
      const named = a.minOut !== undefined ? rawOf(a.minOut, received.decimals, 'minOut') : null
      const answer = await ask<Record<string, unknown>>(ctx.api, {
        method: 'GET', path: `/v1/books/${seg(token)}/raise-quote`,
        query: { side: a.side, amountIn: raw.toString(), payWith, taker: wallet, slippageBps: slippage, steps: '1' },
      })
      if (!answer.ready) throw new ToolRefusal({ error: 'The raise answered no transaction to sign.', code: 'steps-unavailable', retryable: true })
      const mismatch = (why: string) => new ToolRefusal({ error: `The build does not read back as asked (book): ${why}. Nothing was answered to sign.`, code: 'build-mismatch', retryable: false, detail: { check: 'book', step: null } })
      if (answer.side !== a.side || answer.payWith !== payWith) throw mismatch('the raise quote is for another side or another way to pay')
      if (String(answer.bookId) !== book.bookId.toString()) throw mismatch('the raise quote names another Book id than the Book its factory reads')
      if (!/^\d{1,78}$/.test(String(answer.amountIn)) || BigInt(String(answer.amountIn)) !== raw) throw mismatch('the raise quote trades another amount')
      if (!/^\d{1,78}$/.test(String(answer.minOut)) || !/^\d{1,78}$/.test(String(answer.amountOut))) throw mismatch('the raise quote names no floor')
      const minOut = BigInt(String(answer.minOut))
      const quoted = BigInt(String(answer.amountOut))
      // the floor is the quote less the slippage asked, and the caller's own where it names one: never the answer's alone
      const floor = (quoted * BigInt(10_000 - slippage)) / 10_000n
      if (minOut <= 0n || minOut < floor) throw mismatch(`the raise's floor, ${minOut}, is under the quote less ${slippage} bps (${floor})`)
      if (named !== null && minOut < named) throw mismatch(`the raise's floor, ${minOut}, is under the ${named} you named`)
      // a TraderBookPadV2 buy that closes the curve bonds in the same transaction, and one quoted in the seconds before
      // `minBondAt` that reaches the mark lands after it and closes it all the same: where the answer says it closes the
      // curve or may (`mayBond`), its transaction keeps the kit's bonding gas
      const closesCurve = answer.closesCurve === true
      const mayBond = (answer as { mayBond?: unknown }).mayBond === true
      const { expected } = await checking(() => raiseCalls(chain, book, base, wallet, { side: a.side, amountIn: raw, payWith, closesCurve, mayBond }, minOut))
      const ready = answer.ready as ReadySteps & { error?: unknown; code?: unknown }
      if (typeof ready.error === 'string' && typeof ready.code === 'string') throw new ToolRefusal({ error: ready.error.slice(0, 600), code: ready.code, retryable: ready.code === 'steps-unavailable' })
      const checked = await checking(() => checkExactBookCalls('book', structural(ready), wallet, expected))
      const infos = new Map([[u.base.address, u.base], [u.book.address, u.book]])
      const simulation = ready.simulation ?? null
      return {
        wallet,
        side: a.side,
        spends: amountOf(raw, spent),
        expectedOut: amountOf(quoted, received),
        minOut: amountOf(minOut, received),
        taxBps: answer.taxBps ?? null,
        ...(bookPadKind(book.deployment) === 'claims' ? { pad: 'claims', closesCurve, mayBond } : {}),
        transactions: transactionsOf(checked, (step) => stepDoes(step, infos)),
        simulation,
        next: nextFor(simulation, wallet, `Sign and send each transaction in order from ${wallet}, each only after the one before it landed.`),
      }
    },
  }),
  tool({
    name: 'build_book_act',
    title: 'Build an act on a Book',
    kind: 'build',
    description: "Build one act on a Book for the wallet that sends it, simulated from it: arm, abort, graduate, bond, a vault trade's propose, confirm and execute, staking and pool fees, sweeps, redemptions and the traders' cut (in the Book's settlement asset), padClaim on a TraderBookPadV2 pad, and setSettleAsset where a Book may settle in its base pair. The API checks the phase and the wallet's role; the call is rebuilt here byte for byte, or refused build-mismatch. An act that signs a trade's floor names minOut or trustQuote; a confirm or execute names its pending trade (expectPending). Needs no key.",
    shape: {
      token: bookToken,
      action: z.enum(ACTIONS).describe('The act.'),
      wallet: wallet('The wallet that signs and sends'),
      quote: z.record(z.string(), z.unknown()).optional().describe("proposeTrade, and sweepLeftover of a token other than the Book's settlement asset and its own: the signed quote get_book_vault_quote answered, unused."),
      sweepToken: z.string().optional().describe("sweepLeftover of the Book's settlement asset (WETH unless the Book settles in its base pair) or of its own token, and revokeAllowance: the token's address."),
      unwrap: z.boolean().optional().describe('padClaim on a WETH Book: false takes the claim as WETH; it is paid as ether otherwise.'),
      inQuote: z.boolean().optional().describe("setSettleAsset: true settles the Book in its own base pair, false in WETH. Built until five minutes before the Book ends."),
      spender: z.string().optional().describe('cancelOrder and revokeAllowance: the order book the grant names.'),
      orderHash: z.string().optional().describe("cancelOrder: the granted order's hash."),
      tokens: z.array(z.string()).max(16).optional().describe('syncTracked: the tokens to sync.'),
      amount: z.string().optional().describe("stake, unstake and redeem: the Book's tokens, a decimal number, or all."),
      expectPending: z.object({
        salt: z.string().regex(/^(0|[1-9][0-9]{0,77})$/).describe("The quote's salt, a whole number."),
        tokenIn: z.string().describe('What the trade sells: an address.'),
        tokenOut: z.string().describe('What the trade buys: an address.'),
        amountIn: z.string().regex(/^[1-9][0-9]{0,77}$/).describe('What it sells, in raw units.'),
        minOut: z.string().regex(/^[1-9][0-9]{0,77}$/).describe('Its signed floor, in raw units.'),
      }).strict().optional().describe("confirmTrade and executeTrade: the pending trade you mean, as the signed quote that proposed it names it (get_book_vault_quote's salt, tokenIn, tokenOut, amountIn and minOut). The act is refused where the vault holds another pending trade."),
      ...floorArgs,
    },
    run: async (ctx, a) => {
      const token = bookOf(a.token)
      const wallet = await walletOf(ctx, a.wallet)
      const action = a.action as BookAction
      if (signsAFloor(action, a.quote)) {
        if ((a.minOut === undefined) === (a.trustQuote === undefined)) throw badArgument(`${action} signs a trade's floor: name minOut (the least it delivers) or trustQuote: true, one of the two.`, 'floor-required')
      } else if (a.minOut !== undefined || a.trustQuote !== undefined) {
        throw badArgument(`${action} signs no trade's floor: minOut and trustQuote are for proposeTrade, confirmTrade, executeTrade and a signed sweep.`, 'bad-argument')
      }
      // the pending trade a confirm or an execute acts on is the one the caller means, named, never whichever the vault holds
      const actsOnPending = action === 'confirmTrade' || action === 'executeTrade'
      if (actsOnPending && a.expectPending === undefined) throw badArgument(`${action} acts on the vault's pending trade: name it as expectPending (the salt, tokens, amountIn and minOut of the quote that proposed it), so another trade proposed in between is never the one ${action === 'confirmTrade' ? 'confirmed' : 'executed'}.`, 'pending-required')
      if (!actsOnPending && a.expectPending !== undefined) throw badArgument(`${action} acts on no pending trade: expectPending is for confirmTrade and executeTrade.`, 'bad-argument')
      if (a.unwrap !== undefined && action !== 'padClaim') throw badArgument(`${action} takes no unwrap: it is for padClaim.`, 'bad-argument')
      if (action === 'setSettleAsset' && a.inQuote === undefined) throw badArgument('setSettleAsset names what the Book settles in: inQuote true (its own base pair) or false (WETH).', 'bad-argument')
      if (action !== 'setSettleAsset' && a.inQuote !== undefined) throw badArgument(`${action} takes no inQuote: it is for setSettleAsset.`, 'bad-argument')
      if (a.orderHash !== undefined && !/^0x[0-9a-fA-F]{64}$/.test(a.orderHash)) throw badArgument('orderHash is 0x and 64 hex digits.', 'bad-hash')
      const chain = chainOf(ctx)
      const trusted = await trustedOf(ctx)
      const book = await chainBook(ctx, token)
      const args: BookActArgs = {}
      if (a.quote !== undefined) args.quote = a.quote
      if (a.sweepToken !== undefined) args.token = getAddress(addressOf(a.sweepToken, 'sweepToken'))
      if (a.spender !== undefined) args.spender = getAddress(addressOf(a.spender, 'spender'))
      if (a.orderHash !== undefined) args.orderHash = a.orderHash.toLowerCase() as Hex
      if (a.tokens !== undefined) args.tokens = (a.tokens as string[]).map((t) => getAddress(addressOf(t, 'tokens')))
      if (a.unwrap !== undefined) args.unwrap = a.unwrap
      if (a.inQuote !== undefined) args.inQuote = a.inQuote
      if (a.expectPending !== undefined) {
        const e = a.expectPending as { salt: string; tokenIn: string; tokenOut: string; amountIn: string; minOut: string }
        args.expectPending = { salt: BigInt(e.salt), tokenIn: getAddress(addressOf(e.tokenIn, 'expectPending.tokenIn')), tokenOut: getAddress(addressOf(e.tokenOut, 'expectPending.tokenOut')), amountIn: BigInt(e.amountIn), minOut: BigInt(e.minOut) }
      }
      let infos: Map<string, TokenInfo> | undefined
      if (a.amount !== undefined) {
        if (a.amount.trim().toLowerCase() === 'all') {
          args.amount = 'all'
        } else {
          const t = (await tokenInfos(ctx, [{ native: false, address: token }])).get(token)!
          args.amount = rawOf(a.amount, t.decimals, 'amount')
          infos = new Map([[t.address, t]])
        }
      }
      if (a.trustQuote === true) args.trustQuote = true
      if (a.minOut !== undefined) {
        // the trade's output token: the signed quote's, or the pending trade's the caller named (which the SDK holds the
        // vault's own pending trade to), never whichever the vault happens to hold
        const out = a.quote !== undefined ? (a.quote as { tokenOut?: unknown }).tokenOut : args.expectPending?.tokenOut
        if (typeof out !== 'string') throw badArgument('The trade names no output token to read minOut in.', 'bad-argument')
        const outToken = addressOf(out, 'the trade output')
        const info = (await tokenInfos(ctx, [{ native: false, address: outToken }])).get(outToken)!
        args.minOut = rawOf(a.minOut, info.decimals, 'minOut')
      }
      const hold = (q: { tokenIn: Address; tokenOut: Address; amountIn: bigint; minOut: bigint }) => holdSignedFloor('book', args as FloorRule, chain, trusted, q, q.minOut)
      const { expected, fields } = await checking(() => bookActCalls(chain, book, getAddress(wallet), action, args, trusted.router, hold))
      const answer = await ask<BookStepsResponse & { error?: unknown; code?: unknown }>(ctx.api, { method: 'POST', path: `/v1/books/${seg(token)}/steps`, body: { action, wallet, ...fields } })
      const checked = await checking(() => checkBookSteps(structural(answer), { wallet, token: book.token, action, bookId: book.bookId, vault: book.vault, expected }))
      const simulation = answer.simulation ?? null
      // what a sweep adds to the pot, a redemption pays and the traders' cut pays: the Book's settlement asset
      const paysIn = action === 'sweepLeftover' || action === 'redeem' || action === 'claimCreatorCut' ? await settleAssetInfo(ctx, book) : null
      return {
        action,
        book: answer.book ?? null,
        wallet,
        ...(paysIn ? { settleAsset: { token: paysIn.address, symbol: paysIn.symbol, decimals: paysIn.decimals } } : {}),
        transactions: transactionsOf(checked, (step) => (infos ? stepDoes(step, infos) : undefined)),
        simulation,
        readAfter: answer.readAfter ?? null,
        next: nextFor(simulation, wallet, 'Sign and send each transaction in order from the wallet, each only after the one before it landed.'),
      }
    },
  }),
  tool({
    name: 'get_book_vault_quote',
    title: "Get a signed quote for a Book's vault",
    kind: 'build',
    needs: 'sign-in',
    description: "Mancer's signed quote for a Book's vault: a trade while the Book trades (for one of its traders), or a sweep once it settled. Pass it to build_book_act as proposeTrade's quote. preview runs every check and signs nothing. Its route is held to the vault's own rules leg by leg, and a trade's floor to minOut or trustQuote, or the quote is refused build-mismatch. Needs the signed-in trader's wallet, or an API key Mancer enabled for Books signing.",
    shape: {
      token: bookToken,
      wallet: wallet('The trader, or the wallet that sweeps'),
      purpose: z.enum(['trade', 'sweep']),
      tokenIn: address('What the vault sells'),
      tokenOut: z.string().optional().describe("What a trade buys: an address, which a trade names. A sweep sells for the Book's settlement asset (WETH unless the Book settles in its base pair)."),
      amountIn: z.string().optional().describe("How much the vault sells, a decimal number; a sweep's whole holding by default."),
      slippageBps: z.number().optional().describe("The floor's band under the route: 10 to 30 with one trader, 30 to 100 with several, 50 to 150 for a sweep."),
      preview: z.boolean().optional().describe('Every check and the simulation, and no signature.'),
      ...floorArgs,
    },
    run: async (ctx, a) => {
      const token = bookOf(a.token)
      const tokenIn = addressOf(a.tokenIn, 'tokenIn')
      if (a.purpose === 'trade' && (a.minOut === undefined) === (a.trustQuote === undefined)) throw badArgument("A vault trade's quote signs its floor: name minOut (the least it delivers) or trustQuote: true, one of the two.", 'floor-required')
      // a trade names what it buys: asked with none, the token would be the API's choice, and minOut read in its units
      if (a.purpose === 'trade' && a.tokenOut === undefined) throw badArgument('A vault trade names what it buys: tokenOut, an address.', 'tokenout-required')
      const wallet = await walletOf(ctx, a.wallet)
      const body: Record<string, unknown> = { wallet, purpose: a.purpose, tokenIn }
      if (a.tokenOut !== undefined) body.tokenOut = addressOf(a.tokenOut, 'tokenOut')
      if (a.amountIn !== undefined) {
        const info = (await tokenInfos(ctx, [{ native: false, address: tokenIn }])).get(tokenIn)!
        body.amountIn = rawOf(a.amountIn, info.decimals, 'amountIn').toString()
      }
      if (a.slippageBps !== undefined) body.slippageBps = a.slippageBps
      if (a.preview) body.preview = true
      const chain = chainOf(ctx)
      const trusted = await trustedOf(ctx)
      const book = await chainBook(ctx, token)
      // a sweep sells for the Book's settlement asset, as its settler on the chain names it
      const asset = a.purpose === 'sweep' ? await checking(() => readBookSettleAsset(chain, book)) : undefined
      const answer = await ask<BookVaultQuoteResponse>(ctx.api, { method: 'POST', path: `/v1/books/${seg(token)}/vault-quote`, body })
      const q = await checking(() => checkVaultQuote(answer, body as never, book, trusted.router, asset))
      if (q && a.purpose === 'trade') {
        const rule: FloorRule = a.trustQuote === true ? { trustQuote: true } : {}
        if (a.minOut !== undefined) {
          // checkVaultQuote held the quote's tokenOut to the one the caller named
          const outToken = addressOf(String(body.tokenOut), 'tokenOut')
          const info = (await tokenInfos(ctx, [{ native: false, address: outToken }])).get(outToken)!
          rule.minOut = rawOf(a.minOut, info.decimals, 'minOut')
        }
        await checking(() => holdSignedFloor('book', rule, chain, trusted, { tokenIn: getAddress(answer.tokenIn), tokenOut: getAddress(answer.tokenOut), amountIn: BigInt(answer.amountIn) }, BigInt(answer.minOut)))
      }
      return answer as unknown as Record<string, unknown>
    },
  }),
  tool({
    name: 'build_book_settlement',
    title: "Build a Book's settlement",
    kind: 'build',
    needs: 'sign-in',
    description: "Build the settlement of an ended Book: Mancer's signed sales of its vault into the Book's settlement asset (WETH unless the Book settles in its base pair), then the liquidation from your wallet, simulated. Each sale's route is held to the vault's own rules, each sale pays the asset the Book's settler names on the chain (asked again where it moved), and the liquidation is rebuilt here byte for byte, or the build is refused build-mismatch. Its traders and dev may settle from the unlock, and any wallet two days on. Needs the signed-in wallet, or an API key Mancer enabled for Books signing.",
    shape: { token: bookToken, wallet: wallet('The wallet that settles'), slippageBps: z.number().min(50).max(150).optional().describe("The sales' band, 50 to 150; 100 by default.") },
    run: async (ctx, a) => {
      const token = bookOf(a.token)
      const wallet = await walletOf(ctx, a.wallet)
      const chain = chainOf(ctx)
      const trusted = await trustedOf(ctx)
      const book = await chainBook(ctx, token)
      const askSales = () => ask<Record<string, unknown>>(ctx.api, {
        method: 'POST', path: `/v1/books/${seg(token)}/liquidation-quotes`, query: { steps: '1' },
        body: { wallet, ...(a.slippageBps !== undefined ? { slippageBps: a.slippageBps } : {}) },
      })
      let answer = await askSales()
      // the asset every sale pays, held to the settler's on the chain: where a trader or the creator moved it after Mancer
      // signed (at the settler directly), the settlement would run none of its sales, so they are asked for once more,
      // signed into the asset Mancer reads at the head (and refused below where they still pay another)
      if (bookSettlesInChosenAsset(book.deployment) && !settlementPaysAsset(answer, (await settleAssetInfo(ctx, book)).address as Address)) answer = await askSales()
      if (!answer.ready) throw new ToolRefusal({ error: 'The settlement answered no transaction to sign.', code: 'steps-unavailable', retryable: true })
      const ready = answer.ready as ReadySteps & { error?: unknown; code?: unknown }
      if (typeof ready.error === 'string' && typeof ready.code === 'string') throw new ToolRefusal({ error: ready.error.slice(0, 600), code: ready.code, retryable: ready.code === 'steps-unavailable' })
      const expected = await checking(() => settlementCalls(chain, book, getAddress(wallet), answer as never, trusted.router))
      const checked = await checking(() => checkExactBookCalls('book', structural(ready), wallet, expected))
      const simulation = ready.simulation ?? null
      const asset = await settleAssetInfo(ctx, book)
      const transactions = transactionsOf(checked)
      return { wallet, settleAsset: { token: asset.address, symbol: asset.symbol, decimals: asset.decimals }, transactions, simulation, readAfter: ready.readAfter ?? null, next: nextFor(simulation, wallet, settlementSendLine(transactions)) }
    },
  }),
  tool({
    name: 'create_book_draft',
    title: 'Save a Book before its open',
    kind: 'write',
    needs: 'sign-in',
    description: "Save a Book's record before it opens: its name, ticker, description, links and targets, on the factory new Books open on, as mancer.xyz saves one. Then build_book_open answers the open's transaction. Needs the dev's signed-in wallet.",
    shape: {
      factory: z.string().optional().describe('The Books factory new Books open on: this server\'s kit names it, and it is the default. A factory that opens no new Books is refused.'),
      name: z.string().min(1).max(40),
      symbol: z.string().regex(/^[A-Za-z0-9]{2,11}$/).describe('The ticker: 2 to 11 letters and digits.'),
      description: z.string().max(500).optional(),
      links: z.record(z.string(), z.string()).optional().describe('website, x and telegram links.'),
      targets: z.array(z.string()).max(16).describe("The tokens the vault may buy: verified tokens or issued stocks. WETH keeps a place, since a Book settles in WETH unless a trader or its dev picks its base pair."),
    },
    run: async ({ api, connection }, a) => {
      // a new Book opens on the kit's launch deployment alone, so a draft names that factory and no other
      const launch = bookLaunchDeployment()
      if (!launch) throw new ToolRefusal({ error: 'No Books deployment this server pins opens new Books.', code: 'factory-not-open', retryable: false })
      const factory = a.factory !== undefined ? addressOf(a.factory, 'factory') : (launch.factory.address.toLowerCase() as Address)
      if (factory !== launch.factory.address.toLowerCase()) throw badArgument(`New Books open on the factory ${launch.factory.address.toLowerCase()} alone: name it, or leave factory out.`, 'factory-not-open')
      const out = await ask<{ draft?: { id?: unknown } }>(api, {
        method: 'POST', path: '/v1/books/drafts',
        body: { factory, name: a.name, symbol: a.symbol, ...(a.description !== undefined ? { description: a.description } : {}), ...(a.links ? { links: a.links } : {}), targets: (a.targets as string[]).map((t) => addressOf(t, 'targets')) },
      })
      // the open build_book_open answers later is held to the record saved here, never to that answer's word
      if (typeof out.draft?.id === 'string' && /^[0-9a-f]{32}$/.test(out.draft.id)) connection.rememberDraft(out.draft.id, { factory: getAddress(factory), name: a.name, symbol: a.symbol })
      return out as Record<string, unknown>
    },
  }),
  tool({
    name: 'build_book_open',
    title: 'Build the open of a saved Book',
    kind: 'build',
    needs: 'sign-in',
    description: "Build the transaction that opens a saved Book, from its dev's wallet, simulated. terms names its traders and duration, and any raise terms beside the defaults. The open is rebuilt here from the draft's name and ticker and those terms, and must be that call byte for byte, or the build is refused build-mismatch. Needs the dev's signed-in wallet.",
    shape: {
      draftId: z.string().regex(/^[0-9a-f]{32}$/).describe("The saved Book's id, as create_book_draft answered it."),
      wallet: wallet('The dev, who sends the open'),
      name: z.string().min(1).max(40).optional().describe("The draft's name, where it was saved on another connection: a draft this connection saved is held to its own."),
      symbol: z.string().regex(/^[A-Za-z0-9]{2,11}$/).optional().describe("The draft's ticker, where it was saved on another connection."),
      factory: z.string().optional().describe("The draft's factory, where it was saved on another connection: an address."),
      terms: z.object({
        traders: z.array(z.string()).min(1).max(8).describe("The Book's traders' wallets."),
        durationSecs: z.number().int().min(0).describe('How long the Book trades after its bond, in seconds.'),
      }).passthrough().describe('openBook\'s terms: traders and durationSecs, and any of lpFeeMode, startMcapUsd8, gradMcapUsd8, startTaxBps, taxDecayPerMinBps, windowSecs, buysOnly, bondAfterSecs, guaranteedBond, quote, venue, hook.'),
    },
    run: async (ctx, a) => {
      const wallet = await walletOf(ctx, a.wallet)
      const kept = ctx.connection.draft(a.draftId)
      const name = kept?.name ?? a.name
      const symbol = kept?.symbol ?? a.symbol
      const factory = kept?.factory ?? (a.factory !== undefined ? getAddress(addressOf(a.factory, 'factory')) : undefined)
      if (name === undefined || symbol === undefined) {
        throw badArgument("Name the draft's name and symbol, or open a draft this connection saved: the open is held to the record you made, never to the answer's word.", 'draft-required')
      }
      const open = await checking(() => openBookParamsOf(a.terms as Record<string, unknown>, { name, symbol }))
      const answer = await ask<DraftOpenStepsResponse>(ctx.api, { method: 'POST', path: `/v1/books/drafts/${seg(a.draftId)}/steps`, body: { wallet, terms: a.terms } })
      const checked = await checking(() => checkDraftOpenSteps(structural(answer), { wallet, draftId: a.draftId, open, ...(factory ? { factory } : {}) }))
      const simulation = answer.simulation ?? null
      return { wallet, transactions: transactionsOf(checked), simulation, readAfter: answer.readAfter ?? null, bind: answer.bind ?? null, next: nextFor(simulation, wallet, 'Sign and send the transaction from the dev.') }
    },
  }),
]
