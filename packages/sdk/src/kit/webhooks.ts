// SPDX-License-Identifier: MIT
// Part of Mancer's contracts kit as the SDK uses it, mirrored with the rest of this repository at each release.
export const WEBHOOK_EVENT_ID_HEADER = 'Mancer-Event-Id'
export const WEBHOOK_EVENT_TYPE_HEADER = 'Mancer-Event-Type'
export const WEBHOOK_ID_HEADER = 'Mancer-Webhook-Id'
export const WEBHOOK_TIMESTAMP_HEADER = 'Mancer-Timestamp'
export const WEBHOOK_SIGNATURE_HEADER = 'Mancer-Signature'

export const WEBHOOK_TOLERANCE_SEC = 300

export const WEBHOOK_PING_KIND = 'webhook.ping'

export interface ParsedWebhookSignature {
  timestamp: number
  signatures: string[]
}

const HEADER_MAX = 1_024
const SIGNATURES_MAX = 8
const HEX64 = /^[0-9a-f]{64}$/

export function parseWebhookSignature(header: string | null | undefined): ParsedWebhookSignature | null {
  if (typeof header !== 'string' || header.length === 0 || header.length > HEADER_MAX) return null
  let timestamp: number | null = null
  const signatures: string[] = []
  for (const part of header.split(',')) {
    const at = part.indexOf('=')
    if (at <= 0) continue
    const key = part.slice(0, at).trim()
    const value = part.slice(at + 1).trim()
    if (key === 't') {
      if (timestamp !== null || !/^[0-9]{1,12}$/.test(value)) return null
      timestamp = Number(value)
    } else if (key === 'v1') {
      const hex = value.toLowerCase()
      if (HEX64.test(hex) && signatures.length < SIGNATURES_MAX) signatures.push(hex)
    }
  }
  if (timestamp === null || signatures.length === 0) return null
  return { timestamp, signatures }
}

export type WebhookSignatureFailure = 'malformed' | 'timestamp' | 'mismatch' | 'no-crypto'
export type WebhookSignatureCheck = { ok: true; timestamp: number } | { ok: false; reason: WebhookSignatureFailure }

interface SubtleLike {
  importKey(format: 'raw', key: Uint8Array, algorithm: { name: 'HMAC'; hash: 'SHA-256' }, extractable: boolean, usages: ['sign']): Promise<unknown>
  sign(algorithm: 'HMAC', key: unknown, data: Uint8Array): Promise<ArrayBuffer>
}

function subtleCrypto(): SubtleLike | null {
  const c = (globalThis as { crypto?: { subtle?: SubtleLike } }).crypto
  return c?.subtle ?? null
}

const encoder = new TextEncoder()

function bodyBytes(body: string | Uint8Array | ArrayBuffer): Uint8Array {
  if (typeof body === 'string') return encoder.encode(body)
  if (body instanceof Uint8Array) return body
  return new Uint8Array(body)
}

function hexOf(bytes: ArrayBuffer): string {
  let out = ''
  for (const b of new Uint8Array(bytes)) out += b.toString(16).padStart(2, '0')
  return out
}

function sameHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function webhookSignatureOf(secret: string, timestamp: number, rawBody: string | Uint8Array | ArrayBuffer): Promise<string | null> {
  const subtle = subtleCrypto()
  if (!subtle) return null
  const head = encoder.encode(`${timestamp}.`)
  const body = bodyBytes(rawBody)
  const message = new Uint8Array(head.length + body.length)
  message.set(head, 0)
  message.set(body, head.length)
  const key = await subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return hexOf(await subtle.sign('HMAC', key, message))
}

export async function checkWebhookSignature(
  secret: string,
  header: string | null | undefined,
  rawBody: string | Uint8Array | ArrayBuffer,
  toleranceSec: number = WEBHOOK_TOLERANCE_SEC,
  nowSec: number = Math.floor(Date.now() / 1000),
): Promise<WebhookSignatureCheck> {
  const parsed = parseWebhookSignature(header)
  if (!parsed || typeof secret !== 'string' || secret.length === 0) return { ok: false, reason: 'malformed' }
  if (typeof toleranceSec !== 'number' || Number.isNaN(toleranceSec) || toleranceSec < 0) return { ok: false, reason: 'timestamp' }
  if (toleranceSec !== Infinity && !(Math.abs(nowSec - parsed.timestamp) <= toleranceSec)) return { ok: false, reason: 'timestamp' }
  const expected = await webhookSignatureOf(secret, parsed.timestamp, rawBody)
  if (expected === null) return { ok: false, reason: 'no-crypto' }

  let matched = false
  for (const given of parsed.signatures) matched = sameHex(given, expected) || matched
  return matched ? { ok: true, timestamp: parsed.timestamp } : { ok: false, reason: 'mismatch' }
}

export async function verifyWebhookSignature(
  secret: string,
  header: string | null | undefined,
  rawBody: string | Uint8Array | ArrayBuffer,
  toleranceSec: number = WEBHOOK_TOLERANCE_SEC,
  nowSec?: number,
): Promise<boolean> {
  return (await checkWebhookSignature(secret, header, rawBody, toleranceSec, nowSec)).ok
}
