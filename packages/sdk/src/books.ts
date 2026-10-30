import { erc20Abi, getAddress, keccak256, zeroAddress, type Abi, type Address, type Hex, type PublicClient } from 'viem'
import { legRefusal, type BookActCalls } from './checks'
import { MancerCheckError } from './errors'
import { floorKind, type FloorRule } from './floor'
import {
  BOOK_ABIS,
  BOOK_DEPLOYMENTS,
  BOOK_SHARED,
  abortCall,
  armCall,
  bondCall,
  bookAbisFor,
  bookTradeIntentFromQuote,
  cancelOrderCall,
  claimCreatorCutCall,
  claimFeesCall,
  confirmTradeCall,
  executeTradeCall,
  graduateCall,
  harvestCall,
  parseBookQuote,
  proposeTradeCall,
  readRouterLegs,
  redeemCall,
  revokeAllowanceCall,
  revokeOrdersCall,
  stakeCall,
  sweepLeftoverCall,
  sweepUnownedCall,
  syncTaxCall,
  syncTrackedCall,
  unstakeCall,
  vaultRouteMismatch,
  type BookDeployment,
  type BookQuote,
  type BookTradeIntent,
} from './shared'

/**
 * A Book as the caller's own node reads it, and each of its acts rebuilt from the kit's builders
 * (the contracts kit's books/calls.ts) out of the arguments the caller asked for: what `checkBookSteps` holds the
 * API's steps to, byte for byte. Nothing here takes the API's word for a vault, an id, an amount or a route.
 */

export type BookAction =
  | 'arm' | 'abort' | 'graduate' | 'bond' | 'proposeTrade' | 'confirmTrade' | 'executeTrade' | 'cancelOrder' | 'revokeOrders'
  | 'revokeAllowance' | 'syncTax' | 'syncTracked' | 'stake' | 'unstake' | 'claim' | 'harvest' | 'sweepUnowned' | 'sweepLeftover'
  | 'redeem' | 'claimCreatorCut'

/** What an act takes beside its Book: as the steps route takes them, `amount` a bigint or `'all'`. An act that signs a
 * trade's floor (`proposeTrade`, `confirmTrade`, `executeTrade`, a signed `sweepLeftover`) names its floor rule beside
 * them, as a swap does, and the floor the trade carries is held to it. */
export interface BookActArgs extends FloorRule {
  amount?: bigint | 'all'
  /** A signed quote from `vaultQuote` (`proposeTrade`, and `sweepLeftover` of a token it sells). */
  quote?: unknown
  /** `sweepLeftover` of WETH or the Book's own token, and `revokeAllowance`'s token. */
  token?: Address
  spender?: Address
  orderHash?: Hex
  tokens?: Address[]
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
  const abis = BOOK_ABIS.books as unknown as Record<string, Abi>
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
  switch (action) {
    case 'arm': return one([armCall(d, id)])
    case 'abort': return one([abortCall(d, id)])
    case 'graduate': return one([graduateCall(d, id)])
    case 'bond': return one([bondCall(d, id)])
    case 'claim': return one([claimFeesCall(d, id)])
    case 'harvest': return one([harvestCall(d, id)])
    case 'sweepUnowned': return one([sweepUnownedCall(d, id)])
    case 'claimCreatorCut': return one([claimCreatorCutCall(d, id)])
    case 'executeTrade': {
      const pending = intentOfPending((await read(vault, abis.account!, 'pending')) as readonly unknown[])
      if (same(pending.adapter, zeroAddress)) refuse('the vault holds no pending trade')
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
      vaultRouteCheck({ ...pending, salt: pending.quoteSalt, signature: pending.mancerSig }, book, router)
      await floored(pending)
      return one([confirmTradeCall(d, vault, pending)])
    }
    case 'sweepLeftover': {
      if (args.quote !== undefined) {
        const q = parseBookQuote(args.quote)
        vaultRouteCheck(q, book, router)
        await floored(q)
        return one([sweepLeftoverCall(d, id, q)], { quote: args.quote })
      }
      const token = args.token
      if (!token || !(same(token, BOOK_SHARED.weth) || same(token, book.token))) return refuse('a sweep names WETH or the Book\'s own token, or carries a signed sweep quote')
      const q: BookQuote = { adapter: zeroAddress, tokenIn: token, tokenOut: zeroAddress, amountIn: 0n, minOut: 0n, route: '0x', deadline: 0n, salt: 0n, signature: '0x' }
      return one([sweepLeftoverCall(d, id, q)], { token })
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
