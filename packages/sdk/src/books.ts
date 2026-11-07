import { erc20Abi, getAddress, keccak256, zeroAddress, type Abi, type Address, type Hex, type PublicClient } from 'viem'
import { legRefusal, type BookActCalls } from './checks'
import { MancerCheckError } from './errors'
import { floorKind, type FloorRule } from './floor'
import {
  BOOK_DEPLOYMENTS,
  BOOK_EIP712_VERSION,
  BOOK_SHARED,
  bookPadKind,
  bookSettleSwitchClosed,
  bookSettlesInChosenAsset,
  bookVaultDomainName,
  bookVaultDomainNames,
  hashBookQuote,
  padClaimCall,
  setSettleAssetCall,
  abortCall,
  armCall,
  bondCall,
  bookAbisFor,
  bookCallData,
  buyCall,
  buyEthCall,
  bookTradeIntentFromQuote,
  cancelOrderCall,
  claimCreatorCutCall,
  claimFeesCall,
  confirmTradeCall,
  executeTradeCall,
  graduateCall,
  harvestCall,
  liquidateCall,
  liquidationCallMismatch,
  parseBookQuote,
  proposeTradeCall,
  readRouterLegs,
  redeemCall,
  revokeAllowanceCall,
  revokeOrdersCall,
  sellCall,
  stakeCall,
  sweepLeftoverCall,
  sweepUnownedCall,
  syncTaxCall,
  syncTrackedCall,
  unstakeCall,
  vaultRouteMismatch,
  type BookCall,
  type BookDeployment,
  type BookQuote,
  type BookTradeIntent,
} from './shared'
import type { BookLiquidationQuotesResponse, BookVaultQuoteRequest, BookVaultQuoteResponse } from './generated/openapi'

/**
 * A Book as the caller's own node reads it, and each of its acts rebuilt from the kit's builders
 * (the contracts kit's books/calls.ts) out of the arguments the caller asked for: what `checkBookSteps` holds the
 * API's steps to, byte for byte. Nothing here takes the API's word for a vault, an id, an amount or a route.
 */

/**
 * A Book's acts, as the steps route names them. Two are a deployment's own: `padClaim` takes what a TraderBookPadV2's
 * claim ledger holds for the wallet (a pad whose rules are `claims`: the creator's tax share in the Book's base pair, a
 * bonder's bounty), and `setSettleAsset` picks what a Book settles in on a settler that settles in the base pair where
 * chosen (`settlement: 'chosen'`). Each is refused on any other deployment before anything is asked.
 */
export type BookAction =
  | 'arm' | 'abort' | 'graduate' | 'bond' | 'proposeTrade' | 'confirmTrade' | 'executeTrade' | 'cancelOrder' | 'revokeOrders'
  | 'revokeAllowance' | 'syncTax' | 'syncTracked' | 'stake' | 'unstake' | 'claim' | 'harvest' | 'sweepUnowned' | 'sweepLeftover'
  | 'redeem' | 'claimCreatorCut' | 'padClaim' | 'setSettleAsset'

/** What an act takes beside its Book: as the steps route takes them, `amount` a bigint or `'all'`. An act that signs a
 * trade's floor (`proposeTrade`, `confirmTrade`, `executeTrade`, a signed `sweepLeftover`) names its floor rule beside
 * them, as a swap does, and the floor the trade carries is held to it. */
export interface BookActArgs extends FloorRule {
  amount?: bigint | 'all'
  /** A signed quote from `vaultQuote` (`proposeTrade`, and `sweepLeftover` of a token it sells). */
  quote?: unknown
  /** `sweepLeftover` of the Book's settlement asset (WETH unless the Book settles in its base pair) or of its own token,
   * and `revokeAllowance`'s token. */
  token?: Address
  /** `padClaim` on a WETH Book: false takes the claim as WETH, and it is paid as ether otherwise, as the steps route
   * pays it. A claim of any other base pair is that token, whatever is named. */
  unwrap?: boolean
  /** `setSettleAsset`: true settles the Book in its own base pair, false in WETH. */
  inQuote?: boolean
  spender?: Address
  orderHash?: Hex
  tokens?: Address[]
  /** `confirmTrade` and `executeTrade`: the pending trade the caller read and agreed to. The act is refused where the
   * vault's `pending()` on the caller's node is another trade (its salt, tokens, amount or floor), so a trade proposed in
   * between is never the one confirmed. */
  expectPending?: { salt: bigint; tokenIn: Address; tokenOut: Address; amountIn: bigint; minOut: bigint }
}

/** A Book as its factory says it is. */
export interface ChainBook {
  deployment: BookDeployment
  token: Address
  bookId: bigint
  vault: Address
}

const same = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.toLowerCase() === b.toLowerCase()
const refuse = (reason: string): never => {
  throw new MancerCheckError('book', reason)
}

/** Multicall3's own clock (`getCurrentBlockTimestamp`), so an act read through `readContract` alone reads the chain's
 * second on the caller's node. */
const CHAIN_CLOCK_ABI = [{ type: 'function', name: 'getCurrentBlockTimestamp', stateMutability: 'view', inputs: [], outputs: [{ name: 'timestamp', type: 'uint256' }] }] as const satisfies Abi

