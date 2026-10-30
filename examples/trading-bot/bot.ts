// A Mancer trading bot with its own wallet, on @blockhash/mancer-sdk. In order: sign in, swap, a limit order, a send, a Book vault
// trade, then the account's events as they land. Each act is asked for as steps ready to sign, checked by the SDK against
// what was asked and the contracts it pins, simulated, and only then signed here. Every number printed is this run's.
// Run: npx tsx --env-file=.env bot.ts
import { erc20Abi, formatEther, getAddress, parseEther, parseEventLogs } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { ETH, Mancer, MancerCheckError, MancerError, executedOf, withRetry, type AccountEvent, type CheckedSteps, type SentStep, type StepReading } from '@blockhash/mancer-sdk'
import { botConfig, clientOptions, settingsOrExit, type BotConfig } from './config'
import { floorRule, referenceFor } from './reference'
import { balanceOf, show, tokenMeta, tokenRef, units } from './tokens'

const cfg = settingsOrExit(botConfig)
const account = privateKeyToAccount(cfg.key)
const mancer = new Mancer({ account, ...clientOptions(cfg) })
const wallet = account.address
const log = (line = '') => console.log(line)
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
const time = (sec: number | bigint) => new Date(Number(sec) * 1000).toISOString().replace('.000', '')

/** A step as the SDK read it back from its calldata; a router call in its tokens' own units, and the venue of each leg. */
async function readBack(r: StepReading): Promise<string> {
  const x = r.router
  if (!x) return r.does
  const to = x.recipient === 'sender' ? 'the sender' : x.recipient
  const venues = (r.legs ?? []).map((l) => (l.inner ? `${l.venue} > ${l.inner.venue}` : l.venue)).join(', ')
  return `spends ${await show(mancer, x.spends.token ?? ETH, x.spends.amount)} for at least ${await show(mancer, x.delivers.token ?? ETH, x.delivers.atLeast)} to ${to}, `
    + `Mancer's fee ${x.fee.bps} bps on the ${x.fee.side}, valid until ${time(x.deadline)}, through ${venues}`
}

/** The steps as the SDK read them back, and their simulation. */
async function printSteps(checked: CheckedSteps): Promise<void> {
  for (const [i, r] of checked.readings.entries()) log(`   step ${i}: ${r.kind} to ${r.to}, gas ${checked.steps[i]!.gas ?? 'unproven'}: ${await readBack(r)}`)
  const sim = checked.simulation
  log(`   simulation: ${sim.ok ? 'every step ran' : 'failed'} from ${wallet} at block ${sim.block}, gas used ${sim.outcome?.gasUsed?.join(' + ') ?? 'unread'}`)
}

const printSent = (sent: SentStep[]) => sent.forEach((s) => log(`   sent ${s.kind}: ${s.hash}, block ${s.receipt.blockNumber}, gas ${s.receipt.gasUsed}`))

/** 1. Sign in with the SDK: its message checked line by line, signed here, and turned into a session. */
async function signIn(): Promise<string> {
  log(`1. Sign in with the bot's own wallet, ${wallet}`)
  const session = await mancer.signIn()
  log(`   GET /auth/nonce, the message checked line by line (${cfg.signInDomain ?? 'mancer.xyz'}, this wallet, chain 4663, the nonce), personal_sign on this machine, POST /auth/verify`)
  log(`   a session for ${session.wallet} until ${time(session.expiresAt)}`)
  const trusted = await mancer.trustedContracts()
  log(`   GET /v1/contracts: router ${trusted.router} and orders ${trusted.orders}, the SDK's pins, their code on this node the reviewed builds`)
  // the log read to its head: where the live stream picks up, so it replays everything this run does
  const page = mancer.eventsSince('0')
  let next = await page.next()
  while (!next.done) next = await page.next()
  log(`   the account's event log stands at seq ${next.value}`)
  return next.value
}

