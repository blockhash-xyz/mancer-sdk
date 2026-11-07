// SPDX-License-Identifier: MIT
// Part of Mancer's contracts kit as the SDK uses it, mirrored with the rest of this repository at each release.
import { decodeAbiParameters, encodeAbiParameters, getAddress, hashTypedData, isHex, keccak256, parseAbi, type Address, type Hex, type TypedDataDomain } from 'viem'
import { LIGHTER_RH_DEPLOYMENT } from '../lighter/deployments'

export interface BookPerpsDeployment {
  factory: Address
  adapter: Address

  runtimeCodeHash: Hex

  fromBlock: bigint
  deployTx: Hex
}

export const BOOK_PERPS_DEPLOYMENTS: readonly BookPerpsDeployment[] = [
  {
    factory: '0xa727e7AF47A965afD0341AfCEF7Bc3F86be876b0',
    adapter: '0x9b77ba6a853EB2080Ed71ce134B0aF3608E74B36',
    runtimeCodeHash: '0xe6001f5616fcaed762cda75b394dde63c1037c8543409763b3e0d10247bc8be8',
    fromBlock: 106_515_198n,
    deployTx: '0x9bf543d5bf51527c008184823603e7d7b718c30b3dcc1c02f9a04cc3368ff7d8',
  },
  {
    factory: '0x0D650F791f6c53C83D5076f1f144C7C2d673cCB2',
    adapter: '0xfD413fcba7cC2059C33C108f75a7922F9A9d6150',
    runtimeCodeHash: '0xcfb5ffc38f7b73e0481f69d93563d7093acce01c6818304905dfe494d6b6c30b',
    fromBlock: 107_180_485n,
    deployTx: '0x184dc6c33d8098a94286a2265354f0f891a73fda47e0bde6261c0280588bc4f9',
  },
]

export function bookPerpsDeploymentOf(factory: Address): BookPerpsDeployment | null {
  const f = factory.toLowerCase()
  return BOOK_PERPS_DEPLOYMENTS.find((d) => d.factory.toLowerCase() === f) ?? null
}

export const BOOK_PERPS_KEY_SLOT = 42

export const BOOK_PERPS_TRADER_SLOT_BASE = BOOK_PERPS_KEY_SLOT
export const BOOK_PERPS_MAX_TRADERS = 8

export function bookPerpsTraderSlot(index: number): number {
  if (!Number.isInteger(index) || index < 0 || index >= BOOK_PERPS_MAX_TRADERS) throw new Error('a Book has 1 to 8 traders')
  return BOOK_PERPS_TRADER_SLOT_BASE + index
}

export function bookPerpsTraderSlots(traders: number): number[] {
  return Array.from({ length: Math.min(traders, BOOK_PERPS_MAX_TRADERS) }, (_, i) => bookPerpsTraderSlot(i))
}

export function bookPerpsSlotOf(traders: readonly string[], wallet: string): number | null {
  const i = traders.findIndex((t) => t.toLowerCase() === wallet.toLowerCase())
  return i < 0 || i >= BOOK_PERPS_MAX_TRADERS ? null : bookPerpsTraderSlot(i)
}

export function isBookPerpsTraderSlot(slot: number): boolean {
  return Number.isInteger(slot) && slot >= BOOK_PERPS_TRADER_SLOT_BASE && slot < BOOK_PERPS_TRADER_SLOT_BASE + BOOK_PERPS_MAX_TRADERS
}

export interface BookPerpsKeyContext {
  chainId: number
  account: Address
  slot: number
  session: string
}

const CONTEXT = /^mancer-books-perps:v1:chain=([1-9][0-9]{0,9}):account=(0x[0-9a-f]{40}):slot=([0-9]{1,3}):session=([0-9a-f]{32})$/

