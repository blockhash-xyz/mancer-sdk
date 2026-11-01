/**
 * The server's settings, read once from its environment. None of them is a wallet's key: this server signs nothing and
 * holds no key of a wallet's, anywhere.
 *
 * - `MANCER_API_URL`: the API it asks, `https://api.mancer.xyz` by default. Mancer's own hosted copy asks the API over its
 *   own internal network.
 * - `MANCER_API_KEY`: an API key sent on every call, where the caller's own request names none and no wallet is signed in.
 *   Optional: nothing that ends in the wallet's own signature needs one. A key is the API's to read: it raises the rate
 *   limits, lifts the stock geofence for its holder as the API's rules do for any key, reads back the orders submitted
 *   through it, and carries whatever terms Mancer gave it (a partner's fee terms, Books signing).
 * - `MANCER_MCP_RPC_URL`: a node of the operator's own, for a local copy that takes no API's word for the chain. Every
 *   chain read this server makes (a token's decimals, a Book's id and vault, its base pair, a vault's pending trade, a
 *   balance, the maker's epoch, the pool a trustQuote floor is held beside, a receipt) goes to that node; unset, they go
 *   through the API's own chain door (`POST /rpc`), as Mancer's hosted copy reads them. Never printed: a node's URL can
 *   carry its token. A signed transaction is still sent through the API's door (`send_signed_transaction`).
 * - `MANCER_SIGN_IN_DOMAIN`: the domain Mancer's sign-in message must name before an agent is asked to sign it. Unset, it
 *   is `mancer.xyz` where the API is Mancer's own, and no sign-in is offered on any other API: a copy pointed at a host
 *   that is not Mancer's never hands an agent Mancer's sign-in to sign for that host.
 * - `MANCER_MCP_FORWARD_EDGE=1`: the hosted copy alone sets it. Each call then carries the caller's own `CF-Connecting-IP`,
 *   `CF-IPCountry`, `X-Mancer-Edge` and `User-Agent` as the request to this server carried them, so the API reads the
 *   caller as if it had called it (its rate buckets and the stock rule by its region). The API believes the address and the
 *   country only where `X-Mancer-Edge` is the proof Cloudflare stamps, a secret the caller does not hold. It needs
 *   `MANCER_MCP_EDGE_SECRET`: without it the server refuses to start.
 * - `MANCER_MCP_EDGE_SECRET`: the same proof, so this server's own buckets and session caps count a caller by its proven
 *   address. A request without the proof is counted by its socket: no `CF-Connecting-IP` is believed without it.
 * - `MANCER_MCP_HOST`, `MANCER_MCP_PORT`: where `serve` listens, `127.0.0.1:8790` by default.
 * - `MANCER_MCP_ALLOWED_HOSTS`: the `Host` values `serve` answers (comma separated). By default, the loopback names of its
 *   port where it listens on loopback, and any where it listens beyond it.
 * - `MANCER_MCP_ALLOWED_ORIGINS`: the browser origins `serve` answers; none by default, so a page cannot drive it.
 * - `MANCER_MCP_SESSION_IDLE_SEC` (3,600), `MANCER_MCP_MAX_SESSIONS` (2,000), `MANCER_MCP_MAX_SESSIONS_PER_ADDRESS` (32) and
 *   `MANCER_MCP_MAX_SESSIONS_PER_PREFIX` (256): how long a connection's sign-in is kept with no request, how many
 *   connections at most, how many not signed in one caller's address holds at once (an IPv6 caller by its /64), and how
 *   many not signed in the addresses of one block hold (an IPv6 /48, an IPv4 /24). At the cap of all a newcomer takes the
 *   place of a session not signed in of the block holding more than its fair share (http.ts). A connection's cost to this
 *   process is measured in http.ts's header.
 * - `MANCER_MCP_MAX_SIGNED_IN_PER_WALLET` (8) and `MANCER_MCP_MAX_SIGNED_IN` (three quarters of the cap of all): how many
 *   signed-in connections one wallet holds, its own least lately used going past it, and how many signed-in connections
 *   the process holds in all, a sign-in past it refused. A signed-in connection is no address's: callers behind one shared
 *   address (a hosted agent platform's) never end each other's, and it is never ended for another wallet's.
 */

