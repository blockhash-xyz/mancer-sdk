import { z } from 'zod'
import { parseTransaction, type Hex } from 'viem'
import { seg } from './api'
import { address, limit, token, tool, wallet, walletOf, type ToolSpec } from './tool'
import { contractsToCheck } from './checks'
import { CHAIN_ID, WETH, addressOf, ask, badArgument, hashOf, rpc, tokenOf, ToolRefusal } from './values'

/**
 * The reads: tokens and the market, a wallet's holdings and trades, a transaction, and the contracts a caller checks what
 * it signs against. Each is one route of the API, asked as the caller; a wallet's reads are the signed-in wallet's where
 * none is named. And the one write of the chain's: a transaction the caller's own wallet signed, sent as it was signed.
 */

/** A token a market route names: native ether reads as WETH, which stands for it in every market. */
const marketToken = (v: string, what = 'token') => {
  const t = tokenOf(v, what)
  return t.native ? WETH : t.address
}

const CANDLE_SECONDS = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400 } as const

export const MARKET_TOOLS: ToolSpec[] = [
  tool({
    name: 'search_tokens',
    title: 'Search tokens',
    kind: 'read',
    description: "Search Robinhood Chain's tokens by symbol, name or address. Each result names its address, decimals, tier, price, liquidity and volume. Many tokens share a symbol: choose by address, liquidity and tier.",
    shape: { query: z.string().min(1).max(64).describe('A symbol, a name or an address.'), limit: limit(50, 20) },
    run: async ({ api }, a) => ask(api, { method: 'GET', path: '/v1/tokens', query: { q: a.query, limit: a.limit ?? 20 } }),
  }),
  tool({
    name: 'get_token',
    title: 'Get a token',
    kind: 'read',
    description: "One token's page: its price, 24-hour change, liquidity, depth, volume, market cap, holders, supply, trust marks and deepest pools.",
    shape: { token: token('The token') },
    run: async ({ api }, a) => ask(api, { method: 'GET', path: `/v1/tokens/${seg(marketToken(a.token))}` }),
  }),
  tool({
    name: 'get_prices',
    title: 'Get prices',
    kind: 'read',
    description: 'Prices in US dollars of up to 50 tokens, keyed by address.',
    shape: { tokens: z.array(z.string()).min(1).max(50).describe('Token addresses, or ETH for native ether.') },
    run: async ({ api }, a) => ask(api, { method: 'GET', path: '/v1/prices', query: { tokens: [...new Set((a.tokens as string[]).map((t) => marketToken(t)))].join(',') } }),
  }),
  tool({
    name: 'discover_tokens',
    title: 'Browse tokens',
    kind: 'read',
    description: "Rank the chain's tokens: by volume for what is trending, by 24-hour change for movers, by age for new launches, or by liquidity. Filter to verified tokens, issued stocks or Book tokens.",
    shape: {
      sort: z.enum(['top', 'volume', 'change', 'new', 'liquidity', 'depth', 'tier', 'symbol']).optional().describe('The order; tier by default. volume is the day\'s trading, change the day\'s move, new the newest first.'),
      filter: z.enum(['all', 'verified', 'stocks', 'books']).optional().describe('all by default.'),
      direction: z.enum(['asc', 'desc']).optional().describe('desc by default.'),
      minDepthUsd: z.number().min(0).optional().describe('Only tokens with at least this many dollars of executable depth.'),
      query: z.string().max(64).optional().describe('A symbol or name to narrow the list.'),
      limit: limit(100, 25),
      offset: z.number().int().min(0).optional().describe('How many to pass over, for the next page.'),
    },
    run: async ({ api }, a) => ask(api, {
      method: 'GET', path: '/v1/tokens/discover',
      query: { sort: a.sort, filter: a.filter, dir: a.direction, minDepthUsd: a.minDepthUsd, q: a.query, limit: a.limit ?? 25, offset: a.offset },
    }),
  }),
  tool({
    name: 'get_token_trades',
    title: "Get a token's trades",
    kind: 'read',
    description: "A token's trades, newest first, each with its maker, side, amounts and dollar value. Pass a page's nextBefore as before for the next page.",
    shape: {
      token: token('The token'),
      side: z.enum(['buy', 'sell']).optional().describe('Only the trades that bought the token, or sold it.'),
      minUsd: z.number().min(0).optional().describe('Only trades of at least this many dollars.'),
      limit: limit(100, 30),
      before: z.string().max(256).optional().describe("A page's nextBefore."),
    },
    run: async ({ api }, a) => ask(api, { method: 'GET', path: `/v1/tokens/${seg(marketToken(a.token))}/swaps`, query: { side: a.side, minUsd: a.minUsd, limit: a.limit ?? 30, before: a.before } }),
  }),
  tool({
    name: 'get_token_holders',
    title: "Get a token's holders",
    kind: 'read',
    description: "A token's largest holders, with each one's balance and share of the supply.",
    shape: { token: token('The token'), limit: limit(500, 50) },
    run: async ({ api }, a) => ask(api, { method: 'GET', path: `/v1/tokens/${seg(marketToken(a.token))}/holders`, query: { limit: a.limit ?? 50 } }),
  }),
  tool({
    name: 'get_top_traders',
    title: "Get a token's top traders",
    kind: 'read',
    description: "A token's top traders over the last day or week, ranked by profit, by dollars bought, or by dollars sold.",
    shape: {
      token: token('The token'),
      window: z.enum(['1d', '7d']).optional().describe('1d by default.'),
      sort: z.enum(['pnl', 'bought', 'sold']).optional().describe('pnl by default.'),
    },
    run: async ({ api }, a) => ask(api, { method: 'GET', path: `/v1/tokens/${seg(marketToken(a.token))}/traders`, query: { window: a.window, sort: a.sort } }),
  }),
  tool({
    name: 'get_token_chart',
    title: "Get a token's chart",
    kind: 'read',
    description: "A token's price candles in US dollars: open, high, low, close and volume a bucket, oldest first. Pass an earlier time as before to page back.",
    shape: {
      token: token('The token'),
      interval: z.enum(['1m', '5m', '15m', '1h', '4h', '1d']).optional().describe('The candle size; 1h by default.'),
      limit: limit(1000, 100),
      before: z.number().int().min(0).optional().describe('Unix seconds: only candles before this time.'),
    },
    run: async ({ api }, a) => ask(api, {
      method: 'GET', path: `/v1/tokens/${seg(marketToken(a.token))}/candles`,
      query: { tf: CANDLE_SECONDS[(a.interval ?? '1h') as keyof typeof CANDLE_SECONDS], limit: a.limit ?? 100, before: a.before },
    }),
  }),
  tool({
    name: 'get_recent_swaps',
    title: "Get the chain's latest swaps",
    kind: 'read',
    description: 'The latest swaps across Robinhood Chain, newest first.',
    shape: { limit: limit(200, 50) },
    run: async ({ api }, a) => ask(api, { method: 'GET', path: '/v1/swaps', query: { limit: a.limit ?? 50 } }),
  }),

  // ------------------------------------------------------------------------------------------------------ wallets
  tool({
    name: 'get_balances',
    title: "Get a wallet's balances",
    kind: 'read',
    description: "A wallet's ether and token balances, each with its dollar value, largest first.",
    shape: { wallet: wallet('The wallet'), limit: limit(500, 100) },
    run: async (ctx, a) => ask(ctx.api, { method: 'GET', path: `/v1/wallets/${seg(await walletOf(ctx, a.wallet))}/balances`, query: { limit: a.limit ?? 100 } }),
  }),
  tool({
    name: 'get_portfolio',
    title: "Get a wallet's profit and loss",
    kind: 'read',
    description: "A wallet's profit and loss by token: its cost basis, realized and unrealized gains, and what it holds now.",
    shape: { wallet: wallet('The wallet') },
    run: async (ctx, a) => ask(ctx.api, { method: 'GET', path: `/v1/wallets/${seg(await walletOf(ctx, a.wallet))}/pnl` }),
  }),
  tool({
    name: 'get_portfolio_history',
    title: "Get a wallet's value over time",
    kind: 'read',
    description: "A wallet's value in US dollars, one point a day.",
    shape: { wallet: wallet('The wallet'), days: z.number().int().min(1).max(365).optional().describe('How many days back, 1 to 365; 30 by default.') },
    run: async (ctx, a) => ask(ctx.api, { method: 'GET', path: `/v1/wallets/${seg(await walletOf(ctx, a.wallet))}/history`, query: { days: a.days } }),
  }),
  tool({
    name: 'get_positions',
    title: "Get a wallet's liquidity positions",
    kind: 'read',
    description: "A wallet's liquidity positions in pools, with what each holds.",
    shape: { wallet: wallet('The wallet') },
    run: async (ctx, a) => ask(ctx.api, { method: 'GET', path: `/v1/wallets/${seg(await walletOf(ctx, a.wallet))}/positions` }),
  }),
  tool({
    name: 'get_wallet_trades',
    title: "Get a wallet's trades",
    kind: 'read',
    description: "A wallet's trades, newest first: what left the wallet and what reached it in each. Pass a page's nextBefore as before for the next page.",
    shape: {
      wallet: wallet('The wallet'),
      token: z.string().optional().describe("Only the trades in which this token was either side: the token's address."),
      limit: limit(100, 30),
      before: z.string().max(256).optional().describe("A page's nextBefore."),
    },
    run: async (ctx, a) => ask(ctx.api, {
      method: 'GET', path: `/v1/wallets/${seg(await walletOf(ctx, a.wallet))}/swaps`,
      query: { token: a.token ? addressOf(a.token, 'token') : undefined, limit: a.limit ?? 30, before: a.before },
    }),
  }),
  tool({
    name: 'get_nfts',
    title: "Get a wallet's NFTs",
    kind: 'read',
    description: "A wallet's NFTs by collection, each piece with its name, picture, rarity rank and best offer, and the collections' value at offers.",
    shape: {
      wallet: wallet('The wallet'),
      collection: z.string().optional().describe("One collection's pieces alone: the collection's address."),
      query: z.string().max(64).optional().describe("A search of the collections' names, or with a collection, of its pieces."),
      sort: z.enum(['count', 'value', 'name', 'rarity']).optional().describe('count by default; rarity sorts one collection\'s pieces.'),
      verifiedOnly: z.boolean().optional().describe('Only collections OpenSea verified.'),
      limit: limit(100, 50),
      offset: z.number().int().min(0).max(5000).optional().describe("A page's nextOffset."),
    },
    run: async (ctx, a) => ask(ctx.api, {
      method: 'GET', path: `/v1/wallets/${seg(await walletOf(ctx, a.wallet))}/collectibles`,
      query: { collection: a.collection ? addressOf(a.collection, 'collection') : undefined, q: a.query, sort: a.sort, verified: a.verifiedOnly ? '1' : undefined, limit: a.limit ?? 50, offset: a.offset },
    }),
  }),
  tool({
    name: 'get_nft',
    title: 'Get an NFT',
    kind: 'read',
    description: "One NFT: its traits, rarity rank, owners, market and history.",
    shape: { collection: address("The collection's contract"), tokenId: z.string().regex(/^(0|[1-9][0-9]{0,77})$/).describe("The piece's id, a whole number.") },
    run: async ({ api }, a) => ask(api, { method: 'GET', path: `/v1/nfts/${seg(addressOf(a.collection, 'collection'))}/${seg(a.tokenId)}` }),
  }),

  // ------------------------------------------------------------------------------------------- transactions, chain
  tool({
    name: 'get_transaction',
    title: 'Get a transaction',
    kind: 'read',
    description: 'What a transaction did: its sender and owner, every token that moved and between whom, its swaps, and a sentence that sums it up.',
    shape: { hash: z.string().describe("The transaction's hash.") },
    run: async ({ api }, a) => ask(api, { method: 'GET', path: `/v1/transactions/${seg(hashOf(a.hash, 'hash'))}` }),
  }),
  tool({
    name: 'get_transaction_receipt',
    title: "Get a transaction's receipt",
    kind: 'read',
    description: "Whether a sent transaction landed: pending, success or reverted, with its block and the gas it used. Read it after sending each transaction a build answered, before sending the next.",
    shape: { hash: z.string().describe("The transaction's hash.") },
    run: async (ctx, a) => {
      const hash = hashOf(a.hash, 'hash')
      const body = (await rpc(ctx, 'eth_getTransactionReceipt', [hash])) as { result?: Record<string, unknown> | null; error?: unknown }
      if (body.error !== undefined) throw new ToolRefusal({ error: 'The chain did not answer the read.', code: 'chain-unavailable', retryable: true })
      const r = body.result
      if (!r) return { hash, status: 'pending' }
      const hex = (v: unknown) => (typeof v === 'string' && /^0x[0-9a-fA-F]+$/.test(v) ? BigInt(v).toString() : null)
      return {
        hash,
        status: r.status === '0x1' ? 'success' : 'reverted',
        block: hex(r.blockNumber),
        gasUsed: hex(r.gasUsed),
        from: typeof r.from === 'string' ? r.from.toLowerCase() : null,
        to: typeof r.to === 'string' ? r.to.toLowerCase() : null,
      }
    },
  }),
  tool({
    name: 'send_signed_transaction',
    title: 'Send a signed transaction',
    kind: 'write',
    description: "Broadcast a transaction your own wallet signed, through Mancer's chain endpoint, as it was signed. Sign each transaction a build answered, in order, and send each only after the one before it landed. Only a transaction for Robinhood Chain (4663) is sent. Your wallet may send it itself instead.",
    shape: { signedTransaction: z.string().regex(/^0x[0-9a-fA-F]+$/).max(49_154).describe('The signed transaction, serialized, as 0x and hex.') },
    run: async ({ api }, a) => {
      let chainId: number | undefined
      try {
        chainId = parseTransaction(a.signedTransaction as Hex).chainId
      } catch {
        throw badArgument('signedTransaction is no serialized transaction.', 'bad-transaction')
      }
      if (chainId !== CHAIN_ID) throw badArgument(`The transaction is signed for chain ${chainId ?? 'none'}, not Robinhood Chain (${CHAIN_ID}).`, 'wrong-chain')
      const body = await ask<{ result?: unknown; error?: { message?: unknown; code?: unknown } }>(api, {
        method: 'POST', path: '/rpc', body: { jsonrpc: '2.0', id: 1, method: 'eth_sendRawTransaction', params: [a.signedTransaction] },
      })
      if (typeof body.result === 'string') return { hash: body.result.toLowerCase(), next: 'Read get_transaction_receipt with this hash until it says success or reverted.' }
      // the node's own words are another party's text: data beside this server's sentence, never inside it
      throw new ToolRefusal({
        error: 'The chain refused the transaction. detail.node holds what the node answered, as data.',
        code: 'send-refused',
        retryable: false,
        detail: { node: { code: typeof body.error?.code === 'number' ? body.error.code : null, message: typeof body.error?.message === 'string' ? body.error.message.slice(0, 300) : null } },
      })
    },
  }),
  tool({
    name: 'get_contracts',
    title: 'Get the contracts to check against',
    kind: 'read',
    description: "The contracts every build is held to, as the kit this server was built with pins them, each with its address and the hash of its code: MancerRouter, the one spender a swap's input is approved to, MancerOrders and its typed-data domain, WETH, USDG and the launch stack. Mancer's API must name the same ones, or the tool refuses build-mismatch, as every build would. Check a transaction's to and an approval's spender against these before signing, and read each code hash on a node of your own.",
    shape: {},
    run: async (ctx) => contractsToCheck(ctx),
  }),
  tool({
    name: 'get_limits',
    title: 'Get rate limits',
    kind: 'read',
    description: 'Who Mancer takes this caller for (no credential, a key and its class, or the signed-in wallet), and every rate limit with what is left of it.',
    shape: {},
    run: async ({ api }) => ask(api, { method: 'GET', path: '/v1/limits' }),
  }),
]