/** The Book a token is, read from each pinned deployment's factory on the caller's node: its id and its vault. */
export async function readChainBook(chain: Pick<PublicClient, 'readContract'>, token: Address, deployments: readonly BookDeployment[] = BOOK_DEPLOYMENTS): Promise<ChainBook> {
  for (const d of deployments) {
    const abi = bookAbisFor(d).factory as Abi
    const id = (await chain.readContract({ address: d.factory.address, abi, functionName: 'bookIdOfToken', args: [token] })) as bigint
    if (id === 0n) continue
    const [bookToken, vault] = (await chain.readContract({ address: d.factory.address, abi, functionName: 'bookOf', args: [id] })) as readonly [Address, Address, Address]
    if (!same(bookToken, token)) return refuse("the factory's Book of that id is another token")
    return { deployment: d, token: getAddress(token), bookId: id, vault: getAddress(vault) }
  }
  return refuse('no factory this SDK pins names that token as a Book')
}

/** A vault route (a trade's or a sweep's), held to the vault's own rules and leg by leg: through Mancer's routing alone,
 * paying the router or the vault. */
export function vaultRouteCheck(q: BookQuote, book: ChainBook, router: Address): void {
  const d = book.deployment
  const adapters = [d.adapters.uniswap.address, d.adapters.mancer?.address].filter((a): a is Address => !!a)
  if (!adapters.some((a) => same(a, q.adapter))) refuse("the quote's adapter is none of the Book's deployment")
  if (!d.adapters.mancer || !same(q.adapter, d.adapters.mancer.address)) return
  const wrong = vaultRouteMismatch(q.route, {
    vault: book.vault, bookToken: book.token, tokenIn: q.tokenIn, tokenOut: q.tokenOut, amountIn: q.amountIn, minOut: q.minOut, deadline: q.deadline,
  })
  if (wrong) refuse(`the vault route does not pass the vault's check: ${wrong}`)
  const legs = readRouterLegs(q.route, { runner: router, caller: book.vault })
  if (legs.mismatch) refuse(`the vault route: ${legRefusal(legs.mismatch)}`)
}

function intentOfPending(p: readonly unknown[]): BookTradeIntent {
  const [adapter, tokenIn, tokenOut, amountIn, minOut, route, nonce, deadline, quoteSalt, mancerSig] = p as [Address, Address, Address, bigint, bigint, Hex, bigint, bigint, bigint, Hex]
  return { adapter, tokenIn, tokenOut, amountIn, minOut, route, nonce, deadline, quoteSalt, mancerSig }
}

/** The trade a Book's vault holds pending (its `pending()`, read on the caller's node), or null where it holds none: what
 * a co-trader's confirmation and an execution sign, read before either is asked for. */
export async function readVaultPending(chain: Pick<PublicClient, 'readContract'>, book: ChainBook): Promise<BookTradeIntent | null> {
  const abi = (bookAbisFor(book.deployment) as unknown as Record<string, Abi>).account!
  const pending = intentOfPending((await chain.readContract({ address: book.vault, abi, functionName: 'pending', args: [] } as never)) as readonly unknown[])
  return same(pending.adapter, zeroAddress) ? null : pending
}

/** The one name the deployments sign their vaults under, for a digest asked of a bare vault address: refused where they
 * sign under more than one, since a vault's domain is its deployment's. */
function soleVaultDomainName(deployments: readonly BookDeployment[]): string {
  const names = bookVaultDomainNames(deployments)
  if (names.length !== 1) refuse("the Books deployments sign their vaults under more than one EIP-712 name: name the Book (a ChainBook from readChainBook) or its vault's domain name")
  return names[0]!
}

/**
 * A vault quote's digest: its EIP-712 `MancerQuote` hash under the vault's own domain (its deployment's name, the kit's
 * version, the chain, the vault), as the vault keys `quoteUsed`. Two quotes with one salt and another deadline, floor or
 * route are two quotes the vault takes; a proposal and the pending trade it leaves (the same quote's fields, `quoteSalt`
 * its salt) are one. The name is the Book's deployment's (`bookVaultDomainName`) where a `ChainBook` is named, the one
 * `domainName` names, or, for a bare vault address, the one name every pinned deployment signs under (refused where they
 * sign under more than one).
 */
export function bookQuoteDigest(
  vault: Address | ChainBook,
  q: { adapter: Address; tokenIn: Address; tokenOut: Address; amountIn: bigint; minOut: bigint; route: Hex; deadline: bigint; salt: bigint },
  chainId = 4663,
  domainName?: string,
): Hex {
  const address = typeof vault === 'string' ? vault : vault.vault
  const name = domainName ?? (typeof vault === 'string' ? soleVaultDomainName(BOOK_DEPLOYMENTS) : bookVaultDomainName(vault.deployment))
  return hashBookQuote({ name, version: BOOK_EIP712_VERSION, chainId, verifyingContract: getAddress(address) }, {
    adapter: getAddress(q.adapter), tokenIn: getAddress(q.tokenIn), tokenOut: getAddress(q.tokenOut), amountIn: q.amountIn, minOut: q.minOut, route: q.route, deadline: q.deadline, salt: q.salt,
  })
}

/**
 * The asset a Book settles in, as its settler says it on the caller's node: every sale of its settlement and every sweep
 * pays it, and the pot, the close fee, the traders' cut and every redemption are counted and paid in it. WETH on every
 * deployment whose settler settles every Book in WETH, read from no contract (the Books contracts and the stack of
 * 2026-11-03). On a settler that settles in the base pair where chosen it is `settleAssetFor(bookId)`: WETH (or the zero
 * address) until a trader or the creator picks the Book's own base pair (the pad's `quoteOf`), and refused where it names
 * any other token, which the contracts never do.
 */