/** 2. A swap of ether: the quote, its floor and what set it, the steps and their simulation, then the swap and what arrived. */
async function swap(c: BotConfig['swap']): Promise<void> {
  const tokenOut = tokenRef(mancer, c.tokenOut)
  const amountIn = parseEther(c.amount)
  log(`\n2. Swap ${c.amount} ETH into ${(await tokenMeta(mancer, tokenOut)).symbol}`)
  // the floor rule: the bot's own reference less its slippage, never the API's word unless TRUST_QUOTE=1 says so
  const floor = await floorRule(mancer, ETH, tokenOut, amountIn, cfg.slippageBps, cfg.trustQuote)
  const built = await mancer.buildSwap({ tokenIn: ETH, tokenOut, amountIn, slippageBps: cfg.slippageBps, ...floor.rule })
  const q = built.quote
  log(`   quote: ${await show(mancer, tokenOut, q.quotedAmountOut ?? q.amountOut)}, price impact ${q.priceImpactBps === undefined ? 'not measured by this quote' : `${q.priceImpactBps} bps`}, Mancer's fee ${q.fee.bps} bps`)
  log(`   floor: ${await show(mancer, tokenOut, built.minOut)}, set by ${await floor.why()}; the calldata must hold it`)
  await printSteps(built.checked)
  log("   checked: chain 4663, this wallet, the pinned router, the router call's tokens, amount, recipient, floor, fee and deadline, and every leg's venue")
  const sent = await mancer.sendSteps(built.checked)
  printSent(sent)
  const executed = executedOf(sent.at(-1)!.receipt, (await mancer.trustedContracts()).router)
  if (executed) log(`   arrived: ${await show(mancer, tokenOut, executed.amountOut)}, as the router's Executed event says (fee ${await show(mancer, executed.feeAsset, executed.feeAmount)})`)
}

/** 3. A limit order, priced against the market now: its setup's wrap and approval checked and sent, then the order signed. */
async function limitOrder(c: NonNullable<BotConfig['limit']>): Promise<void> {
  const sell = tokenRef(mancer, c.tokenIn), buy = tokenRef(mancer, c.tokenOut)
  if (buy === ETH) throw new Error('LIMIT_TOKEN_OUT is a token: an order is paid in WETH, not ether')
  const amountIn = await units(mancer, sell, c.amount)
  log(`\n3. A limit order: ${await show(mancer, sell, amountIn)} into ${(await tokenMeta(mancer, buy)).symbol}`)
  // the market by the bot's own reference, never by the API's quote: an order priced off a wrong quote fills at that price
  let market: bigint | null = null
  const ref = referenceFor(mancer, sell, buy)
  if (!c.price) {
    market = await ref.fn({ tokenIn: sell === ETH ? mancer.pinned.weth : sell, tokenOut: buy, amountIn })
    log(`   the market: ${ref.label()} pays ${await show(mancer, buy, market)} on this node now`)
  }
  const minOut = c.price
    ? (await units(mancer, buy, c.price)) * amountIn / 10n ** BigInt((await tokenMeta(mancer, sell)).decimals)
    : market! * BigInt(100 + c.vsMarketPct) / 100n
  const vs = market ? ` (${Number((minOut - market) * 10_000n / market) / 100}% against the market)` : ''
  log(`   the order asks at least ${await show(mancer, buy, minOut)}${vs}, ${c.price ? `LIMIT_PRICE ${c.price}` : `LIMIT_VS_MARKET_PCT ${c.vsMarketPct}`}`)
  const setup = await mancer.orderSetup({ tokenIn: sell, tokenOut: buy, amountPerFill: amountIn, totalFills: 1 })
  if (!setup) log('   setup: none, the wallet already holds and has approved what the order sells')
  else {
    log("   setup, checked: a wrap is a deposit into WETH, the approval the orders contract's for this order's pull")
    await printSteps(setup)
    printSent(await mancer.sendSteps(setup))
  }
  const expiry = Math.floor(Date.now() / 1000) + 7 * 86_400
  const placed = await mancer.placeLimit({ tokenIn: sell, tokenOut: buy, amountIn, minOut, expiry }, { setup: false })
  log(`   signed (EIP-712, every field checked against these terms) and placed: order ${placed.hash}, fee at most ${placed.order.maxFeeBps} bps, until ${time(expiry)}`)
}

