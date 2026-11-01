import type { Config } from './config'
import type { Connection } from './connection'
import { SERVER_VERSION } from './version'

/**
 * How a tool asks Mancer's API: one HTTP request a call to `MANCER_API_URL`, as any client of the API makes it. The server
 * holds no wallet's key and signs nothing; what it sends is the caller's own credential, where there is one, and what the
 * tool asks.
 *
 * The credential, in this order (one bearer a request, as the API reads one):
 *   1. the session this connection's wallet signed in to (`sign_in`, `complete_sign_in`): the wallet in use, whose account
 *      the account's tools read and write, and which every build defaults to;
 *   2. the API key the MCP request carried (`Authorization: Bearer` to the hosted server);
 *   3. the key this server was started with (`MANCER_API_KEY`).
 * With none, the call is anonymous: the market, and every build the caller's wallet signs, answer without one.
 *
 * Where `MANCER_MCP_FORWARD_EDGE=1` (Mancer's hosted copy alone), each call carries `CF-Connecting-IP`, `CF-IPCountry`,
 * `X-Mancer-Edge` and `User-Agent` as the MCP request carried them, and nothing else of it: the API reads the caller as if
 * it had called it, and believes the address and the country only where `X-Mancer-Edge` is Cloudflare's own proof. A
 * local copy forwards none of them, so the API reads it as the machine it runs on, through Cloudflare.
 */

/** The request a tool call arrived on, where one did (Streamable HTTP): its headers, with lowercase names, and the address
 * of the socket it came from. A stdio call has none. */
export interface Inbound {
  headers: Readonly<Record<string, string | undefined>>
  socket: string | null
}

/** The headers a hosted call carries of its MCP request, and only these. */
export const FORWARDED = ['cf-connecting-ip', 'cf-ipcountry', 'x-mancer-edge', 'user-agent'] as const

export type ApiMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface ApiCall {
  method: ApiMethod
  /** The route's path, every segment already checked and encoded (`seg`). */
  path: string
  query?: Record<string, string | number | boolean | undefined | null>
  body?: unknown
  idempotencyKey?: string
  /** `none`: the call carries no credential (the sign-in's own two calls). */
  credential?: 'none'
}

export interface ApiAnswer {
  status: number
  /** The answer's JSON, or null where it carried none. */
  body: unknown
  headers: Headers
  /** Whether the call carried this connection's session. */
  usedSession: boolean
}

export type Asker = (call: ApiCall) => Promise<ApiAnswer>

/** The paths a tool may ask: the API's public surface. No `/admin`, and nothing a caller's text could steer. */
const ALLOWED = /^\/(?:v1\/[A-Za-z0-9._~%/-]+|auth\/(?:me|nonce|verify)|rpc)$/

/** One path segment a tool joins: encoded whole, so no caller's text adds a segment or a query, and never a dot segment,
 * which a URL resolves away. */
export function seg(value: string): string {
  if (value === '' || value === '.' || value === '..') throw new Error('a path segment is empty or a dot segment')
  return encodeURIComponent(value)
}

/** The bearer an MCP request carried, where it carried one. */
export function inboundBearer(inbound: Inbound | null): string | null {
  const h = inbound?.headers.authorization
  if (!h) return null
  const m = /^Bearer\s+(\S{1,512})$/i.exec(h.trim())
  return m ? m[1]! : null
}

/** The credential a call carries (above), and whose it is. */
export function credentialOf(config: Config, connection: Connection, inbound: Inbound | null): { bearer: string | null; kind: 'session' | 'key' | null } {
  const session = connection.sessionToken()
  if (session) return { bearer: session, kind: 'session' }
  const key = inboundBearer(inbound) ?? config.apiKey
  return key ? { bearer: key, kind: 'key' } : { bearer: null, kind: null }
}

/** The caller's own headers a hosted call carries: none unless `MANCER_MCP_FORWARD_EDGE=1`. */
export function forwardedHeaders(config: Config, inbound: Inbound | null): Record<string, string> {
  const out: Record<string, string> = {}
  if (!config.forwardEdge || !inbound) return out
  for (const name of FORWARDED) {
    const v = inbound.headers[name]
    if (typeof v === 'string' && v !== '' && v.length <= 512 && !/[\r\n]/.test(v)) out[name] = v
  }
  return out
}

function queryString(query: ApiCall['query']): string {
  if (!query) return ''
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null) continue
    p.set(k, typeof v === 'boolean' ? (v ? '1' : '0') : String(v))
  }
  const s = p.toString()
  return s ? `?${s}` : ''
}

/** A failure to reach the API at all, as a tool tells it: nothing of the URL or the error's own text. */
export class ApiUnreachable extends Error {
  constructor(readonly timedOut: boolean) {
    super(timedOut ? "Mancer's API did not answer in time." : "Mancer's API could not be reached.")
    this.name = 'ApiUnreachable'
  }
}

export interface AskerDeps {
  config: Config
  connection: Connection
  inbound: Inbound | null
  fetch?: typeof fetch
}

/** The asker one tool call uses. A session the API refuses (401) is forgotten at once: the agent signs in again. */
export function askerFor(deps: AskerDeps): Asker {
  const doFetch = deps.fetch ?? globalThis.fetch.bind(globalThis)
  return async (call) => {
    if (!ALLOWED.test(call.path) || call.path.includes('..') || call.path.includes('//')) throw new Error(`a tool asked a path it may not: ${call.method}`)
    const credential = call.credential === 'none' ? { bearer: null, kind: null } : credentialOf(deps.config, deps.connection, deps.inbound)
    const headers = new Headers(forwardedHeaders(deps.config, deps.inbound))
    if (!headers.has('user-agent')) headers.set('user-agent', `mancer-mcp/${SERVER_VERSION}`)
    headers.set('accept', 'application/json')
    if (credential.bearer) headers.set('authorization', `Bearer ${credential.bearer}`)
    let body: string | undefined
    if (call.body !== undefined) {
      body = JSON.stringify(call.body, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))
      headers.set('content-type', 'application/json')
    }
    if (call.idempotencyKey) headers.set('idempotency-key', call.idempotencyKey)
    let res: Response
    let text: string
    try {
      res = await doFetch(`${deps.config.apiUrl}${call.path}${queryString(call.query)}`, {
        method: call.method,
        headers,
        body,
        redirect: 'error',
        signal: AbortSignal.timeout(deps.config.requestTimeoutMs),
      })
      text = await res.text()
    } catch (e) {
      throw new ApiUnreachable(e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError'))
    }
    let parsed: unknown = null
    if (text.trim() !== '') {
      try {
        parsed = JSON.parse(text)
      } catch {
        parsed = null
      }
    }
    const usedSession = credential.kind === 'session'
    if (usedSession && res.status === 401) deps.connection.endSession()
    return { status: res.status, body: parsed, headers: res.headers, usedSession }
  }
}
