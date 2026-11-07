// SPDX-License-Identifier: MIT
// Part of Mancer's contracts kit as the SDK uses it, mirrored with the rest of this repository at each release.
export type LighterErrorKind =

  | 'region'

  | 'nonce'

  | 'signature'

  | 'key'

  | 'auth'

  | 'fee'

  | 'integrators-full'

  | 'tokens-full'

  | 'minimum'

  | 'price'

  | 'margin'

  | 'liquidation'

  | 'reduce-only'

  | 'market'

  | 'order-inactive'

  | 'order-limit'

  | 'tier-wait'

  | 'tier-same'

  | 'rate-limit'

  | 'no-account'

  | 'invalid'

  | 'unavailable'
  | 'other'

export interface LighterErrorReading {
  code: number
  kind: LighterErrorKind

  retry: boolean

  words: string

  message: string | null
}

type Entry = readonly [kind: LighterErrorKind, retry: boolean, words: string]

export const LIGHTER_ERRORS: Readonly<Record<number, Entry>> = {
  20001: ['invalid', false, 'Lighter could not read this request.'],
  20008: ['market', false, 'This market is not trading on Lighter.'],
  20011: ['invalid', false, 'The expiry is not one Lighter takes.'],
  20013: ['auth', true, 'Lighter refused this browser’s sign-in. It will sign in again.'],
  20558: ['region', false, 'Lighter refused this connection under its region rules.'],
  21100: ['no-account', false, 'There is no Lighter account here yet.'],

  21101: ['key', false, 'This browser’s key is not registered on Lighter. Enable trading here again.'],
  21102: ['no-account', false, 'There is no Lighter account here yet.'],
  21104: ['nonce', true, 'Lighter expected another nonce. Signing again.'],
  21105: ['nonce', true, 'Lighter expected another nonce. Signing again.'],
  21108: ['key', false, 'This browser’s key is not registered on Lighter. Enable trading here again.'],
  21109: ['key', false, 'This browser’s key is not registered on Lighter. Enable trading here again.'],
  21110: ['key', false, 'This key slot is not one Lighter takes.'],
  21111: ['liquidation', false, 'The account is close to liquidation, so only trades that reduce risk go through.'],
  21112: ['liquidation', false, 'The account is being liquidated.'],
  21113: ['invalid', false, 'Lighter does not allow that leverage on this market.'],
  21116: ['minimum', false, 'The withdrawal is under Lighter’s minimum of 1 USDG.'],
  21117: ['margin', false, 'The withdrawal is more than the account can take out now.'],
  21118: ['minimum', false, 'The transfer is under Lighter’s minimum.'],
  21119: ['margin', false, 'The transfer is more than the account can send now.'],
  21120: ['signature', false, 'Lighter could not verify this signature.'],
  21126: ['margin', false, 'Lighter registers a key only on an account that holds collateral. Deposit first.'],
  21133: ['margin', false, 'The account’s margin does not allow this leverage now.'],
  21134: ['invalid', false, 'The transfer fee changed. Try again.'],

  21136: ['invalid', false, 'Lighter refused this key. Enable trading here again.'],
  21137: ['other', false, 'Lighter is not allowing withdrawals of this asset now.'],
  21145: ['integrators-full', false, 'This account already approves four apps. Remove one to approve Mancer.'],
  21147: ['invalid', false, 'The approval’s expiry is not one Lighter takes.'],
  21149: ['fee', false, 'Mancer’s fee is not approved on this account, or the approval has ended.'],
  21150: ['fee', false, 'This order’s fee is above what the account approved.'],
  21152: ['fee', false, 'The fee is above Lighter’s own ceiling.'],
  21153: ['fee', false, 'A fee needs the integrator’s account.'],

  21159: ['invalid', false, 'Lighter takes no self-trade setting on an order with a fee.'],
  21301: ['margin', false, 'Not enough collateral for this.'],
  21304: ['margin', false, 'Not enough balance for this.'],
  21305: ['margin', false, 'Not enough balance for the fee.'],

  21500: ['unavailable', true, 'Lighter has not listed this transaction yet.'],
  21504: ['signature', false, 'This needs your wallet’s signature.'],
  21506: ['rate-limit', true, 'Lighter is busy. Try again in a moment.'],

  21515: ['other', false, 'Lighter does not allow this transaction now.'],
  21507: ['margin', false, 'The account is below its maintenance margin, so only trades that reduce risk go through.'],
  21508: ['margin', false, 'The account is below its initial margin, so only trades that reduce risk go through.'],
  21520: ['fee', false, 'Lighter charges an app’s fee only on Plus or Premium. Move the account to Plus, or trade with no fee.'],

  21521: ['market', false, 'Only spot trading is open on this exchange now.'],
  21600: ['order-inactive', false, 'This order is no longer open.'],
  21602: ['market', false, 'This market is not trading on Lighter.'],
  21605: ['market', false, 'This market is not trading now.'],
  21614: ['reduce-only', false, 'There is no position to reduce.'],
  21618: ['invalid', false, 'This market does not take that kind of order.'],
  21631: ['market', false, 'This market is outside its trading hours.'],
  21638: ['market', false, 'This market is frozen.'],
  21701: ['invalid', false, 'Lighter does not take that size.'],
  21702: ['invalid', false, 'Lighter does not take that price.'],
  21706: ['minimum', false, 'The order is under the market’s minimum size or its $10 minimum value.'],
  21709: ['order-inactive', false, 'This order is no longer open.'],
  21711: ['invalid', false, 'The order’s expiry is not one Lighter takes.'],

  21712: ['order-limit', true, 'A cancel of every order is on its way. Try again in a moment.'],
  21715: ['order-inactive', false, 'This order is no longer open.'],
  21717: ['order-limit', false, 'The account has as many open orders as Lighter allows.'],
  21718: ['order-limit', false, 'The account has as many open orders in this market as Lighter allows.'],
  21719: ['order-limit', false, 'The account has as many pending orders as Lighter allows.'],
  21720: ['order-limit', false, 'The account has as many pending orders in this market as Lighter allows.'],
  21727: ['invalid', false, 'Lighter does not take that order number.'],
  21728: ['invalid', false, 'An order with this number is already on Lighter.'],
  21729: ['invalid', false, 'Lighter does not take that trigger price.'],
  21733: ['price', false, 'The price is too far from the market. Lighter flagged it as a mistake.'],
  21734: ['price', false, 'The limit price is too far from the market’s mark.'],
  21735: ['price', false, 'The price is too far from its trigger.'],
  21738: ['reduce-only', false, 'A reduce-only order must reduce the position.'],
  21739: ['margin', false, 'Not enough margin for this order.'],

  21751: ['invalid', false, 'The order changed since this page read it. Look again, then move it.'],
  21740: ['reduce-only', false, 'This order cannot be reduce-only.'],
  21741: ['invalid', false, 'Lighter does not take that group of orders.'],
  21742: ['invalid', false, 'Lighter does not take that group of orders.'],
  21748: ['market', false, 'This market needs another margin mode than the account’s.'],
  23000: ['rate-limit', true, 'Lighter is busy. Try again in a moment.'],
  23004: ['rate-limit', true, 'Too many withdrawals for now. Try again later.'],
  23005: ['rate-limit', true, 'Too many fast withdrawals for now. Try again later.'],

  23100: ['other', false, 'Lighter does not permit this on this account.'],
  23201: ['other', false, 'The faucet refills only an account under $100.'],
  29500: ['unavailable', true, 'Lighter could not do this right now.'],
  52001: ['other', false, 'Lighter refused this account.'],
  52002: ['margin', false, 'Lighter now takes only trades that reduce positions on this account’s tier.'],

  61003: ['tokens-full', false, 'This account holds Lighter’s ten read-only tokens already. Remove one in Lighter’s app.'],
  62001: ['tier-wait', true, 'A tier change is already on its way.'],
  62002: ['invalid', false, 'That tier is not one Lighter offers.'],
  62003: ['tier-same', false, 'The account is on that tier already.'],
  62006: ['tier-wait', false, 'Lighter allows one tier change a day, so this one waits.'],
}