export function bookPerpsKeyContext(c: BookPerpsKeyContext): string {
  if (!Number.isSafeInteger(c.chainId) || c.chainId <= 0) throw new Error('a chain id')
  if (!/^0x[0-9a-fA-F]{40}$/.test(c.account)) throw new Error('an account address')
  if (!isBookPerpsTraderSlot(c.slot)) throw new Error('a trader slot (42 to 49)')
  if (!/^[0-9a-f]{32}$/.test(c.session)) throw new Error('a session of 16 bytes as hex')
  return `mancer-books-perps:v1:chain=${c.chainId}:account=${c.account.toLowerCase()}:slot=${c.slot}:session=${c.session}`
}

export function parseBookPerpsKeyContext(text: string): BookPerpsKeyContext | null {
  const m = CONTEXT.exec(text)
  if (!m) return null
  const slot = Number(m[3])
  if (!isBookPerpsTraderSlot(slot)) return null
  return { chainId: Number(m[1]), account: m[2] as Address, slot, session: m[4]! }
}

export function bookPerpsKeyAuthorization(a: { token: Address; account: Address; chainId: number; slot: number; traderShare: Hex; context: string }): string {
  if (lighterPubKeyProblem(a.traderShare)) throw new Error('the trader share is not a Lighter key')
  const ctx = parseBookPerpsKeyContext(a.context)
  if (!ctx || ctx.chainId !== a.chainId || ctx.account !== a.account.toLowerCase() || ctx.slot !== a.slot) throw new Error('the context names another key')
  return [
    'Mancer Books perps key',
    '',
    "This is my half of the Book vault's Lighter key. Mancer holds the other half, and neither half signs an order alone.",
    '',
    `Book: ${getAddress(a.token)}`,
    `Vault perps account: ${getAddress(a.account)}`,
    `Lighter chain: ${a.chainId}`,
    `Key slot: ${a.slot}`,
    `Trader share: ${a.traderShare.toLowerCase()}`,
    `Session: ${a.context}`,
  ].join('\n')
}

export const LIGHTER_PUB_KEY_BYTES = 40
const GOLDILOCKS_MODULUS = 0xffffffff00000001n

export function lighterPubKeyProblem(pubKey: Hex): string | null {
  if (!isHex(pubKey) || pubKey.length !== 2 + LIGHTER_PUB_KEY_BYTES * 2) return 'a Lighter key is 40 bytes'
  let zero = true
  for (let i = 0; i < 5; i++) {
    const le = pubKey.slice(2 + i * 16, 2 + (i + 1) * 16)
    const word = BigInt('0x' + (le.match(/../g) ?? []).reverse().join(''))
    if (word >= GOLDILOCKS_MODULUS) return 'a Lighter key element is past the field'
    if (word !== 0n) zero = false
  }
  return zero ? 'a Lighter key is not zero' : null
}

export const BOOK_PERPS_EXIT_GRACE_SECS = 172_800

export const BOOK_PERPS_UNSIGNED_REDUCE_GRACE_SECS = 1_209_600

export const BOOK_PERPS_DEPOSIT_CUTOFF_SECS = 86_400

export const BOOK_PERPS_REFUSED_SLOTS: readonly number[] = [0, 1, 2, 3, 157]

export const BOOK_PERPS_RETIRED_KEY = '0xb443bf7a612b2c6c636d1f4901788de985197b5353437498eebef6b1364c5ef2e2dc827b171d3519' as const
export const BOOK_PERPS_RETIRED_KEY_SEED = 'Mancer Books perps: a Lighter key nobody holds'

export const BOOK_LIGHTER_ADAPTER_ABI = parseAbi([
  'function FACTORY() view returns (address)',
  'function LIGHTER() view returns (address)',
  'function COLLATERAL() view returns (address)',
  'function ASSET_INDEX() view returns (uint16)',
  'function WETH() view returns (address)',
  'function DEPOSIT_CUTOFF() view returns (uint256)',
  'function perpsAccountOf(address book) view returns (address)',
  'event Deposited(address indexed book, uint256 indexed bookId, address indexed account, uint256 amount)',
  'event AccountMade(address indexed book, uint256 indexed bookId, address account)',
  'event KeyQueued(address indexed book, address indexed account, uint8 apiKeyIndex)',
])

