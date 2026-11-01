import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { checkWebhookSignature as kitCheck, parseWebhookSignature as kitParse, verifyWebhookSignature as kitVerify } from '../src/kit/webhooks'
import {
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TOLERANCE_SEC,
  checkWebhookSignature,
  parseWebhookSignature,
  verifyWebhookSignature,
  webhookSignatureOf,
} from '../src/index'

// A webhook delivery's check, as the SDK hands it to a receiver: the kit's own functions (the ones the API's deliveries are
// signed for), on the raw body as it arrived, each failure named. The signature here is made with Node's crypto, as the
// API's seal.ts makes it, so the check is read against an independent signer.

const SECRET = `whsec_${'s'.repeat(43)}`
const T = 1_793_000_000
const BODY = JSON.stringify({ seq: '4182', kind: 'order.filled', account: `0x${'a1'.repeat(20)}`, wallet: `0x${'a1'.repeat(20)}`, key: '0xorder', at: '2026-10-30T12:00:00.000Z', data: { fillIndex: 1 } })
const sign = (secret: string, t: number, body: string) => createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')
const header = (t: number, ...secrets: string[]) => [`t=${t}`, ...secrets.map((s) => `v1=${sign(s, t, BODY)}`)].join(',')

test('the SDK exports the kit’s own webhook check, unchanged', () => {
  assert.equal(verifyWebhookSignature, kitVerify)
  assert.equal(checkWebhookSignature, kitCheck)
  assert.equal(parseWebhookSignature, kitParse)
  assert.equal(WEBHOOK_SIGNATURE_HEADER, 'Mancer-Signature')
  assert.equal(WEBHOOK_TOLERANCE_SEC, 300)
})

test('a delivery signed under the secret passes on its raw body, and nothing else does', async () => {
  assert.equal(await verifyWebhookSignature(SECRET, header(T, SECRET), BODY, 300, T), true)
  assert.deepEqual(await checkWebhookSignature(SECRET, header(T, SECRET), BODY, 300, T + 299), { ok: true, timestamp: T })
  assert.equal(await webhookSignatureOf(SECRET, T, BODY), sign(SECRET, T, BODY))
  // a body parsed and written again is not the bytes that were signed
  assert.deepEqual(await checkWebhookSignature(SECRET, header(T, SECRET), JSON.stringify(JSON.parse(BODY), null, 1), 300, T), { ok: false, reason: 'mismatch' })
  assert.deepEqual(await checkWebhookSignature(`${SECRET}x`, header(T, SECRET), BODY, 300, T), { ok: false, reason: 'mismatch' })
  assert.deepEqual(await checkWebhookSignature(SECRET, header(T, SECRET), BODY, 300, T + 301), { ok: false, reason: 'timestamp' })
  assert.deepEqual(await checkWebhookSignature(SECRET, 'v1=abc', BODY, 300, T), { ok: false, reason: 'malformed' })
  assert.deepEqual(await checkWebhookSignature(SECRET, null, BODY, 300, T), { ok: false, reason: 'malformed' })
})

test('while a rotated secret stands, either one passes', async () => {
  const next = `whsec_${'n'.repeat(43)}`
  const both = header(T, next, SECRET)
  assert.equal(await verifyWebhookSignature(next, both, BODY, 300, T), true)
  assert.equal(await verifyWebhookSignature(SECRET, both, BODY, 300, T), true)
  assert.deepEqual(parseWebhookSignature(both)?.signatures.length, 2)
})

test('an infinite tolerance checks no second, and a tolerance under zero passes nothing', async () => {
  assert.deepEqual(await checkWebhookSignature(SECRET, header(T, SECRET), BODY, Infinity, T + 30 * 86_400), { ok: true, timestamp: T })
  assert.deepEqual(await checkWebhookSignature(SECRET, header(T, SECRET), BODY, -1, T), { ok: false, reason: 'timestamp' })
  assert.deepEqual(await checkWebhookSignature(SECRET, header(T, SECRET), BODY, Number.NaN, T), { ok: false, reason: 'timestamp' })
})