const PLAIN: Readonly<Record<LighterErrorKind, string>> = {
  region: 'Lighter refused this connection under its region rules.',
  nonce: 'Lighter expected another nonce. Signing again.',
  signature: 'Lighter could not verify this signature.',
  key: 'This browser’s key is not registered on Lighter. Enable trading here again.',
  auth: 'Lighter refused this browser’s sign-in. It will sign in again.',
  fee: 'Lighter refused the fee on this order.',
  'integrators-full': 'This account already approves four apps. Remove one to approve Mancer.',
  'tokens-full': 'This account holds Lighter’s ten read-only tokens already. Remove one in Lighter’s app.',
  minimum: 'This is under Lighter’s minimum.',
  price: 'The price is too far from the market.',
  margin: 'Not enough margin for this.',
  liquidation: 'The account is close to liquidation.',
  'reduce-only': 'A reduce-only order must reduce the position.',
  market: 'This market is not trading now.',
  'order-inactive': 'This order is no longer open.',
  'order-limit': 'The account has as many open orders as Lighter allows.',
  'tier-wait': 'Lighter allows one tier change a day, so this one waits.',
  'tier-same': 'The account is on that tier already.',
  'rate-limit': 'Lighter is busy. Try again in a moment.',
  'no-account': 'There is no Lighter account here yet.',
  invalid: 'Lighter could not read this request.',
  unavailable: 'Lighter could not do this right now.',
  other: 'Lighter refused this.',
}