export const BOOK_PERPS_ACCOUNT_ABI = parseAbi([
  'function BOOK() view returns (address)',
  'function BOOK_ID() view returns (uint256)',
  'function ADAPTER() view returns (address)',
  'function EXIT_GRACE() view returns (uint256)',
  'function UNSIGNED_REDUCE_GRACE() view returns (uint256)',
  'function RETIRED_KEY() view returns (bytes)',
  'function masterAccountIndex() view returns (uint48)',
  'function priorityTarget() view returns (address)',
  'function signedUsed(bytes32) view returns (bool)',
  'function hashReduce(uint48 accountIndex, uint16 marketIndex, uint48 baseAmount, uint32 price, uint8 isAsk, uint8 orderType, uint256 deadline, uint256 salt) view returns (bytes32)',
  'function hashCall(address target, bytes data, uint256 deadline, uint256 salt) view returns (bytes32)',
  'function retireKey(uint8 apiKeyIndex)',
  'function withdraw(uint48 accountIndex, uint16 assetIndex, uint8 routeType, uint64 baseAmount)',
  'function cancelAllOrders(uint48 accountIndex)',
  'function burnShares(uint48 accountIndex, uint48 publicPoolIndex, uint64 shareAmount)',
  'function reduce(uint48 accountIndex, uint16 marketIndex, uint48 baseAmount, uint32 price, uint8 isAsk, uint8 orderType, uint256 deadline, uint256 salt, bytes mancerSig, bytes[] traderSigs)',
  'function priorityCall(bytes data, uint256 deadline, uint256 salt, bytes mancerSig, bytes[] traderSigs)',
  'function claim(uint16 assetIndex)',
  'function forward(address token)',
  'event KeyChanged(uint48 indexed accountIndex, uint8 apiKeyIndex, bytes pubKey)',
  'event KeyRetired(uint48 indexed accountIndex, uint8 apiKeyIndex, address by)',
  'event WithdrawQueued(uint48 indexed accountIndex, uint16 assetIndex, uint8 routeType, uint64 baseAmount, address by)',
  'event CancelAllQueued(uint48 indexed accountIndex, address by)',
  'event BurnSharesQueued(uint48 indexed accountIndex, uint48 publicPoolIndex, uint64 shareAmount, address by)',
  'event ReduceQueued(uint48 indexed accountIndex, uint16 marketIndex, uint48 baseAmount, uint32 price, uint8 isAsk, uint8 orderType, uint8 signedBy, address by)',
  'event PriorityCalled(address indexed target, bytes4 selector, address by)',
  'event Claimed(uint16 indexed assetIndex, uint128 amount, address by)',
  'event Forwarded(address indexed token, uint256 amount, bool synced, address by)',
])

export interface BookPerpsRoute {
  account: Address
  apiKeyIndex: number
  pubKey: Hex
}

const ROUTE_PARAMS = [{ type: 'address' }, { type: 'uint8' }, { type: 'bytes' }] as const

export function encodeBookPerpsRoute(r: BookPerpsRoute): Hex {
  if (r.pubKey !== '0x' && lighterPubKeyProblem(r.pubKey)) throw new Error(lighterPubKeyProblem(r.pubKey) ?? 'bad key')
  if (r.pubKey !== '0x' && BOOK_PERPS_REFUSED_SLOTS.includes(r.apiKeyIndex)) throw new Error('a slot Lighter keeps for its apps')
  return encodeAbiParameters(ROUTE_PARAMS, [getAddress(r.account), r.apiKeyIndex, r.pubKey])
}

export function decodeBookPerpsRoute(route: Hex): BookPerpsRoute {
  const [account, apiKeyIndex, pubKey] = decodeAbiParameters(ROUTE_PARAMS, route)
  if (encodeAbiParameters(ROUTE_PARAMS, [account, apiKeyIndex, pubKey]).toLowerCase() !== route.toLowerCase()) {
    throw new Error('not the canonical route')
  }
  return { account, apiKeyIndex, pubKey }
}

