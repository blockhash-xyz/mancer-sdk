import type { MancerClient } from './client'
import { MancerError } from './errors'
import type { AccountEvent, AccountEventsPage, StreamTicket } from './generated/openapi'
import { PhoenixChannel, type WebSocketFactory, type WebSocketLike } from './phoenix'

/**
 * The account's events (`GET /v1/me/events`): one sequenced log of its orders, notices and Books, read by cursor, and
 * pushed as it is written on the stream's `account:<address>` topic. `AccountStream` joins the topic with a one-minute
 * ticket (`POST /v1/me/stream-ticket`, carried in the join, never a URL), replays from the last event it handed on, and
 * on a `resync` or a dropped socket reads the log from its cursor and joins again: each event is handed on once, in order.
 */

/** Mancer's stream. */
export const DEFAULT_STREAM_URL = 'wss://stream.mancer.xyz/socket'

/** One page of the log from `since` (the `seq` of the last event handled; '0' reads from the oldest kept). */
export async function readEvents(client: MancerClient, since = '0', limit = 100): Promise<AccountEventsPage> {
  return (await client.request<AccountEventsPage>('GET', '/v1/me/events', { query: { since, limit }, auth: 'required' })).data
}

/** Every event past `since`, page by page, until the log has none waiting. */
export async function* eventsSince(client: MancerClient, since = '0', limit = 500): AsyncGenerator<AccountEvent, string> {
  let cursor = since
  for (;;) {
    const page = await readEvents(client, cursor, limit)
    for (const e of page.events) yield e
    cursor = page.next
    if (!page.more) return cursor
  }
}

export interface AccountStreamOptions {
  /** The `seq` of the last event already handled: the stream replays every event past it first. Absent, it hands on
   * what is written from the join on. */
  since?: string
  onEvent: (event: AccountEvent) => void | Promise<void>
  /** Told when the stream ends for good: the session ended and no new one could be had, or `stop()`. */
  onEnd?: (why: { reason: string }) => void
  /** Told of each reconnection and its cause. */
  onReconnect?: (why: { reason: string; attempt: number }) => void
  /** Told of an event the stream could not hand on (a malformed one), and of a handler that threw: delivery goes on with
   * the next event either way. */
  onError?: (error: unknown, event: unknown) => void
  /** The stream's socket path. Default wss://stream.mancer.xyz/socket. */
  streamUrl?: string
  /** A WebSocket maker; default the global WebSocket (Node 22, every browser). */
  webSocket?: WebSocketFactory
  /** The longest wait between reconnections, in milliseconds. Default 30,000. */
  maxBackoffMs?: number
}

const ENDS = new Set(['session-revoked', 'account-changed'])

const SEQ = /^(0|[1-9]\d{0,30})$/

function after(a: string, b: string | null): boolean {
  return b === null || BigInt(a) > BigInt(b)
}

/** A live subscription to the account's events. */
export class AccountStream {
  #channel: PhoenixChannel | null = null
  #last: string | null
  #stopped = false
  #attempt = 0
  #queue: Promise<void> = Promise.resolve()
  readonly #factory: WebSocketFactory
  readonly #url: string
  /** The join's last answer: the account, the log's head and floor. */
  joined: Record<string, unknown> | null = null

