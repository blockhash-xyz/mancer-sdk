// SPDX-License-Identifier: MIT
// Part of Mancer's contracts kit as the SDK uses it, mirrored with the rest of this repository at each release.
import { hashTypedData, keccak256, toBytes, type Address, type Hex, type TypedDataDomain } from 'viem'
import { orderToAbiV3, ordersDomainFor, orderTypesFor, type MancerOrderV3, type OrderMessageV3 } from '../orders'
import { BOOK_SHARED } from './deployments'

export const BOOK_EIP712_NAME = 'TOKENIZE.FUN'
export const BOOK_EIP712_VERSION = '1'

export const MANCER_QUOTE_TYPES = {
  MancerQuote: [
    { name: 'adapter', type: 'address' },
    { name: 'tokenIn', type: 'address' },
    { name: 'tokenOut', type: 'address' },
    { name: 'amountIn', type: 'uint256' },
    { name: 'minOut', type: 'uint256' },
    { name: 'route', type: 'bytes' },
    { name: 'deadline', type: 'uint256' },
    { name: 'salt', type: 'uint256' },
  ],
} as const

export const MANCER_ORDER_GRANT_TYPES = {
  MancerOrderGrant: [
    { name: 'spender', type: 'address' },
    { name: 'orderHash', type: 'bytes32' },
    { name: 'deadline', type: 'uint256' },
    { name: 'salt', type: 'uint256' },
  ],
} as const