export async function readBookSettleAsset(chain: Pick<PublicClient, 'readContract'>, book: ChainBook): Promise<Address> {
  const d = book.deployment
  const weth = getAddress(BOOK_SHARED.weth)
  if (!bookSettlesInChosenAsset(d)) return weth
  const named = (await chain.readContract({ address: d.settler.address, abi: bookAbisFor(d).settler as Abi, functionName: 'settleAssetFor', args: [book.bookId] })) as Address
  if (same(named, zeroAddress) || same(named, weth)) return weth
  const quote = await bookBasePairOf(chain, book)
  if (!same(named, quote)) refuse("the settler names a settlement asset that is neither WETH nor the Book's own base pair")
  return getAddress(named)
}

/** A Book's pot as its settler holds it: `navTotalOf`, `settleOf`'s close fee, traders' cut and holder pot, and
 * `lpPotOf` (the holder pot carries the LP pot inside it), each in the Book's settlement asset. */
export interface BookPot {
  navTotal: bigint
  closeFee: bigint
  creatorCutTotal: bigint
  holderPot: bigint
  lpPot: bigint
}

const BPS = 10_000n
/** TraderBookSettler's rules (876e24d): a close fee of 2% of the closing value, then the traders' 20% of the profit. */
const CLOSE_FEE_BPS = 200n
const TRADERS_PROFIT_BPS = 2_000n

/**
 * TraderBookSettler's `_addToPot` for what a sweep adds (876e24d): the close fee on the cumulative NAV first (its
 * increase capped at what came in), then the traders' share of the profit over the cost basis (its increase capped at
 * what the fee left), then the holders the rest. The arithmetic is the same in any settlement asset (origin/settle-in-base
 * runs it in the Book's own base pair where chosen): `weth` is what the sweep adds and `costBasis` the cost basis, each in
 * the Book's settlement asset. The contracts kit's `addToBookPot` is the same arithmetic; a test in Mancer's repository
 * holds the two equal to the wei.
 */
export function potAfterSweep(pot: BookPot, costBasis: bigint, weth: bigint, traders: number): BookPot {
  const navTotal = pot.navTotal + weth
  const feeTotal = (navTotal * CLOSE_FEE_BPS) / BPS
  let feeDelta = feeTotal > pot.closeFee ? feeTotal - pot.closeFee : 0n
  if (feeDelta > weth) feeDelta = weth
  const closeFee = pot.closeFee + feeDelta
  const net = navTotal - closeFee
  const profit = net > costBasis ? net - costBasis : 0n
  const cutTotal = (profit * TRADERS_PROFIT_BPS) / BPS
  let cutDelta = cutTotal > pot.creatorCutTotal ? cutTotal - pot.creatorCutTotal : 0n
  if (cutDelta > weth - feeDelta) cutDelta = weth - feeDelta
  if (traders <= 0) cutDelta = 0n
  return { navTotal, closeFee, creatorCutTotal: pot.creatorCutTotal + cutDelta, holderPot: pot.holderPot + (weth - feeDelta - cutDelta), lpPot: pot.lpPot }
}

/** What the settler's `redeem(amount)` pays (876e24d), or null where it refuses: nothing named, nothing circulating, or
 * more than circulates. The last redeemer takes the exact remainder; every other payout rounds down. */
export function redeemPayout(s: { holderPot: bigint; circulating: bigint }, amount: bigint): bigint | null {
  if (amount === 0n || s.circulating === 0n || amount > s.circulating) return null
  if (amount === s.circulating) return s.holderPot
  return (s.holderPot * amount) / s.circulating
}

/** What a settled Book's redemption pays, as the caller's own node reads its settler, its factory and its vault. Every
 * figure of the pot is in the Book's settlement asset (`asset`): WETH, or the Book's own base pair where its settler
 * settles in the base pair and a trader or the creator chose it. */
export interface BookRedemption {
  book: ChainBook
  /** The asset the Book settles in (`readBookSettleAsset`): what the pot holds and every redemption pays. */
  asset: Address
  /** Whether the settler has liquidated the Book: a redemption is refused before (`NotLiquidated`). */
  liquidated: boolean
  /** `settleOf(id)`: what the holders' pot holds now, and the Book tokens that circulate against it. */
  holderPot: bigint
  circulating: bigint
  /** The holder's Book tokens. */
  held: bigint
  /** The pot as the settler holds it (`navTotalOf`, `settleOf`'s close fee, cut and holder pot, `lpPotOf`), and the
   * Book's cost basis and traders, which the kit's sweep step reads to book a sweep's close fee and cut. */
  pot: BookPot
  /** The cost basis the settler measures the profit against, in the settlement asset: the factory's own (WETH wei) on a
   * Book that settles in WETH, and on one settled in its base pair that figure at the WETH rate the pad froze at arm
   * (`ethPerQuoteOf`; the kit's `bookCostBasisIn`, the settler's `_costBasisIn`). */
  costBasis: bigint
  traders: number
  /** What a later `sweepLeftover` would still add to the holders' pot: every token on the vault but the Book's own, the
   * settlement asset and WETH among them, with its balance there. Empty once every sweep has run. */
  unswept: { token: Address; amount: bigint }[]
}

