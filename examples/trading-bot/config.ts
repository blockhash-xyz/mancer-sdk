// The bot's settings, read from its .env (`npx tsx --env-file=.env bot.ts` loads it into this process alone).
// Every number the bot trades with is here, in the operator's hands: none comes from the API or from a model.
import { readFileSync } from 'node:fs'
import type { Hex } from 'viem'
import type { MancerOptions } from '@blockhash/mancer-sdk'

export interface BotConfig {
  key: Hex
  api: string
  rpc: string
  /** A local stand-in of the API only: the domain its sign-in names (the SDK signs in to Mancer's own origins alone). */
  signInDomain: string | undefined
  /** A local stand-in of the chain only: a file of the Books deployments the SDK holds a Book to, in place of its pins. */
  bookDeploymentsFile: string | undefined
  /** Let Mancer's own quote set a floor where the bot's node prices no Uniswap V3 pool of the pair. */
  trustQuote: boolean
  stream: string
  slippageBps: number
  swap: { amount: string; tokenOut: string }
  /** Null where LIMIT_AMOUNT is 0: no order is placed. */
  limit: { tokenIn: string; tokenOut: string; amount: string; price: string | null; vsMarketPct: number } | null
  /** Null where SEND_TO is empty: nothing is sent. */
  send: { to: string; amount: string } | null
  /** Null where BOOK_TOKEN is empty: no Book trade. */
  book: { token: string; sell: string | null; buy: string | null; amount: string | null } | null
  /** How long to hear the account's events, in seconds; 0 until Ctrl-C. */
  listenSeconds: number
}

export interface AgentConfig {
  key: Hex
  api: string
  rpc: string
  signInDomain: string | undefined
  bookDeploymentsFile: string | undefined
  trustQuote: boolean
  provider: 'anthropic' | 'stub'
  model: string
  stubProposal: string
  /** The tokens the model may name, symbol to address, in the operator's own words. */
  tokens: Record<string, string>
  rails: { maxTradeBps: number; dailyCapBps: number; maxImpactBps: number; slippageBps: number; gasFloorEth: string }
  /** False: build, check and simulate the trade, and sign nothing. */
  send: boolean
  ledger: string
}

type Env = Record<string, string | undefined>

/** The SDK's client options from the settings. A sign-in domain and Books deployments are named only for a local
 * stand-in of the API and the chain (fork/up.sh writes both); unset, the SDK signs in to Mancer's own API alone and holds
 * every Book to the kit's pinned deployments. */
export function clientOptions(c: Pick<BotConfig, 'api' | 'rpc' | 'signInDomain' | 'bookDeploymentsFile'>): MancerOptions {
  return {
    baseUrl: c.api,
    rpcUrl: c.rpc,
    ...(c.signInDomain ? { signInDomain: c.signInDomain } : {}),
    ...(c.bookDeploymentsFile ? { bookDeployments: [JSON.parse(readFileSync(c.bookDeploymentsFile, 'utf8'))].flat() } : {}),
  }
}

/** The settings, or the first one that is wrong, said in a line, and the process ended. */
export function settingsOrExit<T>(read: (env: Env) => T): T {
  try {
    return read(process.env)
  } catch (e) {
    console.error(`the .env is not right: ${e instanceof Error ? e.message : String(e)}`)
    process.exit(2)
  }
}

function text(env: Env, name: string, fallback: string): string {
  const v = env[name]?.trim()
  return v ? v : fallback
}

function int(env: Env, name: string, fallback: number, min: number, max: number): number {
  const v = Number(text(env, name, String(fallback)))
  if (!Number.isInteger(v) || v < min || v > max) throw new Error(`${name} is a whole number from ${min} to ${max}`)
  return v
}

function amount(env: Env, name: string, fallback: string): string {
  const v = text(env, name, fallback)
  if (!/^\d+(\.\d+)?$/.test(v)) throw new Error(`${name} is an amount like 0.001`)
  return v
}

function key(env: Env): Hex {
  const k = env.BOT_PRIVATE_KEY?.trim()
  if (!k || !/^0x[0-9a-fA-F]{64}$/.test(k)) throw new Error('BOT_PRIVATE_KEY is missing from .env, or is not a 32-byte hex key')
  return k as Hex
}