export function bookPerpsDepositSwap(adapter: Address, weth: Address, amount: bigint, route: BookPerpsRoute) {
  if (amount < LIGHTER_RH_DEPLOYMENT.collateral.minimumDeposit) throw new Error('a Lighter deposit is 1 USDG at least')
  return {
    adapter: getAddress(adapter),
    tokenIn: getAddress(LIGHTER_RH_DEPLOYMENT.collateral.token),
    tokenOut: getAddress(weth),
    amountIn: amount,
    minOut: 0n,
    route: encodeBookPerpsRoute(route),
  }
}

export const BOOK_PERPS_EIP712_NAME = 'BookPerpsAccount'
export const BOOK_PERPS_EIP712_VERSION = '1'

export const BOOK_PERPS_REDUCE_TYPES = {
  PerpsReduce: [
    { name: 'accountIndex', type: 'uint48' },
    { name: 'marketIndex', type: 'uint16' },
    { name: 'baseAmount', type: 'uint48' },
    { name: 'price', type: 'uint32' },
    { name: 'isAsk', type: 'uint8' },
    { name: 'orderType', type: 'uint8' },
    { name: 'deadline', type: 'uint256' },
    { name: 'salt', type: 'uint256' },
  ],
} as const

export const BOOK_PERPS_CALL_TYPES = {
  PerpsCall: [
    { name: 'target', type: 'address' },
    { name: 'dataHash', type: 'bytes32' },
    { name: 'deadline', type: 'uint256' },
    { name: 'salt', type: 'uint256' },
  ],
} as const

export const BOOK_PERPS_REDUCE_ORDER = { limit: 0, market: 1 } as const

export interface BookPerpsReduce {
  accountIndex: number
  marketIndex: number

  baseAmount: number

  price: number
  isAsk: 0 | 1
  orderType: 0 | 1
  deadline: bigint
  salt: bigint
}

export function bookPerpsAccountDomain(account: Address, chainId: number = LIGHTER_RH_DEPLOYMENT.chainId): TypedDataDomain {
  return { name: BOOK_PERPS_EIP712_NAME, version: BOOK_PERPS_EIP712_VERSION, chainId, verifyingContract: getAddress(account) }
}

export function hashBookPerpsReduce(account: Address, r: BookPerpsReduce, chainId?: number): Hex {
  return hashTypedData({
    domain: bookPerpsAccountDomain(account, chainId),
    types: BOOK_PERPS_REDUCE_TYPES,
    primaryType: 'PerpsReduce',
    message: r,
  })
}

export function hashBookPerpsCall(account: Address, target: Address, data: Hex, deadline: bigint, salt: bigint, chainId?: number): Hex {
  return hashTypedData({
    domain: bookPerpsAccountDomain(account, chainId),
    types: BOOK_PERPS_CALL_TYPES,
    primaryType: 'PerpsCall',
    message: { target: getAddress(target), dataHash: keccak256(data), deadline, salt },
  })
}

export interface BookPerpsAccountCall {
  address: Address
  abi: typeof BOOK_PERPS_ACCOUNT_ABI
  functionName: 'withdraw' | 'cancelAllOrders' | 'burnShares' | 'retireKey' | 'reduce' | 'claim' | 'forward'
  args: readonly unknown[]
  value: bigint
}

const accountCall = (account: Address, functionName: BookPerpsAccountCall['functionName'], args: readonly unknown[]): BookPerpsAccountCall => ({
  address: getAddress(account), abi: BOOK_PERPS_ACCOUNT_ABI, functionName, args, value: 0n,
})

const UINT64 = (1n << 64n) - 1n
const UINT48 = (1n << 48n) - 1n