/**
 * The settler's `_costBasisIn(bookId, asset)` for a Book settled in its own base pair (origin/settle-in-base): the cost
 * basis, which the factory keeps in WETH wei, at the rate the pad froze at arm (`ethPerQuoteOf`, WETH wei per 10^18 of
 * the base pair's smallest units), rounded down. A cost basis of nothing is nothing; a rate of zero is no rate (null),
 * which the settler refuses (`SettleAssetUnsupported`). The contracts kit's `bookCostBasisIn`; a test in Mancer's
 * repository holds the two equal.
 */
export function costBasisInBasePair(costBasisWei: bigint, ethPerQuoteE18: bigint): bigint | null {
  if (costBasisWei === 0n) return 0n
  if (ethPerQuoteE18 <= 0n) return null
  return (costBasisWei * 10n ** 18n) / ethPerQuoteE18
}

/** A settled Book's redemption read on the caller's node: its settlement asset, its settler's pot, the holder's Book
 * tokens and every token still on its vault that a sweep would add to the pot. */
export async function readBookRedemption(chain: Pick<PublicClient, 'readContract'>, book: ChainBook, holder: Address): Promise<BookRedemption> {
  const d = book.deployment
  const abis = bookAbisFor(d) as unknown as Record<string, Abi>
  const read = <T>(address: Address, abi: Abi, functionName: string, args: readonly unknown[] = []) => chain.readContract({ address, abi, functionName, args } as never) as Promise<T>
  const id = book.bookId
  const [asset, settle, navTotal, lpPot, costBasis, traders, tracked, held] = await Promise.all([
    readBookSettleAsset(chain, book),
    read<readonly [boolean, bigint, bigint, bigint, bigint, bigint]>(d.settler.address, abis.settler!, 'settleOf', [id]),
    read<bigint>(d.settler.address, abis.settler!, 'navTotalOf', [id]),
    read<bigint>(d.settler.address, abis.settler!, 'lpPotOf', [id]),
    read<bigint>(d.factory.address, abis.factory!, 'costBasis', [id]),
    read<readonly Address[]>(d.factory.address, abis.factory!, 'tradersOf', [id]),
    read<readonly Address[]>(book.vault, abis.account!, 'trackedTokens'),
    read<bigint>(book.token, erc20Abi as Abi, 'balanceOf', [holder]),
  ])
  const [liquidated, holderPot, circulating, creatorCutTotal, , closeFee] = settle
  // a Book settled in its base pair is measured against the WETH cost basis at the rate the pad froze at arm
  let basis = costBasis
  if (!same(asset, BOOK_SHARED.weth)) {
    const inAsset = costBasisInBasePair(costBasis, await read<bigint>(d.pad.address, abis.pad!, 'ethPerQuoteOf', [id]))
    if (inAsset === null) refuse("the pad names no WETH rate for the Book's base pair, which a Book settled in it is measured at")
    basis = inAsset!
  }
  // the settlement asset and WETH count whether the vault tracks them or not (a sweep of the asset moves the vault's whole
  // balance, and one of any other token sells what it holds); the Book's own token is burned by its sweep and adds
  // nothing of the vault's. On a Book that settles in WETH the list is WETH and the tracked tokens, as it always was
  const tokens = [...new Set([asset, BOOK_SHARED.weth, ...tracked].map((t) => getAddress(t)))].filter((t) => !same(t, book.token))
  const balances = await Promise.all(tokens.map((t) => read<bigint>(t, erc20Abi as Abi, 'balanceOf', [book.vault])))
  return {
    book,
    asset,
    liquidated,
    holderPot,
    circulating,
    held,
    pot: { navTotal, closeFee, creatorCutTotal, holderPot, lpPot },
    costBasis: basis,
    traders: traders.length,
    unswept: tokens.map((token, i) => ({ token, amount: balances[i]! })).filter((u) => u.amount > 0n),
  }
}

/**
 * What a redemption of `amount` pays now (the settler's `redeem`, `holderPot × amount / circulating`), and what it would
 * pay once every sweep left has run: each sweep's worth in the Book's settlement asset (`wethOf`, the caller's own price
 * of each token in that asset, which is WETH unless the Book settles in its base pair; the asset itself at its balance;
 * null where none reads) folded into the pot by the kit's sweep step, its close fee and the traders' cut booked as the
 * settler books them. `unpriced` names the tokens no price read, whose sweeps the second figure leaves out, so it is at
 * least that. Null where the settler would refuse the redemption. A redemption read before this SDK named its asset
 * (`asset` absent) is WETH's.
 */
export function bookRedeemPayouts(r: Pick<BookRedemption, 'holderPot' | 'circulating' | 'pot' | 'costBasis' | 'traders' | 'unswept'> & { asset?: Address }, amount: bigint, wethOf: (u: { token: Address; amount: bigint }) => bigint | null): { now: bigint; afterSweeps: bigint; unpriced: Address[] } | null {
  const now = redeemPayout({ holderPot: r.holderPot, circulating: r.circulating }, amount)
  if (now === null) return null
  let pot = r.pot
  const unpriced: Address[] = []
  const asset = r.asset ?? BOOK_SHARED.weth
  for (const u of r.unswept) {
    const weth = same(u.token, asset) ? u.amount : wethOf(u)
    if (weth === null) {
      unpriced.push(u.token)
      continue
    }
    if (weth <= 0n) continue
    pot = potAfterSweep(pot, r.costBasis, weth, r.traders)
  }
  const after = redeemPayout({ holderPot: pot.holderPot, circulating: r.circulating }, amount) ?? now
  return { now, afterSweeps: after > now ? after : now, unpriced }
}