/** 4. A send of ether: the transfer rebuilt by the SDK and matched byte for byte, simulated, then sent. */
async function send(c: NonNullable<BotConfig['send']>): Promise<void> {
  log(`\n4. Send ${c.amount} ETH to ${c.to}`)
  const built = await mancer.transfer({ to: c.to, asset: { kind: 'native' }, amount: parseEther(c.amount) }, { dryRun: true })
  log(`   checked: the step sends ${c.amount} ETH to ${built.recipient}, matched byte for byte${built.warnings.length ? `; the API warns: ${built.warnings.join(' ')}` : ''}`)
  await printSteps(built.checked)
  printSent(await mancer.sendSteps(built.checked))
}

/** 5. A trade of a Book's vault, for a Book this wallet trades for: Mancer's signed quote held to the bot's floor, its
 * route checked, then the proposal rebuilt by the SDK and sent. */
async function bookTrade(c: NonNullable<BotConfig['book']>): Promise<void> {
  const token = getAddress(c.token)
  log(`\n5. A trade of the vault of the Book ${token}`)
  // a Book opened moments ago answers 503 book-indexing for a second or so: asked again as the answer says
  const { book } = await withRetry(() => mancer.call('getBook', { path: { token } }), { tries: 6, onRetry: (e, _n, s) => log(`   ${e.code}: asking again in ${s} s`) })
  if (book.phase !== 'trading' || !book.vault) return log(`   skipped: the Book ${book.symbol} is ${book.phase}, and its vault trades only while it trades`)
  if (!book.traders.some((t) => same(t.address, wallet))) return log(`   skipped: this wallet is none of the ${book.traders.length} traders of ${book.symbol}, and only a trader proposes its trades`)
  log(`   the Book ${book.symbol} is trading, and this wallet is ${book.traders.length === 1 ? 'its one trader' : `one of its ${book.traders.length} traders`}`)
  const trusted = await mancer.trustedContracts()
  const sell = c.sell ? tokenRef(mancer, c.sell) : getAddress(book.quote.token)
  const buy = c.buy ? tokenRef(mancer, c.buy) : same(sell, trusted.weth) ? trusted.usdg : trusted.weth
  if (sell === ETH || buy === ETH) throw new Error('BOOK_SELL and BOOK_BUY are tokens: a vault trades WETH, not ether')
  const vault = getAddress(book.vault.address)
  const held = await balanceOf(mancer, sell, vault)
  const amountIn = c.amount ? await units(mancer, sell, c.amount) : held / 100n
  log(`   the vault ${vault} holds ${await show(mancer, sell, held)}; the trade sells ${await show(mancer, sell, amountIn)} for ${(await tokenMeta(mancer, buy)).symbol}`)
  const floor = await floorRule(mancer, sell, buy, amountIn, cfg.slippageBps, cfg.trustQuote)
  const { quote, sent } = await mancer.proposeVaultTrade(token, { tokenIn: sell, tokenOut: buy, amountIn: amountIn.toString() }, floor.rule)
  log(`   the bot's floor rule: ${await floor.why()}`)
  log(`   Mancer's signed quote: at least ${await show(mancer, buy, quote.minOut)}, held to that rule, simulated ${quote.simulation ? await show(mancer, buy, quote.simulation.amountOut) : 'unread'}, its route held to the vault's own rules`)
  log(`   its policy: impact ${quote.policy.impactBps} bps, ${quote.policy.divergenceBps ?? 'no'} bps from the reference prices, ${quote.policy.solo ? 'one trader, so it runs as proposed' : "several traders, so it waits for the others' confirmations"}`)
  printSent(sent)
  const got = parseEventLogs({ abi: erc20Abi, eventName: 'Transfer', logs: sent.at(-1)!.receipt.logs })
    .filter((l) => same(l.address, buy) && same(l.args.to, vault))
    .reduce((sum, l) => sum + l.args.value, 0n)
  log(got > 0n ? `   the vault received ${await show(mancer, buy, got)} (its Transfer in the receipt)` : "   the trade waits on the other traders' confirmations")
}