const common = (env: Env) => ({
  key: key(env),
  api: text(env, 'MANCER_API_URL', 'https://api.mancer.xyz'),
  rpc: text(env, 'MANCER_RPC_URL', 'https://rpc.mainnet.chain.robinhood.com'),
  trustQuote: text(env, 'TRUST_QUOTE', '0') === '1',
  signInDomain: text(env, 'MANCER_SIGN_IN_DOMAIN', '') || undefined,
  bookDeploymentsFile: text(env, 'BOOK_DEPLOYMENTS_FILE', '') || undefined,
})

export function botConfig(env: Env): BotConfig {
  const limitAmount = amount(env, 'LIMIT_AMOUNT', '0.25')
  const sendTo = text(env, 'SEND_TO', '')
  const book = text(env, 'BOOK_TOKEN', '')
  return {
    ...common(env),
    stream: text(env, 'MANCER_STREAM_URL', 'wss://stream.mancer.xyz/socket'),
    slippageBps: int(env, 'SLIPPAGE_BPS', 50, 1, 1_000),
    swap: { amount: amount(env, 'SWAP_AMOUNT', '0.001'), tokenOut: text(env, 'SWAP_TOKEN_OUT', 'USDG') },
    limit: Number(limitAmount) === 0 ? null : {
      tokenIn: text(env, 'LIMIT_TOKEN_IN', 'ETH'),
      tokenOut: text(env, 'LIMIT_TOKEN_OUT', 'USDG'),
      amount: limitAmount,
      price: env.LIMIT_PRICE?.trim() ? amount(env, 'LIMIT_PRICE', '0') : null,
      vsMarketPct: int(env, 'LIMIT_VS_MARKET_PCT', 50, -50, 1_000),
    },
    send: sendTo ? { to: sendTo, amount: amount(env, 'SEND_AMOUNT', '0.01') } : null,
    book: book ? {
      token: book,
      sell: text(env, 'BOOK_SELL', '') || null,
      buy: text(env, 'BOOK_BUY', '') || null,
      amount: env.BOOK_AMOUNT?.trim() ? amount(env, 'BOOK_AMOUNT', '0') : null,
    } : null,
    listenSeconds: int(env, 'LISTEN_SECONDS', 0, 0, 86_400),
  }
}

export function agentConfig(env: Env): AgentConfig {
  const provider = text(env, 'MODEL_PROVIDER', 'anthropic')
  if (provider !== 'anthropic' && provider !== 'stub') throw new Error('MODEL_PROVIDER is anthropic or stub')
  const tokens: Record<string, string> = {}
  for (const pair of text(env, 'AGENT_TOKENS', 'USDG=0x5fc5360d0400a0fd4f2af552add042d716f1d168,MANCER=0xc72f232a6869e6cf34dc06129affd07f8a2a246a').split(',')) {
    const [symbol, address] = pair.split('=').map((s) => s.trim())
    if (!symbol || !/^[A-Za-z0-9]{1,16}$/.test(symbol) || !address || !/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error('AGENT_TOKENS is SYMBOL=0xaddress pairs, comma separated')
    tokens[symbol] = address
  }
  return {
    ...common(env),
    provider,
    model: text(env, 'MODEL', 'claude-opus-5-5'),
    stubProposal: text(env, 'STUB_PROPOSAL', '{"token":"USDG","side":"buy","shareBps":50,"reason":"a small test buy"}'),
    tokens,
    rails: {
      maxTradeBps: int(env, 'RAIL_MAX_TRADE_BPS', 200, 1, 10_000),
      dailyCapBps: int(env, 'RAIL_DAILY_CAP_BPS', 1_000, 1, 10_000),
      maxImpactBps: int(env, 'RAIL_MAX_IMPACT_BPS', 100, 0, 10_000),
      slippageBps: int(env, 'RAIL_SLIPPAGE_BPS', 50, 1, 1_000),
      gasFloorEth: amount(env, 'RAIL_GAS_FLOOR_ETH', '0.002'),
    },
    send: text(env, 'AGENT_SEND', '0') === '1',
    ledger: text(env, 'AGENT_LEDGER', 'agent-ledger.json'),
  }
}