export interface HttpSettings {
  host: string
  port: number
  /** The `Host` values answered, as named. Empty: the loopback names of the bound port where `serve` listens on loopback,
   * and any `Host` where it listens beyond it. */
  allowedHosts: string[]
  /** The browser `Origin` values answered. */
  allowedOrigins: string[]
}

export interface Config {
  /** The API's origin, with no trailing slash. */
  apiUrl: string
  apiKey: string | null
  /** The operator's own node, where one is named: every chain read goes there and not through the API's `/rpc`. */
  rpcUrl: string | null
  /** The domain the sign-in message must name, or null where no sign-in is offered. */
  signInDomain: string | null
  forwardEdge: boolean
  edgeSecret: string | null
  http: HttpSettings
  sessionIdleMs: number
  maxSessions: number
  /** The live sessions one caller's address may hold (rate.ts `callerAddress`). */
  maxSessionsPerAddress: number
  /** The live sessions the addresses of one block may hold (rate.ts `prefixOf`: an IPv6 /48, an IPv4 /24). */
  maxSessionsPerPrefix: number
  /** The signed-in sessions one wallet may hold: past it, its own least lately used goes. */
  maxSignedInPerWallet: number
  /** The signed-in sessions the process may hold in all: past it, a sign-in is refused, and none that stands ends. */
  maxSignedIn: number
  /** How long one call of the API may take. */
  requestTimeoutMs: number
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigError'
  }
}

/** Mancer's own API origins: the hosts whose sign-in names `mancer.xyz` unless a domain is named. */
export const MANCER_API_ORIGINS: readonly string[] = ['https://api.mancer.xyz']
export const DEFAULT_API_URL = 'https://api.mancer.xyz'
export const DEFAULT_HOST = '127.0.0.1'
export const DEFAULT_PORT = 8790

/** The hosts that are this machine alone. */
export const LOOPBACK: ReadonlySet<string> = new Set(['127.0.0.1', 'localhost', '::1'])

function list(v: string | undefined): string[] {
  return (v ?? '').split(',').map((s) => s.trim()).filter(Boolean)
}

function int(v: string | undefined, name: string, dflt: number, min: number, max: number): number {
  if (v === undefined || v.trim() === '') return dflt
  const n = Number(v)
  if (!Number.isInteger(n) || n < min || n > max) throw new ConfigError(`${name} is a whole number from ${min} to ${max}`)
  return n
}