/** A trade's signed floor held to the caller's rule (Mancer's `holdSignedFloor`): what an act that signs one is given. */
export type FloorCheck = (q: { tokenIn: Address; tokenOut: Address; amountIn: bigint; minOut: bigint }) => Promise<void>

/**
 * One act's own calls, from the arguments asked for and what the caller's node reads (an amount of `'all'`, the
 * allowance an approval tops up, the vault's trade nonce and pending trade, its tracked tokens), and the body to ask the
 * API with: every argument resolved, so the API builds the same call. An act that signs a trade's floor needs the
 * caller's floor rule and `holdFloor`, and is refused without them.
 */
export async function bookActCalls(
  chain: Pick<PublicClient, 'readContract'>,
  book: ChainBook,
  wallet: Address,
  action: BookAction,
  args: BookActArgs,
  router: Address,
  holdFloor?: FloorCheck,
): Promise<{ expected: BookActCalls; fields: Record<string, unknown> }> {
  const d = book.deployment
  const id = book.bookId
  const vault = book.vault
  const abis = bookAbisFor(d) as unknown as Record<string, Abi>
  const read = (address: Address, abi: Abi, functionName: string, a: readonly unknown[] = []) => chain.readContract({ address, abi, functionName, args: a } as never) as Promise<unknown>
  const units = (n: bigint | 'all' | undefined, all: () => Promise<bigint>) => (n === 'all' ? all() : n !== undefined && n > 0n ? Promise.resolve(n) : refuse('the act names an amount above zero, or all'))
  const allowance = (token: Address, spender: Address) => read(token, erc20Abi as Abi, 'allowance', [wallet, spender]) as Promise<bigint>
  const one = (calls: BookActCalls['calls'], fields: Record<string, unknown> = {}) => ({ expected: { calls, approval: null }, fields })
  // a trade's floor: the caller's rule, never the floor the quote or the pending trade happens to carry
  const floored = async (q: { tokenIn: Address; tokenOut: Address; amountIn: bigint; minOut: bigint }) => {
    floorKind(args, 'book')
    if (!holdFloor) return refuse(`${action} signs a trade's floor, and nothing holds it to your rule`)
    await holdFloor(q)
  }
  const expected = (p: BookTradeIntent) => {
    const e = args.expectPending
    if (!e) return
    if (p.quoteSalt !== e.salt || !same(p.tokenIn, e.tokenIn) || !same(p.tokenOut, e.tokenOut) || p.amountIn !== e.amountIn || p.minOut !== e.minOut) {
      refuse('the vault holds another pending trade than the one you read: nothing is confirmed or executed')
    }
  }
  switch (action) {
    case 'arm': return one([armCall(d, id)])
    case 'abort': return one([abortCall(d, id)])
    // on TraderBookPadV2 a graduation bonds the Book in the same transaction where the gas leaves the bond room
    case 'graduate': return { expected: { calls: [graduateCall(d, id)], approval: null, ...(bookPadKind(d) === 'claims' ? { mayBond: true } : {}) }, fields: {} }
    case 'bond': return one([bondCall(d, id)])
    case 'claim': return one([claimFeesCall(d, id)])
    case 'harvest': return one([harvestCall(d, id)])
    case 'sweepUnowned': return one([sweepUnownedCall(d, id)])
    case 'claimCreatorCut': return one([claimCreatorCutCall(d, id)])
    case 'executeTrade': {
      const pending = intentOfPending((await read(vault, abis.account!, 'pending')) as readonly unknown[])
      if (same(pending.adapter, zeroAddress)) refuse('the vault holds no pending trade')
      expected(pending)
      vaultRouteCheck({ ...pending, salt: pending.quoteSalt, signature: pending.mancerSig }, book, router)
      await floored(pending)
      return one([executeTradeCall(d, vault)])
    }
    case 'revokeOrders': return one([revokeOrdersCall(d, vault)])
    case 'syncTax': return one([syncTaxCall(d, vault)])
    case 'syncTracked': {
      const tokens = args.tokens ?? ((await read(vault, abis.account!, 'trackedTokens')) as Address[])
      if (!tokens.length || tokens.length > 16) refuse('syncTracked names 1 to 16 tokens')
      return one([syncTrackedCall(d, vault, tokens)], { tokens })
    }
    case 'cancelOrder': {
      const spender = args.spender ?? d.orderSpenders[0]
      if (!spender || !args.orderHash) return refuse('cancelOrder names the order hash, and a spender of the deployment')
      if (!d.orderSpenders.some((s) => same(s, spender))) refuse("cancelOrder's spender is none of the deployment's order books")
      return one([cancelOrderCall(d, vault, spender, args.orderHash)], { spender, orderHash: args.orderHash })
    }
    case 'revokeAllowance': {
      const spender = args.spender ?? d.orderSpenders[0]
      if (!spender || !args.token) return refuse('revokeAllowance names the token, and a spender')
      return one([revokeAllowanceCall(d, vault, spender, args.token)], { spender, token: args.token })
    }
    case 'stake': {
      const amount = await units(args.amount, () => read(book.token, erc20Abi as Abi, 'balanceOf', [wallet]) as Promise<bigint>)
      const short = (await allowance(book.token, d.lpFees.address)) < amount
      return { expected: { calls: [stakeCall(d, id, amount)], approval: short ? { token: book.token, spender: d.lpFees.address, amount } : null }, fields: { amount: amount.toString() } }
    }
    case 'unstake': {
      const amount = await units(args.amount, () => read(d.lpFees.address, abis.lpFees!, 'stakedOf', [id, wallet]) as Promise<bigint>)
      return one([unstakeCall(d, id, amount)], { amount: amount.toString() })
    }
    case 'redeem': {
      const amount = await units(args.amount, () => read(book.token, erc20Abi as Abi, 'balanceOf', [wallet]) as Promise<bigint>)
      const short = (await allowance(book.token, d.settler.address)) < amount
      return { expected: { calls: [redeemCall(d, id, amount)], approval: short ? { token: book.token, spender: d.settler.address, amount } : null }, fields: { amount: amount.toString() } }
    }
    case 'proposeTrade': {
      if (args.quote === undefined) return refuse("proposeTrade carries Mancer's signed quote from vaultQuote")
      const q = parseBookQuote(args.quote)
      vaultRouteCheck(q, book, router)
      await floored(q)
      const nonce = (await read(vault, abis.account!, 'tradeNonce')) as bigint
      return one([proposeTradeCall(d, vault, bookTradeIntentFromQuote(q, nonce))], { quote: args.quote })
    }
    case 'confirmTrade': {
      const pending = intentOfPending((await read(vault, abis.account!, 'pending')) as readonly unknown[])
      if (same(pending.adapter, zeroAddress)) refuse('the vault holds no pending trade')
      expected(pending)
      vaultRouteCheck({ ...pending, salt: pending.quoteSalt, signature: pending.mancerSig }, book, router)
      await floored(pending)
      return one([confirmTradeCall(d, vault, pending)])
    }
    case 'sweepLeftover': {
      // a sweep pays the Book's settlement asset: the settler moves that asset (and burns the Book's own token) with no
      // sale, and sells any other token for the asset on Mancer's signed sweep quote
      const asset = await readBookSettleAsset(chain, book)
      const inWeth = same(asset, BOOK_SHARED.weth)
      if (args.quote !== undefined) {
        const q = parseBookQuote(args.quote)
        if (!same(q.tokenOut, asset)) refuse(inWeth ? 'a sweep sells for WETH' : "a sweep sells for the Book's settlement asset, its own base pair")
        if (same(q.tokenIn, asset) || same(q.tokenIn, book.token)) refuse(inWeth ? "a sweep of WETH or of the Book's own token sells nothing, and carries no quote" : "a sweep of the Book's settlement asset or of its own token sells nothing, and carries no quote")
        vaultRouteCheck(q, book, router)
        await floored(q)
        return one([sweepLeftoverCall(d, id, q)], { quote: args.quote })
      }
      const token = args.token
      if (!token || !(same(token, asset) || same(token, book.token))) {
        return refuse(inWeth ? 'a sweep names WETH or the Book\'s own token, or carries a signed sweep quote' : "a sweep names the Book's settlement asset (its own base pair) or its own token, or carries a signed sweep quote")
      }
      const q: BookQuote = { adapter: zeroAddress, tokenIn: token, tokenOut: zeroAddress, amountIn: 0n, minOut: 0n, route: '0x', deadline: 0n, salt: 0n, signature: '0x' }
      return one([sweepLeftoverCall(d, id, q)], { token })
    }
    case 'padClaim': {
      // TraderBookPadV2's claim ledger, one balance an account and a token across the pad's Books: the wallet's credited
      // balance of the Book's base pair (a creator's tax shares, a bonder's bounty), as the pad on the node names that
      // pair; on a WETH Book paid as ether unless `unwrap` is false
      if (bookPadKind(d) !== 'claims') return refuse("this Book's pad keeps no claim ledger: it pays each share at its tax")
      if (args.unwrap !== undefined && typeof args.unwrap !== 'boolean') refuse('unwrap is true or false')
      const quote = await bookBasePairOf(chain, book)
      if (args.token !== undefined && !same(args.token, quote)) refuse("a claim of a Book's pad is of the Book's own base pair")
      const unwrap = same(quote, BOOK_SHARED.weth) && args.unwrap !== false
      return one([padClaimCall(d, quote, unwrap)], { unwrap })
    }
    case 'setSettleAsset': {
      if (!bookSettlesInChosenAsset(d)) return refuse("this Book's settler settles every Book in WETH: there is no settlement asset to choose")
      if (typeof args.inQuote !== 'boolean') return refuse("setSettleAsset names what the Book settles in: inQuote true (its own base pair) or false (WETH)")
      // the settler takes a change until the liquidation itself, which reads the asset as it runs and runs no sale signed
      // into another: from the Book's unlock a settlement may be in flight, and the switch names no deadline, so a change
      // built in the last minutes could land then. No change is built from five minutes before the unlock (the kit's
      // `bookSettleSwitchClosed`, on your node's clock), as the steps route builds none
      const [unlockAt, now] = await Promise.all([
        read(d.factory.address, abis.factory!, 'unlockAt', [id]) as Promise<bigint>,
        read(BOOK_SHARED.multicall3 as Address, CHAIN_CLOCK_ABI, 'getCurrentBlockTimestamp') as Promise<bigint>,
      ])
      if (unlockAt !== 0n && now >= unlockAt) refuse("the Book's term has ended, so its settlement asset no longer changes: a change could leave a settlement in flight with its sales unrun")
      if (bookSettleSwitchClosed(unlockAt, now)) refuse("the Book ends in less than five minutes, so its settlement asset no longer changes: a change sent now could land after its settlement's sales were signed")
      return one([setSettleAssetCall(d, id, args.inQuote)], { inQuote: args.inQuote })
    }
  }
  return refuse(`${String(action)} is no act of a Book`)
}