export const BOOK_TRADE_INTENT_TYPES = {
  TradeIntent: [
    { name: 'adapter', type: 'address' },
    { name: 'tokenIn', type: 'address' },
    { name: 'tokenOut', type: 'address' },
    { name: 'amountIn', type: 'uint256' },
    { name: 'minOut', type: 'uint256' },
    { name: 'route', type: 'bytes' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
    { name: 'quoteSalt', type: 'uint256' },
    { name: 'mancerSig', type: 'bytes' },
  ],
} as const

export const BOOK_ORDER_INTENT_TYPES = {
  OrderIntent: [
    { name: 'spender', type: 'address' },
    { name: 'orderHash', type: 'bytes32' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
    { name: 'quoteSalt', type: 'uint256' },
    { name: 'mancerSig', type: 'bytes' },
  ],
} as const

export const BOOK_TYPEHASHES = {
  quote: '0x23082c203b2b7f76ad5f59931059f75c33857de745ac046d49ad88a264d8ec1c',
  grant: '0x3a845c55650b0146f92e22ab4b230f6c8a40afd49faa49f9f459c60a2d0240c7',
  trade: '0x93543537ed60a2dbc306f9dd9bfda49c448eeee49458b60270340052fa0bfa1b',
  orderIntent: '0xdfb8c9dc385b1355d49ebeea508a06ac0cb2e7a8f62e90ccafff0e12bed10b2d',
} as const satisfies Record<string, Hex>

export function bookTypeString(types: Record<string, readonly { name: string; type: string }[]>): string {
  const [name, fields] = Object.entries(types)[0]!
  return `${name}(${fields.map((f) => `${f.type} ${f.name}`).join(',')})`
}

export function bookTypeHash(types: Record<string, readonly { name: string; type: string }[]>): Hex {
  return keccak256(toBytes(bookTypeString(types)))
}

export function bookVaultDomain(
  vault: Address,
  opts: { chainId?: number; name?: string; version?: string } = {},
): TypedDataDomain {
  return { name: opts.name ?? BOOK_EIP712_NAME, version: opts.version ?? BOOK_EIP712_VERSION, chainId: opts.chainId ?? 4663, verifyingContract: vault }
}

export function bookVaultDomainFromChain(answer: readonly unknown[]): TypedDataDomain {
  const [fields, name, version, chainId, verifyingContract, salt, extensions] = answer as [
    Hex, string, string, bigint, Address, Hex, readonly bigint[],
  ]
  if (fields !== '0x0f') throw new Error(`the vault's eip712Domain names fields ${fields}, not 0x0f`)
  if (!/^0x0{64}$/.test(salt)) throw new Error("the vault's eip712Domain carries a salt")
  if (extensions.length !== 0) throw new Error("the vault's eip712Domain carries extensions")
  return { name, version, chainId: Number(chainId), verifyingContract }
}

export interface BookQuote {
  adapter: Address
  tokenIn: Address
  tokenOut: Address
  amountIn: bigint
  minOut: bigint

  route: Hex
  deadline: bigint
  salt: bigint
  signature: Hex
}

export interface BookQuoteWire {
  adapter: Address
  tokenIn: Address
  tokenOut: Address
  amountIn: string
  minOut: string
  route: Hex
  deadline: string
  salt: string
  signature: Hex
}

export function hashBookQuote(domain: TypedDataDomain, q: Omit<BookQuote, 'signature'>): Hex {
  return hashTypedData({
    domain,
    types: MANCER_QUOTE_TYPES,
    primaryType: 'MancerQuote',
    message: { adapter: q.adapter, tokenIn: q.tokenIn, tokenOut: q.tokenOut, amountIn: q.amountIn, minOut: q.minOut, route: q.route, deadline: q.deadline, salt: q.salt },
  })
}

export interface BookOrderGrant {
  spender: Address
  orderHash: Hex
  deadline: bigint
  salt: bigint
}

export function hashBookOrderGrant(domain: TypedDataDomain, g: BookOrderGrant): Hex {
  return hashTypedData({ domain, types: MANCER_ORDER_GRANT_TYPES, primaryType: 'MancerOrderGrant', message: g })
}

export interface BookTradeIntent {
  adapter: Address
  tokenIn: Address
  tokenOut: Address
  amountIn: bigint
  minOut: bigint
  nonce: bigint
  deadline: bigint
  route: Hex
  quoteSalt: bigint
  mancerSig: Hex
}

export function hashBookTradeIntent(domain: TypedDataDomain, i: BookTradeIntent): Hex {
  return hashTypedData({
    domain,
    types: BOOK_TRADE_INTENT_TYPES,
    primaryType: 'TradeIntent',
    message: {
      adapter: i.adapter, tokenIn: i.tokenIn, tokenOut: i.tokenOut, amountIn: i.amountIn, minOut: i.minOut,
      route: i.route, nonce: i.nonce, deadline: i.deadline, quoteSalt: i.quoteSalt, mancerSig: i.mancerSig,
    },
  })
}

export function bookTradeIntentFromQuote(q: BookQuote, nonce: bigint): BookTradeIntent {
  return {
    adapter: q.adapter, tokenIn: q.tokenIn, tokenOut: q.tokenOut, amountIn: q.amountIn, minOut: q.minOut, route: q.route,
    nonce, deadline: q.deadline, quoteSalt: q.salt, mancerSig: q.signature,
  }
}

export interface BookOrderIntentHashed {
  spender: Address
  orderHash: Hex
  nonce: bigint
  deadline: bigint
  quoteSalt: bigint
  mancerSig: Hex
}

export function hashBookOrderIntent(domain: TypedDataDomain, i: BookOrderIntentHashed): Hex {
  return hashTypedData({ domain, types: BOOK_ORDER_INTENT_TYPES, primaryType: 'OrderIntent', message: i })
}

export function mancerOrderHashV3(order: MancerOrderV3, orders: Address = BOOK_SHARED.mancerOrdersV3, chainId = 4663): Hex {
  return hashTypedData({ domain: ordersDomainFor('v3', chainId, orders), types: orderTypesFor('v3'), primaryType: 'Order', message: orderToAbiV3(order) })
}

export interface BookOrderGrantSigned extends BookOrderGrant {
  order: MancerOrderV3
  signature: Hex
}

export function bookOrderIntentFromGrant(g: BookOrderGrantSigned, nonce: bigint): {
  spender: Address
  order: OrderMessageV3
  nonce: bigint
  deadline: bigint
  quoteSalt: bigint
  mancerSig: Hex
} {
  return { spender: g.spender, order: orderToAbiV3(g.order), nonce, deadline: g.deadline, quoteSalt: g.salt, mancerSig: g.signature }
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/
const HEX = /^0x(?:[0-9a-fA-F]{2})*$/
const BYTES32 = /^0x[0-9a-fA-F]{64}$/
const UNITS = /^(?:0|[1-9][0-9]*)$/
const UINT256_MAX = (1n << 256n) - 1n

function record(input: unknown, what: string): Record<string, unknown> {
  const value = typeof input === 'string' ? (JSON.parse(input) as unknown) : input
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${what} is not an object`)
  return value as Record<string, unknown>
}

function field(o: Record<string, unknown>, key: string, what: string): unknown {
  const v = o[key]
  if (v === undefined || v === null) throw new Error(`${what} has no ${key}`)
  return v
}

function address(o: Record<string, unknown>, key: string, what: string): Address {
  const v = field(o, key, what)
  if (typeof v !== 'string' || !ADDRESS.test(v)) throw new Error(`${what}'s ${key} is not an address`)
  return v as Address
}

function units(o: Record<string, unknown>, key: string, what: string): bigint {
  const v = field(o, key, what)
  if (typeof v !== 'string' || !UNITS.test(v)) throw new Error(`${what}'s ${key} is not a decimal integer string`)
  const n = BigInt(v)
  if (n > UINT256_MAX) throw new Error(`${what}'s ${key} is over 256 bits`)
  return n
}

function hex(o: Record<string, unknown>, key: string, what: string, pattern = HEX): Hex {
  const v = field(o, key, what)
  if (typeof v !== 'string' || !pattern.test(v)) throw new Error(`${what}'s ${key} is not hex`)
  return v as Hex
}

export function parseBookQuote(input: unknown): BookQuote {
  const o = record(input, 'the quote')
  const what = 'the quote'
  return {
    adapter: address(o, 'adapter', what),
    tokenIn: address(o, 'tokenIn', what),
    tokenOut: address(o, 'tokenOut', what),
    amountIn: units(o, 'amountIn', what),
    minOut: units(o, 'minOut', what),
    route: hex(o, 'route', what),
    deadline: units(o, 'deadline', what),
    salt: units(o, 'salt', what),
    signature: hex(o, 'signature', what),
  }
}

export function bookQuoteToWire(q: BookQuote): BookQuoteWire {
  return {
    adapter: q.adapter.toLowerCase() as Address,
    tokenIn: q.tokenIn.toLowerCase() as Address,
    tokenOut: q.tokenOut.toLowerCase() as Address,
    amountIn: q.amountIn.toString(),
    minOut: q.minOut.toString(),
    route: q.route.toLowerCase() as Hex,
    deadline: q.deadline.toString(),
    salt: q.salt.toString(),
    signature: q.signature.toLowerCase() as Hex,
  }
}

const ORDER_NUMBERS = ['totalFills', 'everySec', 'fillWindowSec', 'startAt', 'expiry', 'maxFeeBps'] as const
const ORDER_UNITS = ['amountPerFill', 'minOutPerFill', 'triggerOutPerFill', 'maxOutPerFill', 'nonce'] as const

export function parseBookOrderGrant(input: unknown): BookOrderGrantSigned {
  const raw = record(input, 'the grant')
  const o = record(field(raw, 'order', 'the grant'), 'the order')
  const g = raw.grant && typeof raw.grant === 'object' ? (raw.grant as Record<string, unknown>) : raw
  const order: Record<string, unknown> = {
    maker: address(o, 'maker', 'the order'),
    tokenIn: address(o, 'tokenIn', 'the order'),
    tokenOut: address(o, 'tokenOut', 'the order'),
    epoch: hex(o, 'epoch', 'the order', BYTES32),
    ocoGroup: hex(o, 'ocoGroup', 'the order', BYTES32),
  }
  for (const k of ORDER_UNITS) order[k] = units(o, k, 'the order').toString()
  for (const k of ORDER_NUMBERS) {
    const v = field(o, k, 'the order')
    const n = typeof v === 'number' ? v : typeof v === 'string' && UNITS.test(v) ? Number(v) : NaN
    if (!Number.isSafeInteger(n) || n < 0) throw new Error(`the order's ${k} is not a whole number`)
    order[k] = n
  }
  return {
    spender: address(g, 'spender', 'the grant'),
    orderHash: hex(g, 'orderHash', 'the grant', BYTES32),
    deadline: units(g, 'deadline', 'the grant'),
    salt: units(g, 'salt', 'the grant'),
    signature: hex(g, 'signature', 'the grant'),
    order: order as unknown as MancerOrderV3,
  }
}

const SECP256K1_HALF_N = 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0n

export function bookSignatureProblem(signature: Hex): string | null {
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) return 'the signature is not 65 bytes'
  const s = BigInt(`0x${signature.slice(66, 130)}`)
  const v = Number.parseInt(signature.slice(130, 132), 16)
  if (v !== 27 && v !== 28) return 'the signature\'s v is not 27 or 28'
  if (s > SECP256K1_HALF_N) return 'the signature\'s s is not low'
  return null
}