export function lighterErrorOf(code: number, message?: string | null): LighterErrorReading | null {
  if (code === 200 || code === 0) return null
  const entry = LIGHTER_ERRORS[code]
  const kept = typeof message === 'string' && message.trim() !== '' ? message : null
  if (!entry) return { code, kind: 'other', retry: false, words: PLAIN.other, message: kept }
  const [kind, retry, words] = entry
  return { code, kind, retry, words, message: kept }
}

export function lighterKindWords(kind: LighterErrorKind): string {
  return PLAIN[kind]
}

export function isLighterNonceError(code: number): boolean {
  return LIGHTER_ERRORS[code]?.[0] === 'nonce'
}

export function isLighterRegionError(code: number): boolean {
  return code === 20558
}

export function lighterAppErrorOf(eventInfo: unknown): { code: number | null; message: string } | null {
  if (typeof eventInfo !== 'string' || eventInfo === '') return null
  let e: { ae?: unknown }
  try {
    e = JSON.parse(eventInfo) as { ae?: unknown }
  } catch {
    return null
  }
  const ae = e?.ae
  if (ae === undefined || ae === null || ae === '') return null
  if (typeof ae === 'object') {
    const o = ae as { code?: unknown; message?: unknown }
    return { code: typeof o.code === 'number' ? o.code : null, message: typeof o.message === 'string' ? o.message : JSON.stringify(ae) }
  }
  if (typeof ae !== 'string') return { code: null, message: String(ae) }
  try {
    const o = JSON.parse(ae) as { code?: unknown; message?: unknown }
    if (o && typeof o === 'object') return { code: typeof o.code === 'number' ? o.code : null, message: typeof o.message === 'string' ? o.message : ae }
  } catch {

  }
  return { code: null, message: ae }
}

export type LighterTxVerdict = { state: 'pending' } | { state: 'executed' } | { state: 'refused'; code: number | null; words: string } | { state: 'failed'; words: string }

export function lighterTxVerdict(row: { status?: unknown; event_info?: unknown } | null): LighterTxVerdict {
  if (!row) return { state: 'pending' }
  if (row.status === 2 || row.status === 3) {
    const ae = lighterAppErrorOf(row.event_info)
    if (!ae) return { state: 'executed' }
    const reading = ae.code !== null ? lighterErrorOf(ae.code, ae.message) : null
    return { state: 'refused', code: ae.code, words: reading && reading.kind !== 'other' ? reading.words : `Lighter ran it and refused: ${ae.message}.` }
  }
  if (row.status === 0) {
    const ae = lighterAppErrorOf(row.event_info)
    const reading = ae?.code != null ? lighterErrorOf(ae.code, ae.message) : null
    return { state: 'failed', words: reading && reading.kind !== 'other' ? reading.words : ae ? `Lighter did not run it: ${ae.message}.` : 'Lighter did not run it.' }
  }
  return { state: 'pending' }
}