function accountIndexProblem(i: number): string | null {
  return Number.isSafeInteger(i) && i > 0 && BigInt(i) <= UINT48 ? null : 'accountIndex is a Lighter account index above zero'
}

export function bookPerpsWithdrawCall(account: Address, w: { accountIndex: number; assetIndex: number; routeType: 0 | 1; baseAmount: bigint }): BookPerpsAccountCall {
  const bad = accountIndexProblem(w.accountIndex)
  if (bad) throw new Error(bad)
  if (!Number.isInteger(w.assetIndex) || w.assetIndex < 0 || w.assetIndex > 0xffff) throw new Error('assetIndex is a uint16')
  if (w.routeType !== 0 && w.routeType !== 1) throw new Error('routeType is 0 (perps) or 1 (spot)')
  if (w.baseAmount <= 0n || w.baseAmount > UINT64) throw new Error('baseAmount is a uint64 above zero')
  return accountCall(account, 'withdraw', [w.accountIndex, w.assetIndex, w.routeType, w.baseAmount])
}

export function bookPerpsCancelAllCall(account: Address, accountIndex: number): BookPerpsAccountCall {
  const bad = accountIndexProblem(accountIndex)
  if (bad) throw new Error(bad)
  return accountCall(account, 'cancelAllOrders', [accountIndex])
}

export function bookPerpsRetireKeyCall(account: Address, apiKeyIndex: number): BookPerpsAccountCall {
  if (!Number.isInteger(apiKeyIndex) || apiKeyIndex < 0 || apiKeyIndex > 254) throw new Error('apiKeyIndex is a Lighter key slot (0 to 254)')
  return accountCall(account, 'retireKey', [apiKeyIndex])
}

export function bookPerpsClaimCall(account: Address, assetIndex: number): BookPerpsAccountCall {
  if (!Number.isInteger(assetIndex) || assetIndex < 0 || assetIndex > 0xffff) throw new Error('assetIndex is a uint16')
  return accountCall(account, 'claim', [assetIndex])
}

export function bookPerpsForwardCall(account: Address, token: Address): BookPerpsAccountCall {
  return accountCall(account, 'forward', [getAddress(token)])
}

export function bookPerpsReduceCall(account: Address, r: BookPerpsReduce, sigs: { mancerSig?: Hex; traderSigs?: readonly Hex[] } = {}): BookPerpsAccountCall {
  const bad = accountIndexProblem(r.accountIndex)
  if (bad) throw new Error(bad)
  if (r.isAsk !== 0 && r.isAsk !== 1) throw new Error('isAsk is 0 or 1')
  if (r.orderType !== BOOK_PERPS_REDUCE_ORDER.limit && r.orderType !== BOOK_PERPS_REDUCE_ORDER.market) throw new Error('orderType is 0 (limit) or 1 (market)')
  return accountCall(account, 'reduce', [
    r.accountIndex, r.marketIndex, r.baseAmount, r.price, r.isAsk, r.orderType, r.deadline, r.salt, sigs.mancerSig ?? '0x', [...(sigs.traderSigs ?? [])],
  ])
}

export function bookPerpsRouteMismatch(route: Hex, e: { account: Address; key: { slot: number; pubKey: Hex } | null }): string | null {
  let r: BookPerpsRoute
  try {
    r = decodeBookPerpsRoute(route)
  } catch {
    return 'the route is not a perps deposit’s canonical route'
  }
  if (r.account.toLowerCase() !== e.account.toLowerCase()) return 'the route names another account than the vault’s own'
  if (e.key === null) return r.pubKey === '0x' ? null : 'the route carries a key where none was asked'
  if (r.pubKey.toLowerCase() !== e.key.pubKey.toLowerCase()) return 'the route carries another key than the one named'
  if (r.apiKeyIndex !== e.key.slot) return 'the route names another key slot'
  if (BOOK_PERPS_REFUSED_SLOTS.includes(r.apiKeyIndex)) return 'the route names a slot Lighter keeps for its apps'
  return lighterPubKeyProblem(r.pubKey)
}
