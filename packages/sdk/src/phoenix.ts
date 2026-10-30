/**
 * A Phoenix channels client, as small as one topic needs: the V2 JSON wire (`[join_ref, ref, topic, event, payload]`),
 * a join, its reply, the pushes, and a heartbeat every thirty seconds. Mancer's stream (wss://stream.mancer.xyz/socket)
 * speaks it. Runs on any `WebSocket` of the WHATWG shape: Node 22's built-in one, a browser's, or one handed in.
 */

export interface WebSocketLike {
  readonly readyState: number
  send(data: string): void
  close(code?: number, reason?: string): void
  addEventListener(type: 'open' | 'close' | 'error' | 'message', listener: (event: { data?: unknown; code?: number; reason?: string }) => void): void
}

export type WebSocketFactory = (url: string) => WebSocketLike

type Frame = [string | null, string | null, string, string, Record<string, unknown>]

export interface ChannelHandlers {
  /** Every push on the topic but the channel's own replies. */
  onPush: (event: string, payload: Record<string, unknown>) => void
  /** The socket or the channel closed, by the server or the network. Not called after `close()`. */
  onClose: (why: { code?: number; reason?: string; channelError?: boolean }) => void
}

const OPEN = 1
const HEARTBEAT_MS = 30_000

/** The socket URL a Phoenix endpoint's path answers WebSocket upgrades on. */
export function websocketUrl(socketPath: string): string {
  const u = new URL(socketPath)
  if (!u.pathname.endsWith('/websocket')) u.pathname = `${u.pathname.replace(/\/+$/, '')}/websocket`
  u.searchParams.set('vsn', '2.0.0')
  return u.toString()
}

/** One topic on one socket: `open` connects and joins, answering the join's reply or throwing its refusal. */
export class PhoenixChannel {
  #socket: WebSocketLike | null = null
  #ref = 0
  #joinRef: string | null = null
  #heartbeat: ReturnType<typeof setInterval> | null = null
  #closed = false

  constructor(private readonly socketUrl: string, private readonly topic: string, private readonly factory: WebSocketFactory, private readonly handlers: ChannelHandlers) {}

  #next(): string {
    this.#ref += 1
    return String(this.#ref)
  }

  #send(frame: Frame): void {
    if (this.#socket && this.#socket.readyState === OPEN) this.#socket.send(JSON.stringify(frame))
  }

  /** Connects and joins with `payload`; resolves with the join's answer, or rejects with its refusal. */
  open(payload: Record<string, unknown>, timeoutMs = 10_000): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      let settled = false
      const settle = (fn: () => void) => {
        if (!settled) {
          settled = true
          clearTimeout(timer)
          fn()
        }
      }
      const timer = setTimeout(() => settle(() => {
        this.close()
        reject(new Error('the stream did not answer the join in time'))
      }), timeoutMs)
      const socket = this.factory(websocketUrl(this.socketUrl))
      this.#socket = socket
      socket.addEventListener('open', () => {
        this.#joinRef = this.#next()
        this.#send([this.#joinRef, this.#joinRef, this.topic, 'phx_join', payload])
        this.#heartbeat = setInterval(() => this.#send([null, this.#next(), 'phoenix', 'heartbeat', {}]), HEARTBEAT_MS)
      })
      socket.addEventListener('message', (event) => {
        let frame: Frame
        try {
          frame = JSON.parse(String(event.data)) as Frame
        } catch {
          return
        }
        if (!Array.isArray(frame) || frame.length !== 5) return
        const [joinRef, ref, topic, name, body] = frame
        if (topic !== this.topic) return
        if (name === 'phx_reply' && ref === this.#joinRef) {
          const status = (body as { status?: unknown }).status
          const response = ((body as { response?: unknown }).response ?? {}) as Record<string, unknown>
          if (status === 'ok') settle(() => resolve(response))
          else settle(() => {
            this.close()
            reject(new Error(typeof response.reason === 'string' ? response.reason : 'the stream refused the join'))
          })
          return
        }
        if (name === 'phx_reply') return
        if (joinRef !== null && joinRef !== this.#joinRef) return
        if (name === 'phx_error' || name === 'phx_close') {
          if (!settled) settle(() => reject(new Error(`the channel ${name === 'phx_error' ? 'failed' : 'closed'} before it joined`)))
          else this.#end({ channelError: name === 'phx_error', reason: name })
          return
        }
        this.handlers.onPush(name, (body ?? {}) as Record<string, unknown>)
      })
      socket.addEventListener('close', (event) => {
        if (!settled) settle(() => reject(new Error('the stream closed before it joined')))
        else this.#end({ code: event.code, reason: event.reason })
      })
      socket.addEventListener('error', () => {
        if (!settled) settle(() => reject(new Error('the stream could not be reached')))
      })
    })
  }

  #end(why: { code?: number; reason?: string; channelError?: boolean }): void {
    if (this.#closed) return
    this.#stop()
    this.handlers.onClose(why)
  }

  #stop(): void {
    this.#closed = true
    if (this.#heartbeat) clearInterval(this.#heartbeat)
    this.#heartbeat = null
    try {
      this.#socket?.close(1000, 'client closed')
    } catch {
      // closing a socket that never opened
    }
    this.#socket = null
  }

  /** Leaves the topic and closes the socket; `onClose` is not called. */
  close(): void {
    if (this.#closed) return
    if (this.#joinRef) this.#send([this.#joinRef, this.#next(), this.topic, 'phx_leave', {}])
    this.#stop()
  }
}
