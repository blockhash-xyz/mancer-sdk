import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Server as McpProtocolServer } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import { inboundBearer, type Inbound } from './api'
import { LOOPBACK, type Config } from './config'
import { Connection, type SignInGuard } from './connection'
import { KeyWallets } from './key-wallet'
import { Limiter, callerAddress, prefixOf, sameProof } from './rate'
import { createServer } from './server'
import { scrubbed } from './values'
import { SERVER_NAME, SERVER_VERSION } from './version'

/**
 * The server over Streamable HTTP (`mancer-mcp serve`), as Mancer runs it at mcp.mancer.xyz and as anyone may run it: the
 * MCP endpoint at `/` (and `/mcp`), stateful, one MCP session a connection, each with its own sign-in (connection.ts)
 * kept in this process's memory by its `Mcp-Session-Id`. A connection's sign-in lives with its session id and nothing
 * else: whoever holds the id holds the sign-in, until `sign_out` ends it, the client ends the session, or the session is
 * dropped. A session is dropped after `MANCER_MCP_SESSION_IDLE_SEC` with no request. A caller is an address (rate.ts
 * `callerAddress`: a proven address, an IPv6 caller by its /64), and a block of addresses one party holds is a prefix of
 * them (rate.ts `prefixOf`: an IPv6 /48, an IPv4 /24).
 *
 * A session signed in (connection.ts) is its wallet's, and no address's. Many users of a hosted agent platform (claude.ai,
 * ChatGPT) reach this server from the platform's shared egress, so every one of them reads as one address: a signed-in
 * session is never ended for another wallet's new session, nor counted by its address or its prefix.
 * - Past `MANCER_MCP_MAX_SIGNED_IN_PER_WALLET` signed-in sessions of one wallet, that wallet's own least lately used goes
 *   (its sign-in ended with it): a wallet's own new sign-in is the one thing that ends a signed-in session but its idle
 *   bound, `sign_out` and its client.
 * - Past `MANCER_MCP_MAX_SIGNED_IN` signed-in sessions in all, a new sign-in is refused (`sessions-full`, before its nonce
 *   is spent), so the sessions not signed in keep at least the rest of the places and a newcomer always finds one.
 *
 * Every cap below counts, and every eviction takes, sessions not signed in alone:
 * - past `MANCER_MCP_MAX_SESSIONS_PER_ADDRESS` of one address, that address's own least lately used goes;
 * - past `MANCER_MCP_MAX_SESSIONS_PER_PREFIX` of one prefix, that prefix's own least lately used goes, so the /64s of one
 *   /48 (65,536 of them) are one party's room and no more;
 * - at `MANCER_MCP_MAX_SESSIONS` in all, a new session takes the place of its own address's least lately used where the
 *   address holds one. An address that holds none takes the place of the least lately used session of the prefix holding
 *   the most, and only where that prefix holds more than its fair share: the places sessions not signed in hold, over
 *   every prefix holding one, the newcomer's own counted (`fairShare`). A full server always has such a prefix for a
 *   newcomer from a prefix of its own (the most any prefix holds is at least those places over the prefixes, more than the
 *   places over one more), so no one prefix, nor a few, can hold every place, and a prefix at or under its share never
 *   loses a session to another. Where none stands over its share the new session is refused (503, `Retry-After`, a
 *   JSON-RPC error).
 * - A caller this server cannot place (Mancer's hosted copy, which holds an edge proof, reached with no proof or another:
 *   every such caller reads as its door's one socket address) takes no place of a proven caller's, at the cap of all or
 *   anywhere else: it holds its one address's sessions, gives up its own least lately used, and pays its one address's
 *   buckets. A proven caller may take the place of one of its sessions as of any prefix over its share.
 * Every eviction happens only once the new session's `initialize` has succeeded, so a request that fails to open one
 * evicts nobody. A restart forgets every one: a client initializes again, and its agent signs in again. `GET /health`
 * answers with no credential, and says the server is up and its version, nothing more.
 *
 * The buckets: a request that opens a session pays its address's request bucket and its bucket of new sessions; a request
 * of a session this server holds pays that session's own request bucket, and its tool calls that session's bucket (rate.ts
 * `callerBuckets`), so the users behind one shared address keep their own pace. The API's own buckets are the API's: it
 * reads each call as the caller's own request, by the address Cloudflare proved, so the users of one shared address share
 * the API's buckets for a caller with no credential (its anonymous builds' among them), and a sign-in or an API key gives
 * each its own.
 *
 * A request is read in this order, so a caller pays before it costs the server its body: the Host and the Origin; the
 * session its `Mcp-Session-Id` names (unknown: 404, its body never read); the address's own request bucket, and for a
 * request that names no session, its address's bucket of new sessions; the declared length of its body (over 1 MiB:
 * 413, unread); and only then the body, read to 1 MiB at the most and parsed.
 *
 * What a session costs (measured 2026-10-31, 1,000 sessions over loopback, the heap after a full collection): about 16 KB
 * a session that only initialized, and about 83 KB one that also listed the tools. Every session shares one tool table
 * and one schema validator (server.ts); while each registered its own, a session cost about 310 KB, and 380 KB listed.
 *
 * Every call reads the request it arrived on (api.ts `Inbound`): its API key, and, where the hosted copy forwards for
 * Cloudflare, the caller's own identity headers. A request that names a browser `Origin` is answered only from an origin
 * `MANCER_MCP_ALLOWED_ORIGINS` names, and never where it carries an API key (an API key is a server's alone, as the API
 * holds it). `Host` is held to `MANCER_MCP_ALLOWED_HOSTS`, or to the loopback names of the port on a loopback address, so
 * a page cannot reach a local copy through a name of its own.
 */

