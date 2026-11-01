import { z } from 'zod'
import type { Address } from 'viem'
import type { Asker } from './api'
import type { Config } from './config'
import type { Connection } from './connection'
import { addressOf, ToolRefusal } from './values'

/**
 * One tool: its name, what it does in plain sentences, its arguments, and what it does to the world. A `read` and a
 * `build` change nothing (a build answers unsigned transactions, typed data or a message for the caller's own wallet); a
 * `write` changes a record on Mancer (an order taken, a vote, a follow) or sends what the caller signed; `session` is the
 * connection's own sign-in. `needs: 'sign-in'` is a tool of the account's (or one only a credential reaches): asked with
 * no sign-in and no API key, it refuses `sign-in-required` before it asks the API anything.
 */
export interface ToolContext {
  /** Asks one route of the API as the caller (api.ts). */
  api: Asker
  /** The wallet a tool defaults to where none is named: the one signed in on this connection, else the one the call's
   * wallet key acts as (key-wallet.ts), asked of the API at most once a call and only when a tool asks for it. */
  defaultWallet: () => Promise<DefaultWallet>
  /** Set by `walletOf` when it took the wallet key's wallet, so the answer says whose it is (server.ts). */
  keyDefault: Address | null
  /** Whether a call carries a credential the API reads: a sign-in, or an API key. */
  credentialed: boolean
  connection: Connection
  config: Config
}

/** The wallet a tool defaults to, and where it came from; `why` says why there is none (key-wallet.ts). */
export type DefaultWallet =
  | { wallet: Address; from: 'sign-in' | 'key' }
  | { wallet: null; from: null; why: 'none' | 'no-wallet' | 'no-read' | 'unread' }

export type ToolKind = 'read' | 'build' | 'write' | 'session'

export interface ToolSpec {
  name: string
  title: string
  description: string
  shape: Record<string, z.ZodTypeAny>
  kind: ToolKind
  needs?: 'sign-in'
  run: (ctx: ToolContext, args: any) => Promise<Record<string, unknown>>
}

export function tool(spec: ToolSpec): ToolSpec {
  return spec
}

/**
 * The wallet a tool is for: the one named, else the one signed in, else the wallet key's (marked on the answer: a key, unlike
 * a sign-in, does not prove which wallet the agent signs with), else `wallet-required`; `key-wallet-unread`, which may be
 * asked again, where the API did not answer whose the key is.
 */
export async function walletOf(ctx: ToolContext, named: string | undefined, what = 'wallet'): Promise<Address> {
  if (named !== undefined && named !== null && String(named).trim() !== '') return addressOf(named, what)
  const d = await ctx.defaultWallet()
  if (d.wallet) {
    if (d.from === 'key') ctx.keyDefault = d.wallet
    return d.wallet
  }
  if (d.why === 'unread') {
    throw new ToolRefusal({
      error: `Mancer did not answer just now which wallet the API key acts as. Name ${what}, or call again.`,
      code: 'key-wallet-unread',
      retryable: true,
      retryAfterSeconds: 2,
    })
  }
  throw new ToolRefusal({
    error: `Name ${what}: the wallet that signs and sends. A signed-in wallet, or the wallet a wallet key acts as, is the default.`,
    code: 'wallet-required',
    retryable: false,
    hint: d.why === 'no-read'
      ? 'The API key may not read its account (it has no read scope), so it names no wallet: name the wallet, or call sign_in.'
      : 'Name the wallet, or call sign_in: a tool defaults to the signed-in wallet, or to the wallet a wallet key acts as.',
  })
}

/** The default wallet where there is one (marked as `walletOf` marks it), else nothing: for a read that takes a wallet as
 * an option. */
export async function defaultOrNone(ctx: ToolContext): Promise<Address | undefined> {
  const d = await ctx.defaultWallet()
  if (!d.wallet) return undefined
  if (d.from === 'key') ctx.keyDefault = d.wallet
  return d.wallet
}

// The argument shapes the tools share, each described once.
export const token = (what: string) => z.string().describe(`${what}: the token's address, or ETH for native ether. A symbol alone is never taken.`)
export const address = (what: string) => z.string().describe(`${what}: an address, 0x and 40 hex digits.`)
/** A wallet a build is for, which defaults to the signed-in wallet or the wallet key's. */
export const wallet = (what: string) => z.string().optional().describe(`${what}: an address. The signed-in wallet, or the wallet key's, by default.`)
export const amount = (what: string) => z.string().describe(`${what}: a decimal number in the token's own units, such as "0.25".`)
export const limit = (max: number, dflt: number) => z.number().int().min(1).max(max).optional().describe(`How many, 1 to ${max}; ${dflt} by default.`)
export const id = (what: string) => z.string().describe(`${what}: an address, or a username.`)
export const bps = (what: string, min: number, max: number) => z.number().int().min(min).max(max).optional().describe(`${what}, in basis points (${min} to ${max}).`)