/** An account event in a line, its amounts in their tokens' units. */
async function describe(e: AccountEvent): Promise<string> {
  const d = e.data as Record<string, unknown>
  const amount = async (token: unknown, raw: unknown) => (typeof token === 'string' && typeof raw === 'string' ? show(mancer, getAddress(token), raw) : String(raw))
  const what = e.kind === 'order.placed'
    ? `order ${e.key} sells ${await amount(d.tokenIn, d.amountPerFill)} in ${d.totalFills} fill`
    : e.kind === 'order.filled'
      ? `order ${d.order} sold ${await amount(d.tokenIn, d.amountIn)} for ${await amount(d.tokenOut, d.amountOut)}, tx ${d.txHash}`
      : e.kind.startsWith('order.')
        ? `order ${e.key} is ${d.status}, ${d.fillsDone} of ${d.totalFills} fills${d.code ? ` (${d.code}: ${d.message})` : ''}`
        : e.kind.startsWith('notice.')
          ? `a ${d.kind} notice from ${d.actor}`
          : `Book ${d.symbol} is ${d.phase}${d.next !== undefined ? `, next for this wallet: ${d.next ?? 'nothing'}` : ''}${d.kind ? `, a ${d.kind} waits on this wallet` : ''}`
  return `#${e.seq} ${e.kind}: ${what}`
}

/** 6. The account's events: replayed from the log's head before this run, then each one as it lands, resumed after a drop. */
async function listen(since: string): Promise<void> {
  log(`\n6. The account's events from seq ${since}: what this run did, then each one as it lands`)
  const stream = await mancer.streamEvents({
    since,
    streamUrl: cfg.stream,
    onEvent: async (e) => log(`   ${await describe(e)}`),
    // an event this bot could not print is said, and the stream goes on
    onError: (e) => log(`   an event could not be read: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`),
    onReconnect: ({ reason, attempt }) => log(`   the socket dropped (${reason || 'it closed'}): joining again from seq ${stream.cursor}, try ${attempt}`),
    onEnd: ({ reason }) => { if (reason !== 'stopped') log(`   the stream ended: ${reason}`) },
  })
  log(`   joined the account's topic; the log's head is ${stream.joined?.head}, listening ${cfg.listenSeconds ? `${cfg.listenSeconds} s` : 'until Ctrl-C'}`)
  await new Promise<void>((done) => {
    process.once('SIGINT', () => done())
    if (cfg.listenSeconds) setTimeout(done, cfg.listenSeconds * 1000)
  })
  stream.stop()
  log(`   stopped at seq ${stream.cursor}; the wallet holds ${formatEther(await balanceOf(mancer, ETH, wallet))} ETH`)
}

async function main(): Promise<void> {
  const since = await signIn()
  await swap(cfg.swap)
  if (cfg.limit) await limitOrder(cfg.limit)
  else log('\n3. Limit order: skipped (LIMIT_AMOUNT is 0)')
  if (cfg.send) await send(cfg.send)
  else log('\n4. Send: skipped (SEND_TO is not set)')
  // a vault trade Mancer will not sign (its budget, its policy) or the SDK refuses is said, and the bot goes on
  if (cfg.book) {
    await bookTrade(cfg.book).catch((e) => {
      if (e instanceof MancerError) log(`   Mancer will not sign it: ${e.status} ${e.code}: ${e.message}`)
      else if (e instanceof MancerCheckError) log(`   refused before signing: ${e.message}`)
      else throw e
    })
  } else log('\n5. Book trade: skipped (BOOK_TOKEN is not set: name a Book this wallet trades for)')
  await listen(since)
}

main().then(
  () => process.exit(0),
  (e) => {
    if (e instanceof MancerCheckError) console.error(`\nrefused before signing: ${e.message}`)
    else if (e instanceof MancerError) console.error(`\nMancer answered ${e.status} ${e.code}: ${e.message}${e.retryable ? ' (retryable)' : ''}`)
    else console.error(`\nstopped: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`)
    process.exit(1)
  },
)