/** The runtime code at each of a Books deployment's pinned contracts, read on the caller's node and held to its pin. */
export async function verifyBookDeployment(chain: Pick<PublicClient, 'getCode'>, d: BookDeployment): Promise<void> {
  const pins = [d.factory, d.pad, d.settler, d.lpFees, d.locker, d.lockerV4, d.operatorNft, d.adapters.uniswap, d.adapters.mancer].filter((p): p is NonNullable<typeof p> => !!p)
  const codes = await Promise.all(pins.map((p) => chain.getCode({ address: p.address })))
  pins.forEach((p, i) => {
    const code = codes[i]
    if (!code || code === '0x' || keccak256(code).toLowerCase() !== p.runtimeCodeHash.toLowerCase()) refuse(`the code at ${p.address} on your node is not the Books deployment's reviewed build`)
  })
}

// ------------------------------------------------------------------------------------------- a raise, a settlement

/** A Book's base pair, as its pad says it (`quoteOf(bookId)`, read on the caller's node): WETH on a WETH Book. */
export async function bookBasePairOf(chain: Pick<PublicClient, 'readContract'>, book: ChainBook): Promise<Address> {
  const d = book.deployment
  return getAddress((await chain.readContract({ address: d.pad.address, abi: bookAbisFor(d).pad as Abi, functionName: 'quoteOf', args: [book.bookId] })) as Address)
}