/** The settings from an environment, and from `serve`'s flags where they name a host or a port. */
export function configFrom(env: NodeJS.ProcessEnv, flags: { host?: string; port?: number } = {}): Config {
  let url: URL
  try {
    url = new URL(env.MANCER_API_URL?.trim() || DEFAULT_API_URL)
  } catch {
    throw new ConfigError('MANCER_API_URL is not a URL')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new ConfigError('MANCER_API_URL is an http or https URL')
  if (url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
    throw new ConfigError("MANCER_API_URL is the API's origin alone, with no path, query or credentials")
  }
  const apiUrl = url.origin
  const apiKey = env.MANCER_API_KEY?.trim() || null
  let rpcUrl: string | null = null
  const namedRpc = env.MANCER_MCP_RPC_URL?.trim()
  if (namedRpc) {
    let rpc: URL
    try {
      rpc = new URL(namedRpc)
    } catch {
      throw new ConfigError('MANCER_MCP_RPC_URL is not a URL')
    }
    if (rpc.protocol !== 'https:' && rpc.protocol !== 'http:') throw new ConfigError('MANCER_MCP_RPC_URL is an http or https URL')
    // Node's fetch refuses a URL with credentials in it (user:password@), so every chain read would fail: said at the
    // start, and never with the URL
    if (rpc.username || rpc.password) {
      throw new ConfigError("MANCER_MCP_RPC_URL carries credentials before its host (user:password@), which Node's fetch refuses: put the node's token in its path or query, as providers' URLs carry it, or run a proxy of your own that adds it")
    }
    rpcUrl = rpc.href
  }
  const named = env.MANCER_SIGN_IN_DOMAIN?.trim() || null
  if (named !== null && !/^[a-z0-9.-]+(?::\d+)?$/i.test(named)) throw new ConfigError('MANCER_SIGN_IN_DOMAIN is a host name')
  const signInDomain = named ?? (MANCER_API_ORIGINS.includes(apiUrl) ? 'mancer.xyz' : null)
  const host = flags.host ?? (env.MANCER_MCP_HOST?.trim() || DEFAULT_HOST)
  const port = flags.port ?? int(env.MANCER_MCP_PORT, 'MANCER_MCP_PORT', DEFAULT_PORT, 0, 65_535)
  const allowedHosts = list(env.MANCER_MCP_ALLOWED_HOSTS).map((h) => h.toLowerCase())
  const forwardEdge = env.MANCER_MCP_FORWARD_EDGE === '1'
  const edgeSecret = env.MANCER_MCP_EDGE_SECRET?.trim() || null
  // a copy that forwards for Cloudflare and cannot check Cloudflare's proof would count every caller by an address anyone
  // may name: it does not start
  if (forwardEdge && !edgeSecret) throw new ConfigError('MANCER_MCP_FORWARD_EDGE=1 needs MANCER_MCP_EDGE_SECRET, the proof Cloudflare stamps')
  const maxSessions = int(env.MANCER_MCP_MAX_SESSIONS, 'MANCER_MCP_MAX_SESSIONS', 2_000, 1, 1_000_000)
  // the signed-in sessions leave a quarter of the places to sessions not signed in, so a newcomer always finds one to take
  const maxSignedIn = int(env.MANCER_MCP_MAX_SIGNED_IN, 'MANCER_MCP_MAX_SIGNED_IN', Math.max(1, Math.floor((maxSessions * 3) / 4)), 1, 1_000_000)
  if (maxSignedIn > maxSessions) throw new ConfigError('MANCER_MCP_MAX_SIGNED_IN is at most MANCER_MCP_MAX_SESSIONS')
  return {
    apiUrl,
    apiKey,
    rpcUrl,
    signInDomain,
    forwardEdge,
    edgeSecret,
    http: { host, port, allowedHosts, allowedOrigins: list(env.MANCER_MCP_ALLOWED_ORIGINS) },
    sessionIdleMs: int(env.MANCER_MCP_SESSION_IDLE_SEC, 'MANCER_MCP_SESSION_IDLE_SEC', 3_600, 60, 7 * 86_400) * 1000,
    maxSessions,
    maxSessionsPerAddress: int(env.MANCER_MCP_MAX_SESSIONS_PER_ADDRESS, 'MANCER_MCP_MAX_SESSIONS_PER_ADDRESS', 32, 1, 100_000),
    maxSessionsPerPrefix: int(env.MANCER_MCP_MAX_SESSIONS_PER_PREFIX, 'MANCER_MCP_MAX_SESSIONS_PER_PREFIX', 256, 1, 1_000_000),
    maxSignedInPerWallet: int(env.MANCER_MCP_MAX_SIGNED_IN_PER_WALLET, 'MANCER_MCP_MAX_SIGNED_IN_PER_WALLET', 8, 1, 10_000),
    maxSignedIn,
    requestTimeoutMs: int(env.MANCER_MCP_REQUEST_TIMEOUT_MS, 'MANCER_MCP_REQUEST_TIMEOUT_MS', 30_000, 1_000, 120_000),
  }
}