  constructor(private readonly client: MancerClient, private readonly options: AccountStreamOptions) {
    this.#last = options.since ?? null
    this.#url = options.streamUrl ?? DEFAULT_STREAM_URL
    this.#factory = options.webSocket ?? ((url: string) => {
      const WS = (globalThis as { WebSocket?: new (url: string) => WebSocketLike }).WebSocket
      if (!WS) throw new Error('no WebSocket here: run on Node 22 or newer, or hand one in')
      return new WS(url)
    })
  }

  /** The `seq` of the last event handed on: where a later stream or log read starts. */
  get cursor(): string | null {
    return this.#last
  }

  /** Joins; resolves once the first join answers. */
  async start(): Promise<void> {
    await this.#connect()
  }

  stop(): void {
    if (this.#stopped) return
    this.#stopped = true
    this.#channel?.close()
    this.#channel = null
    this.options.onEnd?.({ reason: 'stopped' })
  }

  /** Hands events on in order, one at a time, each once. An event whose seq is no place in the log is reported and
   * passed over; a handler that throws is reported, and the next event is handed on all the same. The queue never
   * rejects, so nothing is left unhandled. */
  #deliver(event: AccountEvent): void {
    this.#queue = this.#queue.then(async () => {
      if (this.#stopped) return
      const seq = (event as { seq?: unknown } | null)?.seq
      if (typeof seq !== 'string' || !SEQ.test(seq)) {
        this.#report(new Error('an event names no place in the log (its seq)'), event)
        return
      }
      if (!after(seq, this.#last)) return
      this.#last = seq
      try {
        await this.options.onEvent(event)
      } catch (e) {
        this.#report(e, event)
      }
    }).catch((e) => this.#report(e, event))
  }

  #report(error: unknown, event: unknown): void {
    try {
      this.options.onError?.(error, event)
    } catch {
      // an error callback that throws is no reason to stop delivery
    }
  }

  async #ticket(): Promise<StreamTicket> {
    return (await this.client.request<StreamTicket>('POST', '/v1/me/stream-ticket', { auth: 'required' })).data
  }

  async #connect(): Promise<void> {
    if (this.#stopped) return
    const ticket = await this.#ticket()
    await this.#queue
    const channel = new PhoenixChannel(this.#url, ticket.topic, this.#factory, {
      onPush: (name, payload) => this.#push(name, payload),
      onClose: (why) => {
        if (this.#channel === channel) void this.#reconnect(why.reason ?? 'the socket closed')
      },
    })
    this.#channel = channel
    const since = this.#last
    this.joined = await channel.open({ ticket: ticket.ticket, ...(since !== null ? { since } : {}) })
    // a first join with no cursor hears what is written past the log's head: that head is the cursor a later join resumes
    // from, so nothing written while a socket is down is missed
    if (this.#last === null && typeof this.joined.head === 'string' && SEQ.test(this.joined.head)) this.#last = this.joined.head
    this.#attempt = 0
  }

  #push(name: string, payload: Record<string, unknown>): void {
    if (name === 'event') {
      this.#deliver(payload as unknown as AccountEvent)
      return
    }
    if (name === 'resync') {
      const next = typeof payload.next === 'string' && SEQ.test(payload.next) ? payload.next : this.#last
      void this.#resync(next, String(payload.reason ?? 'resync'))
      return
    }
    if (name === 'session-ended') {
      void this.#sessionEnded(String(payload.reason ?? 'session-ended'))
    }
  }

  /** The log from the cursor, then a join again. */
  async #resync(next: string | null, reason: string): Promise<void> {
    const old = this.#channel
    this.#channel = null
    old?.close()
    try {
      let cursor = next ?? this.#last ?? '0'
      for (;;) {
        const page = await readEvents(this.client, cursor, 500)
        for (const e of page.events) this.#deliver(e)
        cursor = page.next
        if (!page.more) break
      }
      await this.#queue
    } catch {
      // the log will be read again on the reconnection's join, from the cursor
    }
    await this.#reconnect(reason)
  }

  async #sessionEnded(reason: string): Promise<void> {
    const old = this.#channel
    this.#channel = null
    old?.close()
    // an expired session is signed in again where the client can; a revoked one, or an account that changed, ends here
    if (ENDS.has(reason) || !this.client.account) {
      this.#stopped = true
      this.options.onEnd?.({ reason })
      return
    }
    try {
      await this.client.signIn()
    } catch {
      this.#stopped = true
      this.options.onEnd?.({ reason })
      return
    }
    await this.#reconnect(reason)
  }

  async #reconnect(reason: string): Promise<void> {
    while (!this.#stopped) {
      this.#attempt += 1
      this.options.onReconnect?.({ reason, attempt: this.#attempt })
      const wait = Math.min(this.options.maxBackoffMs ?? 30_000, 500 * 2 ** Math.min(this.#attempt - 1, 6))
      await new Promise((done) => setTimeout(done, wait))
      if (this.#stopped) return
      try {
        await this.#connect()
        return
      } catch (e) {
        if (e instanceof MancerError && !e.retryable && e.status >= 400 && e.status < 500 && e.status !== 429) {
          this.#stopped = true
          this.options.onEnd?.({ reason: e.code })
          return
        }
        reason = e instanceof Error ? e.message : String(e)
      }
    }
  }
}
