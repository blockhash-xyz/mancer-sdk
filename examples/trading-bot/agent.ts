// An AI agent on the bot's wallet: a model proposes one swap, and the bot's own code decides. The rails (rails.ts) check
// the proposal's size, the day's total and the gas floor; Mancer builds it; the SDK checks its steps and their simulation;
// the rails check its price impact; and only then does the bot sign. The model holds no key and writes no amount.
// Run: npx tsx --env-file=.env agent.ts   (AGENT_SEND=1 signs and sends; otherwise a dry run)
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { formatEther, formatUnits, getAddress, parseEther } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { ETH, Mancer, MancerCheckError, MancerError, executedOf } from '@blockhash/mancer-sdk'
import { agentConfig, clientOptions, settingsOrExit } from './config'
import { anthropicProposal, stubProposal } from './model'
import { runRound, type Ledger, type WalletView } from './rails'
import { floorRule, referenceFor, referenceImpactBps } from './reference'
import { balanceOf, show, tokenMeta } from './tokens'

const cfg = settingsOrExit(agentConfig)
const account = privateKeyToAccount(cfg.key)
const mancer = new Mancer({ account, ...clientOptions(cfg) })
const log = (line: string) => console.log(`   ${line}`)
const symbols = Object.keys(cfg.tokens)

/** The wallet from its own node, each listed token valued by the bot's own reference (a Uniswap V3 pool on its node),
 * never by the API's quote: the rails size every trade against these values. */
async function readWallet(): Promise<WalletView> {
  const eth = await balanceOf(mancer, ETH, account.address)
  const tokens = await Promise.all(Object.entries(cfg.tokens).map(async ([symbol, a]) => {
    const address = getAddress(a)
    const balance = await balanceOf(mancer, address, account.address)
    const worth = balance === 0n ? 0n : await referenceFor(mancer, address, ETH).fn({ tokenIn: address, tokenOut: mancer.pinned.weth, amountIn: balance }).catch(() => null)
    return { symbol, address, balance, valueWei: worth }
  }))
  return { eth, tokens }
}

/** What the model reads: the operator's own token names, the balances and the rails, as data. */
async function summaryOf(w: WalletView): Promise<string> {
  const lines = [`The wallet holds ${formatEther(w.eth)} ETH.`]
  for (const t of w.tokens) lines.push(`${t.symbol}: ${formatUnits(t.balance, (await tokenMeta(mancer, t.address)).decimals)}, worth ${t.valueWei === null ? 'an unknown amount of' : formatEther(t.valueWei)} ETH.`)
  lines.push(`One trade may be worth at most ${cfg.rails.maxTradeBps / 100}% of the wallet, and a day's trades ${cfg.rails.dailyCapBps / 100}%.`)
  lines.push(`You may name only these tokens: ${symbols.join(', ')}.`)
  return lines.join('\n')
}

async function main(): Promise<void> {
  console.log(`An agent round for ${account.address}: ${cfg.provider === 'stub' ? 'the offline stub' : cfg.model} proposes, the bot's rails decide`)
  const session = await mancer.signIn()
  log(`signed in with the wallet (GET /auth/nonce, the message checked line by line, personal_sign, POST /auth/verify): a session until ${new Date(session.expiresAt * 1000).toISOString().replace('.000', '')}`)
  const wallet = await readWallet()
  const summary = await summaryOf(wallet)
  summary.split('\n').forEach((l) => log(`the model reads: ${l}`))
  const ledger: Ledger = existsSync(cfg.ledger) ? JSON.parse(readFileSync(cfg.ledger, 'utf8')) : []
  const result = await runRound({
    propose: cfg.provider === 'stub' ? stubProposal(cfg.stubProposal) : () => anthropicProposal(summary, symbols, cfg.model),
    tokens: symbols,
    wallet,
    ledger,
    rails: { ...cfg.rails, gasFloorWei: parseEther(cfg.rails.gasFloorEth) },
    nowMs: Date.now(),
    // the build's floor rule is the bot's own reference less its slippage, never the API's word
    build: async (t) => {
      const floor = await floorRule(mancer, t.tokenIn, t.tokenOut, t.amountIn, cfg.rails.slippageBps, cfg.trustQuote)
      const built = await mancer.buildSwap({ tokenIn: t.tokenIn, tokenOut: t.tokenOut, amountIn: t.amountIn, slippageBps: cfg.rails.slippageBps, ...floor.rule })
      log(`the floor: ${await show(mancer, t.tokenOut, built.minOut)}, set by ${await floor.why()}`)
      return { built, referenceImpactBps: floor.ref ? await referenceImpactBps(mancer, t.tokenIn, t.tokenOut, t.amountIn, floor.ref) : null }
    },
    send: cfg.send
      ? async (built) => {
          const sent = await mancer.sendSteps(built.checked)
          for (const s of sent) log(`sent ${s.kind}: ${s.hash}, block ${s.receipt.blockNumber}`)
          const executed = executedOf(sent.at(-1)!.receipt, (await mancer.trustedContracts()).router)
          const out = built.checked.readings.at(-1)?.router?.delivers.token ?? ETH
          if (executed) log(`arrived: ${await show(mancer, out, executed.amountOut)}, as the router's Executed event says`)
          return sent.map((s) => s.hash)
        }
      : null,
    log,
  })
  if (result.outcome === 'sent') writeFileSync(cfg.ledger, JSON.stringify(ledger, null, 1))
}

main().then(
  () => process.exit(0),
  (e) => {
    if (e instanceof MancerCheckError) console.error(`refused before signing: ${e.message}`)
    else if (e instanceof MancerError) console.error(`Mancer answered ${e.status} ${e.code}: ${e.message}`)
    else console.error(`stopped: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`)
    process.exit(1)
  },
)