/**
 * A raise trade's own call at a floor, rebuilt with the kit's builders from the Book the caller's node reads and its base
 * pair (`bookBasePairOf`), and the exact approval of what it pulls where the node reads the wallet's allowance short: a
 * buy in the base pair pulls it to the pad, a sale the Book's tokens. What a raise trade's steps must be, byte for byte
 * (`checkExactBookCalls`). On TraderBookPadV2 (`claims` pads) a sale names its recipient, which is the wallet that sells,
 * and a buy that closes the curve bonds the Book in the same transaction where the gas leaves the bond room, so a buy the
 * raise quote says may bond (its `mayBond`: the buy reaches the mark, and `minBondAt` falls within the quote's lifetime,
 * so it closes the curve wherever it lands from then on) or closes the curve (`closesCurve`) keeps the kit's bonding gas
 * (`mayBond` on the act's calls).
 */
export async function raiseCalls(
  chain: Pick<PublicClient, 'readContract'>,
  book: ChainBook,
  quote: Address,
  wallet: Address,
  r: { side: 'buy' | 'sell'; amountIn: bigint; payWith?: 'eth' | 'quote'; closesCurve?: boolean; mayBond?: boolean },
  minOut: bigint,
): Promise<{ payWith: 'eth' | 'quote'; expected: BookActCalls }> {
  if (r.side !== 'buy' && r.side !== 'sell') refuse('a raise trade is a buy or a sale')
  if (typeof r.amountIn !== 'bigint' || r.amountIn <= 0n) refuse('amountIn is raw units above zero')
  const d = book.deployment
  const isWeth = same(quote, BOOK_SHARED.weth)
  const payWith = r.payWith ?? (isWeth ? 'eth' : 'quote')
  if (payWith !== 'eth' && payWith !== 'quote') refuse('payWith is eth or quote')
  if (payWith === 'eth' && !isWeth) refuse(`this Book raises in ${quote}, not ether: pay with quote`)
  // a sale on the Books pad pays its seller, and on TraderBookPadV2 the recipient it names: the wallet that sells, always
  const call: BookCall = r.side === 'buy'
    ? payWith === 'eth' ? buyEthCall(d, book.bookId, minOut, wallet, r.amountIn) : buyCall(d, book.bookId, r.amountIn, minOut, wallet)
    : sellCall(d, book.bookId, r.amountIn, minOut, payWith, wallet)
  const pulled = r.side === 'buy' ? (payWith === 'quote' ? quote : null) : book.token
  let approval: BookActCalls['approval'] = null
  if (pulled) {
    const allowance = (await chain.readContract({ address: pulled, abi: erc20Abi, functionName: 'allowance', args: [wallet, d.pad.address] })) as bigint
    if (allowance < r.amountIn) approval = { token: pulled, spender: d.pad.address, amount: r.amountIn }
  }
  const mayBond = r.side === 'buy' && (r.closesCurve === true || r.mayBond === true) && bookPadKind(d) === 'claims'
  return { payWith, expected: { calls: [call], approval, ...(mayBond ? { mayBond: true } : {}) } }
}

/**
 * A settlement's own calls (`POST /v1/books/{token}/liquidation-quotes`): the vault's `syncTracked` first where the answer
 * names one, rebuilt from the tokens the caller's node reads the vault tracking, then the settler's `liquidate` rebuilt with
 * the kit's builder from the signed sales, each sale's route held to the vault's own rules leg by leg, and the call to the
 * kit's own liquidation check. The Book and vault the answer names must be the ones the node reads, and every sale pays
 * the Book's settlement asset as the settler on the node names it (`readBookSettleAsset`: WETH unless the Book settles in
 * its base pair), which an answer that names its asset must name too.
 */