export interface HttpOptions {
  fetch?: typeof fetch
  log?: (line: string) => void
  now?: () => number
}

export interface HttpHandle {
  /** The MCP endpoint's URL. */
  url: string
  server: Server
  /** How many MCP sessions are held now (a test's reading: the health says nothing of it). */
  sessions(): number
  /** Drops every session idle past its bound now, as the sweep does each minute; answers how many it dropped. */
  sweep(): number
  close(): Promise<void>
}

interface Entry {
  transport: StreamableHTTPServerTransport
  server: McpProtocolServer
  connection: Connection
  /** The caller's address it was opened from (rate.ts `callerAddress`): whose cap it counts against. */
  owner: string
  /** The block of addresses that address is one of (rate.ts `prefixOf`): whose wider cap and fair share it counts against. */
  prefix: string
  /** Whether its caller was placed: by Cloudflare's proof where this server holds one, always where it holds none. */
  placed: boolean
}

const MAX_BODY = 1 << 20
/** The new sessions an address may open: one a second, with a burst of twenty. */
export const SESSION_OPENS = { rate: 1, burst: 20 } as const
/** The HTTP requests a session (and an address opening one) may make, each paid before its body is read: well over the
 * tool calls' own pace (rate.ts), so that pace is what a caller meets, and the requests that are no tool call (a listing,
 * a ping) pay too. */
export const REQUESTS = { rate: 50, burst: 200 } as const
/** How long a caller refused a new session for want of room is asked to wait. */
const FULL_RETRY_AFTER_SEC = 30
/** The most often a warning of a request without this server's edge proof is logged. */
const EDGE_WARN_MS = 60_000

function rpcError(res: ServerResponse, status: number, code: number, message: string, headers: Record<string, string> = {}): void {
  if (res.headersSent) return
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers })
  res.end(JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id: null }))
}

function headersOf(req: IncomingMessage): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {}
  for (const [k, v] of Object.entries(req.headers)) out[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : v
  return out
}

