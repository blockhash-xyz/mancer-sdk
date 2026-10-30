import test from 'node:test'
import assert from 'node:assert/strict'
import { privateKeyToAccount } from 'viem/accounts'
import { Mancer, websocketUrl, type WebSocketLike } from '../src/index'
import type { AccountEvent } from '../src/generated/openapi'
import { TRUSTED, fakeChain, mockApi } from './helpers'

// The account's events: the log read by cursor, and the stream's `account:<address>` topic joined with a one-minute
// ticket in the join (never the URL), replayed from the last event handed on, resynced from the log, and ended for good
// on a revoked session. The stream here is an in-process stand-in that speaks Phoenix's V2 wire as the stream does.

const account = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d')
const TOPIC = `account:${account.address.toLowerCase()}`
const session = `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: account.address.toLowerCase(), iat: 1, exp: 4_000_000_000 })).toString('base64url')}.x`

const ev = (seq: number, kind: AccountEvent['kind'] = 'order.filled'): AccountEvent => ({
  seq: String(seq), kind, account: account.address.toLowerCase(), wallet: account.address.toLowerCase(), key: `0x${'aa'.repeat(32)}`, at: new Date(seq * 1000).toISOString(), data: {} as never,
})

/** A stand-in of the stream: each socket it opens, the joins it was sent, and a hand to push frames down a socket. */
class StandInStream {
  sockets: Array<{ url: string; sent: unknown[][]; push: (event: string, payload: unknown) => void; drop: () => void }> = []
  joins: Array<{ topic: string; payload: Record<string, unknown> }> = []
  log: AccountEvent[] = []
  /** What a join answers, by its payload. */
  answer: (payload: Record<string, unknown>) => { ok: boolean; response: Record<string, unknown> } = () => ({ ok: true, response: { head: '0', floor: '0' } })

  factory = (url: string): WebSocketLike => {
    const listeners: Record<string, Array<(e: { data?: unknown; code?: number; reason?: string }) => void>> = {}
    const emit = (type: string, e: { data?: unknown; code?: number; reason?: string } = {}) => (listeners[type] ?? []).forEach((l) => l(e))
    const record = { url, sent: [] as unknown[][], push: (_e: string, _p: unknown) => {}, drop: () => {} }
    let joinRef: string | null = null
    const socket: WebSocketLike = {
      readyState: 1,
      send: (data: string) => {
        const frame = JSON.parse(data) as [string | null, string, string, string, Record<string, unknown>]
        record.sent.push(frame)
        if (frame[3] === 'phx_join') {
          joinRef = frame[0]
          this.joins.push({ topic: frame[2], payload: frame[4] })
          const a = this.answer(frame[4])
          queueMicrotask(() => emit('message', { data: JSON.stringify([joinRef, frame[1], frame[2], 'phx_reply', { status: a.ok ? 'ok' : 'error', response: a.response }]) }))
          // the stream replays the log past `since` before any live event
          if (a.ok && typeof frame[4].since === 'string') {
            const since = BigInt(frame[4].since as string)
            for (const e of this.log.filter((x) => BigInt(x.seq) > since)) queueMicrotask(() => emit('message', { data: JSON.stringify([joinRef, null, TOPIC, 'event', e]) }))
          }
        }
      },
      close: () => {},
      addEventListener: (type, l) => {
        ;(listeners[type] ??= []).push(l)
      },
    }
    record.push = (event, payload) => emit('message', { data: JSON.stringify([joinRef, null, TOPIC, event, payload]) })
    record.drop = () => emit('close', { code: 1006, reason: 'abnormal' })
    this.sockets.push(record)
    queueMicrotask(() => emit('open'))
    return socket
  }
}

async function until(cond: () => boolean, ms = 3_000) {
  const end = Date.now() + ms
  while (!cond()) {
    if (Date.now() > end) throw new Error('timed out')
    await new Promise((r) => setTimeout(r, 5))
  }
}

async function standUp(stream: StandInStream) {
  let tickets = 0
  const api = await mockApi({
    'POST /v1/me/stream-ticket': (r) => {
      tickets += 1
      assert.equal(r.headers.authorization, `Bearer ${session}`)
      return { body: { ticket: `ticket-${tickets}`, topic: TOPIC, expiresAt: '', sessionExpiresAt: '', socket: 'wss://stream.mancer.xyz/socket', head: '0' } }
    },
    'GET /v1/me/events': (r) => {
      const since = BigInt(r.query.get('since') ?? '0')
      const events = stream.log.filter((e) => BigInt(e.seq) > since).slice(0, Number(r.query.get('limit') ?? '100'))
      const next = events.length ? events.at(-1)!.seq : String(since)
      return { body: { account: account.address, events, next, more: false, head: stream.log.at(-1)?.seq ?? '0', floor: '0', truncated: false } }
    },
  })
  const m = new Mancer({ baseUrl: api.url, account, session, trusted: TRUSTED, publicClient: fakeChain() })
  return { api, m, tickets: () => tickets }
}

