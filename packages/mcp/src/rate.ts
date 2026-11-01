import { createHash, timingSafeEqual } from 'node:crypto'
import type { Inbound } from './api'
import { inboundBearer } from './api'
import type { Config } from './config'

/**
 * This server's own rate bucket on tool calls, beside the API's (which every call pays as the caller's own request). It
 * keeps one caller from holding the server: a tool call costs a few of the API's requests, and those are the limits that
 * count.
 *
 * - A stdio server has one caller, the machine it runs on: `local`.
 * - Over HTTP a caller is its address: the address Cloudflare proved, where the request carries the proof this server
 *   holds (`MANCER_MCP_EDGE_SECRET`), and the socket's otherwise. A `CF-Connecting-IP` with no proof is anyone's word and
 *   is never believed: every caller the server cannot place shares the socket's one bucket. An IPv6 address counts as its
 *   /64, the block one machine is given whole, so a caller cannot multiply its buckets and its session cap by the
 *   addresses of its own block.
 * - Over HTTP a tool call pays its MCP session's bucket (`callerBuckets`' `session`): callers behind one shared address (a
 *   hosted agent platform's egress) each have their own pace. Sessions are opened under the address's own bucket of new
 *   sessions and its cap of sessions not signed in (http.ts), so one address's tool calls are bounded by those.
 * - A call that carries an API key also pays the key's own bucket, at a key's larger rate, beside its session's (or with no
 *   session named, its address's) at the same rate: a key this server cannot check (the API does) never buys a session
 *   more than one key's room.
 */

export interface BucketRule {
  key: string
  /** Tokens a second. */
  rate: number
  burst: number
}

export const ANONYMOUS_CALLS = { rate: 5, burst: 30 } as const
export const KEYED_CALLS = { rate: 20, burst: 60 } as const
export const LOCAL_CALLS = { rate: 20, burst: 60 } as const

const sameSecret = (a: string, b: string) => {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/** Whether a proof a request carries is this server's, compared in constant time. */
export const sameProof = (a: string, b: string): boolean => sameSecret(a, b)

/** An address as a caller holds it: an IPv6 address's /64, an IPv4-mapped one as its IPv4 address, an IPv4 one alone. */
export function addressBlock(ip: string): string {
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip)
  if (mapped) return mapped[1]!
  if (!ip.includes(':') || !/^[0-9a-fA-F:]+$/.test(ip)) return ip
  const parts = ip.split('::')
  if (parts.length > 2) return ip
  const head = parts[0] ? parts[0].split(':') : []
  const tail = parts.length === 2 && parts[1] ? parts[1].split(':') : []
  const fill = 8 - head.length - tail.length
  if (parts.length === 1 ? fill !== 0 : fill < 1) return ip
  const groups = [...head, ...Array<string>(parts.length === 2 ? fill : 0).fill('0'), ...tail]
  if (groups.some((g) => g.length === 0 || g.length > 4)) return ip
  return `${groups.slice(0, 4).map((g) => g.toLowerCase().replace(/^0+(?=.)/, '')).join(':')}::/64`
}

/**
 * The wider block an address is one of, as a caller's address (`callerAddress`) names it: an IPv6 /64's /48 (a site's
 * allocation: a free tunnel broker's, a host's, a home's /56 within it), and an IPv4 address's /24. Every session cap past
 * one address's reads it, so a block of addresses one party holds is never more than one party's room. Anything else is
 * its own block.
 */
export function prefixOf(owner: string): string {
  const m = /^(cf|sock):(.*)$/.exec(owner)
  if (!m) return owner
  const [, kind, block] = m as unknown as [string, string, string]
  const v6 = /^([0-9a-f]{1,4}):([0-9a-f]{1,4}):([0-9a-f]{1,4}):[0-9a-f]{1,4}::\/64$/.exec(block)
  if (v6) return `${kind}:${v6[1]}:${v6[2]}:${v6[3]}::/48`
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/.exec(block)
  if (v4) return `${kind}:${v4[1]}.${v4[2]}.${v4[3]}.0/24`
  return owner
}

/** Where a call came from, as this server can tell it. */
export function callerAddress(config: Config, inbound: Inbound): string {
  const ip = inbound.headers['cf-connecting-ip']
  const proof = inbound.headers['x-mancer-edge']
  if (config.edgeSecret && ip && proof && /^[0-9a-fA-F:.]{2,45}$/.test(ip) && sameSecret(proof, config.edgeSecret)) return `cf:${addressBlock(ip)}`
  return `sock:${inbound.socket ? addressBlock(inbound.socket) : 'unknown'}`
}

/** The buckets one tool call pays: its MCP session's where it names one (every call over HTTP), else its address's. */
export function callerBuckets(config: Config, inbound: Inbound | null, session?: string): BucketRule[] {
  if (!inbound) return [{ key: 'local', ...LOCAL_CALLS }]
  const who = session ? `s:${session}` : callerAddress(config, inbound)
  const key = inboundBearer(inbound) ?? config.apiKey
  if (!key) return [{ key: `anon|${who}`, ...ANONYMOUS_CALLS }]
  const id = createHash('sha256').update(key).digest('hex').slice(0, 16)
  return [
    { key: `key|${id}`, ...KEYED_CALLS },
    { key: `keyed|${who}`, ...KEYED_CALLS },
  ]
}

interface Bucket {
  tokens: number
  at: number
  rate: number
  burst: number
}

export class Limiter {
  readonly #buckets = new Map<string, Bucket>()
  readonly #now: () => number

  constructor(now: () => number = () => Date.now()) {
    this.#now = now
  }

  /** Charges one call to every bucket, all or none; where one is empty, how many whole seconds until it is not. */
  take(rules: readonly BucketRule[]): { ok: true } | { ok: false; retryAfterSeconds: number } {
    const now = this.#now()
    const held = rules.map((r) => {
      const b = this.#buckets.get(r.key)
      const tokens = b ? Math.min(r.burst, b.tokens + ((now - b.at) / 1000) * r.rate) : r.burst
      return { r, tokens }
    })
    const wait = Math.max(0, ...held.map(({ r, tokens }) => (1 - tokens) / r.rate))
    const ok = held.every(({ tokens }) => tokens >= 1)
    for (const { r, tokens } of held) {
      this.#buckets.delete(r.key)
      this.#buckets.set(r.key, { tokens: ok ? tokens - 1 : tokens, at: now, rate: r.rate, burst: r.burst })
    }
    if (this.#buckets.size > 50_000) {
      for (const [k, b] of this.#buckets) if (b.tokens + ((now - b.at) / 1000) * b.rate >= b.burst) this.#buckets.delete(k)
    }
    return ok ? { ok: true } : { ok: false, retryAfterSeconds: Math.max(1, Math.ceil(wait - 1e-9)) }
  }
}