async function bodyOf(req: IncomingMessage): Promise<{ ok: true; value: unknown } | { ok: false; status: number; message: string }> {
  const declared = req.headers['content-length']
  if (declared !== undefined && (!/^\d{1,16}$/.test(declared) || Number(declared) > MAX_BODY)) return { ok: false, status: 413, message: 'Request body too large' }
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > MAX_BODY) return { ok: false, status: 413, message: 'Request body too large' }
    chunks.push(chunk as Buffer)
  }
  try {
    return { ok: true, value: JSON.parse(Buffer.concat(chunks).toString('utf8')) }
  } catch {
    return { ok: false, status: 400, message: 'Parse error: the body is not JSON' }
  }
}

/** Starts the server over Streamable HTTP, on `config.http`'s host and port. */
export async function serveHttp(config: Config, options: HttpOptions = {}): Promise<HttpHandle> {
  const log = options.log ?? ((line: string) => console.error(line))
  const now = options.now ?? (() => Date.now())
  const limiter = new Limiter(now)
  const keyWallets = new KeyWallets(now)
  const calls = new AsyncLocalStorage<Inbound>()
  const sessions = new Map<string, Entry>()
  let allowedHosts: string[] | null = config.http.allowedHosts.length ? config.http.allowedHosts : null

  /** The wallet a session is signed in as, or null: a signed-in session is its wallet's, and no address's. */
  const signedOf = (e: Entry) => e.connection.signedIn()?.wallet ?? null
  const unsigned = (e: Entry) => signedOf(e) === null

  const drop = (id: string) => {
    const e = sessions.get(id)
    if (!e) return
    sessions.delete(id)
    e.connection.signOut()
    void e.server.close().catch(() => {})
  }

  const sweep = (): number => {
    const cut = now() - config.sessionIdleMs
    let dropped = 0
    for (const [id, e] of sessions) {
      if (e.connection.lastSeen < cut) {
        drop(id)
        dropped++
      }
    }
    return dropped
  }

  /** The oldest of the sessions `which` keeps, or null. */
  const oldestOf = (which: (e: Entry) => boolean, besides: string): string | null => {
    let oldest: string | null = null
    let at = Infinity
    for (const [id, e] of sessions) if (id !== besides && which(e) && e.connection.lastSeen < at) [oldest, at] = [id, e.connection.lastSeen]
    return oldest
  }

  /** The new sessions in flight (made ready, their initialize not yet answered), by address and in all. */
  const opening = new Map<string, number>()
  let openingAll = 0
  /** The sessions not signed in an address holds. */
  const heldBy = (owner: string) => {
    let held = 0
    for (const e of sessions.values()) if (e.owner === owner && unsigned(e)) held++
    return held
  }
  /** The sessions not signed in a prefix holds. */
  const heldByPrefix = (prefix: string, besides: string) => {
    let held = 0
    for (const [id, e] of sessions) if (id !== besides && e.prefix === prefix && unsigned(e)) held++
    return held
  }

  /** A prefix's fair share of the places sessions not signed in hold, among this many prefixes holding one (a newcomer's
   * own counted). */
  const fairShare = (places: number, prefixes: number) => Math.floor(places / Math.max(1, prefixes))

  /** A caller this server places: by Cloudflare's proof where it holds one (a `cf:` address), and every caller of a copy
   * that holds none, whose callers are all their sockets alike. */
  const placedOf = (owner: string) => !config.edgeSecret || owner.startsWith('cf:')

  /** At the cap of all, the session a newcomer whose address holds none takes the place of: the least lately used session
   * not signed in of the prefix holding the most of them, where that prefix holds more than its fair share (the places
   * sessions not signed in hold, over every prefix holding one, the newcomer's own counted). A caller this server cannot
   * place takes no placed caller's. Null where none stands over its share. */
  const victimFor = (prefix: string, placed: boolean, besides: string): string | null => {
    const counts = new Map<string, { n: number; placed: boolean; oldest: string; at: number }>()
    let places = 0
    for (const [id, e] of sessions) {
      // a signed-in session is no prefix's, and is never taken for another's
      if (id === besides || !unsigned(e)) continue
      places++
      const c = counts.get(e.prefix)
      if (!c) counts.set(e.prefix, { n: 1, placed: e.placed, oldest: id, at: e.connection.lastSeen })
      else {
        c.n++
        if (e.connection.lastSeen < c.at) [c.oldest, c.at] = [id, e.connection.lastSeen]
      }
    }
    const fair = fairShare(places, counts.size + (counts.has(prefix) ? 0 : 1))
    // the prefix holding the most, over its share; of two holding as many, the one whose session was used least lately
    let most: { n: number; oldest: string; at: number } | null = null
    for (const c of counts.values()) {
      if (c.n <= fair || (!placed && c.placed)) continue
      if (!most || c.n > most.n || (c.n === most.n && c.at < most.at)) most = c
    }
    return most?.oldest ?? null
  }

  /** Whether a new session of this address finds room: under the cap of all, counting the opens in flight; or with a
   * session of its own to give up for each of its own opens in flight; or, where it holds none, a session of a prefix over
   * its fair share to take the place of. */
  const roomFor = (owner: string): boolean => {
    if (sessions.size + openingAll < config.maxSessions) return true
    if (heldBy(owner) > (opening.get(owner) ?? 0)) return true
    return heldBy(owner) === 0 && victimFor(prefixOf(owner), placedOf(owner), '') !== null
  }

  /** Once a new session stands, the caps, each paid by the new session's own address or prefix alone, and at the cap of
   * all by a prefix over its fair share where the new session's address holds no other: its address's least lately used
   * past the address's cap, its prefix's past the prefix's, and past the cap of all its own address's, else the fair
   * share's. A new session that finds none to take the place of past the cap of all (opens raced into the last place) is
   * itself closed. */
  const enforceCaps = (fresh: string, owner: string): boolean => {
    const prefix = prefixOf(owner)
    let held = heldBy(owner)
    while (held > config.maxSessionsPerAddress) {
      const oldest = oldestOf((e) => e.owner === owner && unsigned(e), fresh)
      if (oldest === null) break
      drop(oldest)
      held--
    }
    let inPrefix = heldByPrefix(prefix, '')
    while (inPrefix > config.maxSessionsPerPrefix) {
      const oldest = oldestOf((e) => e.prefix === prefix && unsigned(e), fresh)
      if (oldest === null) break
      drop(oldest)
      inPrefix--
    }
    while (sessions.size > config.maxSessions) {
      const oldest = oldestOf((e) => e.owner === owner && unsigned(e), fresh) ?? victimFor(prefix, placedOf(owner), fresh)
      if (oldest === null) {
        drop(fresh)
        return false
      }
      drop(oldest)
    }
    return true
  }

  /** The signed-in sessions: in all, and a wallet's. */
  const signedIn = (wallet: string | null, besides: Connection | null) => {
    let n = 0
    for (const e of sessions.values()) {
      if (e.connection === besides) continue
      const w = signedOf(e)
      if (w !== null && (wallet === null || w === wallet)) n++
    }
    return n
  }
  /** A sign-in is refused past the signed-in sessions the process holds in all, and never ends one that stands; past a
   * wallet's own bound, the wallet's least lately used signed-in session goes, never another wallet's. */
  const guard: SignInGuard = {
    admit: (connection) =>
      signedIn(null, connection) >= config.maxSignedIn ? 'This server holds as many signed-in sessions as it can: wait, then complete the sign-in again.' : null,
    signedIn: (connection, wallet) => {
      let held = signedIn(wallet, null)
      while (held > config.maxSignedInPerWallet) {
        let oldest: string | null = null
        let at = Infinity
        for (const [id, e] of sessions) {
          if (e.connection !== connection && signedOf(e) === wallet && e.connection.lastSeen < at) [oldest, at] = [id, e.connection.lastSeen]
        }
        if (oldest === null) break
        drop(oldest)
        held--
      }
    },
  }

  const open = async (owner: string): Promise<Entry> => {
    const connection = new Connection(randomUUID(), now)
    connection.guard = guard
    let entry: Entry
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableJsonResponse: true,
      onsessioninitialized: (id) => {
        sessions.set(id, entry)
        enforceCaps(id, owner)
      },
      onsessionclosed: (id) => drop(id),
    })
    transport.onclose = () => {
      if (transport.sessionId) drop(transport.sessionId)
    }
    const server = createServer({ config, connection, inbound: () => calls.getStore() ?? null, limiter, keyWallets, fetch: options.fetch, log })
    entry = { transport, server, connection, owner, prefix: prefixOf(owner), placed: placedOf(owner) }
    await server.connect(transport)
    return entry
  }

  let edgeMisses = 0
  let edgeWarnedAt = -Infinity
  /** A request that carries no edge proof where this server holds one, or another proof: counted, and told once a minute
   * at the most (never the header's value). Before Cloudflare's rule stamps the proof on mcp.mancer.xyz, and after a
   * rotation of CF_PROXY_SECRET until mcp.env holds the new proof, every caller reads as the door's one socket address: such
   * callers share that address's buckets and sessions, and take no proven caller's place (`placedOf`). Mancer's hosted copy
   * takes a rotated proof at the next release of the API beside it, which restarts this server. */
  const noteEdge = (proof: string | undefined) => {
    if (!config.edgeSecret || (proof !== undefined && sameProof(proof, config.edgeSecret))) return
    edgeMisses++
    const t = now()
    if (t - edgeWarnedAt < EDGE_WARN_MS) return
    log(`mancer-mcp: warning: ${edgeMisses} request${edgeMisses === 1 ? '' : 's'} since the last warning carried no X-Mancer-Edge, or one that is not this server's proof (MANCER_MCP_EDGE_SECRET): Cloudflare's rule does not stamp it on this name, a rotated CF_PROXY_SECRET is not yet in mcp.env, or the header is forged. Such callers are counted as their socket, one address, and take no proven caller's session.`)
    edgeMisses = 0
    edgeWarnedAt = t
  }

  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    res.setHeader('x-content-type-options', 'nosniff')
    if (url.pathname === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      res.end(JSON.stringify({ ok: true, name: SERVER_NAME, version: SERVER_VERSION }))
      return
    }
    if (url.pathname !== '/' && url.pathname !== '/mcp') {
      res.writeHead(404, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      res.end(JSON.stringify({ error: 'not found' }))
      return
    }
    const headers = headersOf(req)
    if (allowedHosts && !allowedHosts.includes((headers.host ?? '').toLowerCase())) return rpcError(res, 403, -32000, 'Forbidden: this Host is not served here')
    const inbound: Inbound = { headers, socket: req.socket.remoteAddress ?? null }
    if (headers.origin !== undefined) {
      if (inboundBearer(inbound)) return rpcError(res, 403, -32000, 'Forbidden: an API key is a server’s alone, and this request carries a browser’s Origin')
      if (!config.http.allowedOrigins.includes(headers.origin)) return rpcError(res, 403, -32000, 'Forbidden: this Origin is not served here')
    }
    res.setHeader('cache-control', 'no-store')
    if (req.method !== 'POST' && req.method !== 'GET' && req.method !== 'DELETE') return rpcError(res, 405, -32000, 'Method not allowed', { allow: 'GET, POST, DELETE' })
    noteEdge(headers['x-mancer-edge'])
    const owner = callerAddress(config, inbound)
    // the session first: an id this server does not hold costs it no body
    const id = headers['mcp-session-id']
    let held: Entry | undefined
    if (id) {
      held = sessions.get(id)
      if (!held) return rpcError(res, 404, -32001, 'Session not found: initialize again')
    }
    // then the caller pays, before its body is read: a session this server holds pays its own request bucket (so the users
    // behind one shared address keep their own pace), and a request that names none pays its address's, and a new
    // session's (one a second an address, with room for a burst), which costs this process its memory until it ends
    const paid = limiter.take(id ? [{ key: `req|s:${id}`, ...REQUESTS }] : [{ key: `req|${owner}`, ...REQUESTS }, { key: `open|${owner}`, ...SESSION_OPENS }])
    if (!paid.ok) {
      return rpcError(res, 429, -32000, id ? 'Too many requests in this session: wait, then ask again' : 'Too many new sessions from this address: wait, then initialize again', { 'retry-after': String(paid.retryAfterSeconds) })
    }
    if (!id && req.method !== 'POST') return rpcError(res, 400, -32000, 'Bad Request: no valid session id; initialize first')
    if (!id) {
      sweep()
      if (!roomFor(owner)) {
        return rpcError(res, 503, -32000, 'This server holds as many sessions as it can: wait, then initialize again', { 'retry-after': String(FULL_RETRY_AFTER_SEC) })
      }
    }
    let body: unknown
    if (req.method === 'POST') {
      const read = await bodyOf(req)
      if (!read.ok) return rpcError(res, read.status, -32700, read.message)
      body = read.value
    }
    let entry: Entry
    if (held) {
      // the session may have ended while its body was read
      if (sessions.get(id!) !== held) return rpcError(res, 404, -32001, 'Session not found: initialize again')
      entry = held
      entry.connection.touch()
    } else if (isInitializeRequest(body)) {
      if (!roomFor(owner)) return rpcError(res, 503, -32000, 'This server holds as many sessions as it can: wait, then initialize again', { 'retry-after': String(FULL_RETRY_AFTER_SEC) })
      opening.set(owner, (opening.get(owner) ?? 0) + 1)
      openingAll++
      try {
        entry = await open(owner)
        await calls.run(inbound, () => entry.transport.handleRequest(req, res, body))
      } finally {
        openingAll--
        const n = (opening.get(owner) ?? 1) - 1
        if (n > 0) opening.set(owner, n)
        else opening.delete(owner)
      }
      // an initialize that opened no session leaves nothing held
      if (!(entry.transport.sessionId && sessions.get(entry.transport.sessionId) === entry)) void entry.server.close().catch(() => {})
      return
    } else {
      return rpcError(res, 400, -32000, 'Bad Request: no valid session id; initialize first')
    }
    await calls.run(inbound, () => entry.transport.handleRequest(req, res, body))
  }

  const http = createHttpServer((req, res) => {
    handle(req, res).catch((e) => {
      log(`mancer-mcp: http: ${scrubbed(e instanceof Error ? e.message : String(e)).slice(0, 200)}`)
      rpcError(res, 500, -32603, 'Internal error')
    })
  })
  await new Promise<void>((resolve, reject) => {
    http.once('error', reject)
    http.listen(config.http.port, config.http.host, () => resolve())
  })
  const bound = http.address() as AddressInfo
  if (!allowedHosts && LOOPBACK.has(config.http.host)) allowedHosts = [`127.0.0.1:${bound.port}`, `localhost:${bound.port}`, `[::1]:${bound.port}`]
  const sweeper = setInterval(sweep, Math.min(60_000, Math.max(1_000, Math.floor(config.sessionIdleMs / 4))))
  sweeper.unref()
  const shown = bound.family === 'IPv6' ? `[${bound.address}]` : bound.address
  return {
    url: `http://${shown}:${bound.port}/`,
    server: http,
    sessions: () => sessions.size,
    sweep,
    close: async () => {
      clearInterval(sweeper)
      for (const id of [...sessions.keys()]) drop(id)
      const closed = new Promise<void>((resolve) => http.close(() => resolve()))
      http.closeAllConnections?.()
      await closed
    },
  }
}