test('the socket URL is the endpoint’s websocket path at the V2 wire', () => {
  assert.equal(websocketUrl('wss://stream.mancer.xyz/socket'), 'wss://stream.mancer.xyz/socket/websocket?vsn=2.0.0')
})

test('the log reads by cursor, page by page', async () => {
  const stream = new StandInStream()
  stream.log = [ev(3), ev(7), ev(9)]
  const { api, m } = await standUp(stream)
  try {
    const page = await m.events('3')
    assert.deepEqual(page.events.map((e) => e.seq), ['7', '9'])
    const all: string[] = []
    for await (const e of m.eventsSince('0')) all.push(e.seq)
    assert.deepEqual(all, ['3', '7', '9'])
  } finally {
    await api.close()
  }
})

test('the stream joins with its ticket in the payload, replays past the cursor, hands each event on once, in order', async () => {
  const stream = new StandInStream()
  stream.log = [ev(5), ev(6)]
  const { api, m } = await standUp(stream)
  const got: string[] = []
  try {
    const s = await m.streamEvents({ since: '4', onEvent: (e) => { got.push(e.seq) }, webSocket: stream.factory, streamUrl: 'wss://stream.example/socket' })
    assert.equal(stream.sockets[0]!.url, 'wss://stream.example/socket/websocket?vsn=2.0.0')
    assert.doesNotMatch(stream.sockets[0]!.url, /ticket/, 'the ticket never rides the URL')
    assert.deepEqual(stream.joins[0], { topic: TOPIC, payload: { ticket: 'ticket-1', since: '4' } })
    await until(() => got.length === 2)
    stream.sockets[0]!.push('event', ev(6)) // a repeat is handed on no second time
    stream.sockets[0]!.push('event', ev(8))
    await until(() => got.length === 3)
    assert.deepEqual(got, ['5', '6', '8'])
    assert.equal(s.cursor, '8')
    s.stop()
  } finally {
    await api.close()
  }
})

test('a dropped socket is joined again with a fresh ticket from the last event handed on', async () => {
  const stream = new StandInStream()
  const { api, m, tickets } = await standUp(stream)
  const got: string[] = []
  try {
    const s = await m.streamEvents({ onEvent: (e) => { got.push(e.seq) }, webSocket: stream.factory, maxBackoffMs: 10 })
    assert.deepEqual(stream.joins[0]!.payload, { ticket: 'ticket-1' }, 'no cursor given: what is written from the join on')
    stream.sockets[0]!.push('event', ev(11))
    await until(() => got.length === 1)
    stream.log = [ev(11), ev(12)]
    stream.sockets[0]!.drop()
    await until(() => stream.joins.length === 2 && got.length === 2)
    assert.equal(tickets(), 2)
    assert.deepEqual(stream.joins[1]!.payload, { ticket: 'ticket-2', since: '11' })
    assert.deepEqual(got, ['11', '12'])
    s.stop()
  } finally {
    await api.close()
  }
})

test('a resync reads the log from its cursor and joins again; a revoked session ends the stream for good', async () => {
  const stream = new StandInStream()
  stream.log = [ev(1)]
  const { api, m } = await standUp(stream)
  const got: string[] = []
  const ends: string[] = []
  try {
    await m.streamEvents({ since: '0', onEvent: (e) => { got.push(e.seq) }, onEnd: (w) => { ends.push(w.reason) }, webSocket: stream.factory, maxBackoffMs: 10 })
    await until(() => got.length === 1)
    stream.log = [ev(1), ev(2), ev(3)]
    stream.sockets[0]!.push('resync', { reason: 'too-far', next: '1' })
    await until(() => got.length === 3 && stream.joins.length === 2)
    assert.deepEqual(got, ['1', '2', '3'])
    assert.equal(stream.joins[1]!.payload.since, '3')
    stream.sockets[1]!.push('session-ended', { reason: 'session-revoked' })
    await until(() => ends.length === 1)
    assert.deepEqual(ends, ['session-revoked'])
    await new Promise((r) => setTimeout(r, 50))
    assert.equal(stream.joins.length, 2, 'a revoked session is never joined again')
  } finally {
    await api.close()
  }
})