export async function settlementCalls(
  chain: Pick<PublicClient, 'readContract'>,
  book: ChainBook,
  wallet: Address,
  answer: Pick<BookLiquidationQuotesResponse, 'bookId' | 'vault' | 'quotes' | 'preSync'> & { asset?: { token?: unknown } | null },
  router: Address,
): Promise<BookActCalls> {
  const d = book.deployment
  if (String(answer.bookId) !== book.bookId.toString() || !same(answer.vault, book.vault)) refuse('the settlement names another Book or vault than the Book your node reads')
  if (!Array.isArray(answer.quotes)) refuse('the settlement carries no sales')
  const asset = await readBookSettleAsset(chain, book)
  const named = answer.asset?.token
  if (named !== undefined && (typeof named !== 'string' || !same(named, asset))) refuse("the settlement names another settlement asset than the Book's settler on your node")
  const quotes = answer.quotes.map((x) => parseBookQuote(x))
  for (const q of quotes) vaultRouteCheck(q, book, router)
  const liquidate = liquidateCall(d, book.bookId, quotes)
  const wrong = liquidationCallMismatch(bookCallData(liquidate), { deployment: d, bookId: book.bookId, bookToken: book.token, quotes, ...(same(asset, BOOK_SHARED.weth) ? {} : { asset }) })
  if (wrong) refuse(`the settlement does not pass the kit's check: ${wrong}`)
  const calls: BookCall[] = []
  if (answer.preSync) calls.push(...(await bookActCalls(chain, book, wallet, 'syncTracked', {}, router)).expected.calls)
  calls.push(liquidate)
  // on a settler that settles in the base pair where chosen the asset can move until the liquidation runs, and the
  // liquidation then runs none of these sales: the sender reads the settler's word again right before it sends
  const settlesIn = bookSettlesInChosenAsset(d) ? { settler: getAddress(d.settler.address), abiSet: d.abiSet, bookId: book.bookId, pays: getAddress(asset) } : undefined
  return { calls, approval: null, ...(settlesIn ? { settlesIn } : {}) }
}

/**
 * Whether a settlement's signed sales (`POST /v1/books/{token}/liquidation-quotes`) all pay `asset`: the answer's own
 * `asset` where it names one, and every sale's `tokenOut`. Where the Book's settler names another asset on your node (a
 * trader or the creator moved it at the settler after Mancer signed), the sales are asked for again
 * (`Mancer.settleSteps`), since Mancer signs into the asset it reads at the head.
 */
export function settlementPaysAsset(answer: { quotes?: unknown; asset?: { token?: unknown } | null }, asset: Address): boolean {
  const named = answer.asset?.token
  if (named !== undefined && (typeof named !== 'string' || !same(named, asset))) return false
  if (!Array.isArray(answer.quotes)) return false
  return answer.quotes.every((q) => !!q && typeof q === 'object' && typeof (q as { tokenOut?: unknown }).tokenOut === 'string' && same((q as { tokenOut: string }).tokenOut, asset))
}

/**
 * A vault trade's or a sweep's quote (`POST /v1/books/{token}/vault-quote`) held to what was asked and to the Book the
 * caller's node reads: the tokens and the amount asked (a trade names the token it buys), a sweep sold for the Book's
 * settlement asset (`settleAsset`, `readBookSettleAsset` on the caller's node: WETH unless the Book settles in its base
 * pair, and WETH where none is named on a deployment whose settler settles every Book in WETH), the Book's own vault, and a
 * route held to the vault's own rules leg by leg (`vaultRouteCheck`). Its signed floor is the caller's to hold
 * (`holdSignedFloor`): the parsed quote is answered for it, or null where the answer carries no route (a sweep of the
 * settlement asset or of the Book's token).
 */
export function checkVaultQuote(answer: BookVaultQuoteResponse, body: Pick<BookVaultQuoteRequest, 'purpose' | 'tokenIn' | 'tokenOut' | 'amountIn'>, book: ChainBook, router: Address, settleAsset?: Address): BookQuote | null {
  if (!same(answer.tokenIn, body.tokenIn)) refuse('the vault quote spends another token')
  // a trade names what it buys: asked with none, the token is the API's choice, and a floor named in the caller's token
  // would be read against another
  if (body.purpose !== 'sweep' && !body.tokenOut) refuse('a vault trade names the token it buys (tokenOut)')
  if (body.tokenOut && !same(answer.tokenOut, body.tokenOut)) refuse('the vault quote buys another token')
  if (body.amountIn && answer.amountIn !== body.amountIn) refuse('the vault quote spends another amount')
  if (body.purpose === 'sweep') {
    // the settler sells a sweep's token for the Book's settlement asset alone (the account's `settlerSweep`), and an answer
    // that names the asset it counts in names the one the settler on your node names
    const routed = !!answer.route && answer.route !== '0x'
    const named = (answer as { settleAsset?: { token?: unknown } | null }).settleAsset?.token
    if (routed || named !== undefined) {
      if (settleAsset === undefined && bookSettlesInChosenAsset(book.deployment)) refuse("a sweep sells for the Book's settlement asset, which is read on your node (readBookSettleAsset) and named here")
      const asset = settleAsset ?? BOOK_SHARED.weth
      if (named !== undefined && (typeof named !== 'string' || !same(named, asset))) refuse("the sweep names another settlement asset than the Book's settler on your node")
      if (routed && !same(answer.tokenOut, asset)) refuse(same(asset, BOOK_SHARED.weth) ? 'a sweep sells for WETH' : "a sweep sells for the Book's settlement asset, its own base pair")
    }
  }
  if (!same(answer.vault, book.vault)) refuse('the vault quote names another vault than the Book your node reads')
  if (!answer.route || answer.route === '0x') return null
  const q = parseBookQuote({ ...answer, signature: answer.signature ?? '0x' })
  vaultRouteCheck(q, book, router)
  return q
}
