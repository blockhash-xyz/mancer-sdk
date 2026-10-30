// SPDX-License-Identifier: MIT
// Part of Mancer's contracts kit as the SDK uses it, mirrored with the rest of this repository at each release.
import { decodeAbiParameters, decodeFunctionData, encodeFunctionData, getAddress, parseAbi, toFunctionSelector, zeroAddress, type Abi, type Address, type Hex } from 'viem'
import {
  infinityClAdapterAbi,
  liveAmountAdapterAbi,
  mancerRouterAbi,
  metricPropAdapterAbi,
  ponsV2AdapterAbi,
  safeLaunchV2AdapterAbi,
  swapRouter02Abi,
  tesseraAdapterAbi,
  universalRouterAbi,
  up33ClAdapterAbi,
  up33ClRouterAbi,
  up33RouterAbi,
  v2PairAdapterAbi,
  v4PoolManagerAdapterAbi,
} from './abi'

export type LegDialect =
  | 'swap-router-02'
  | 'uniswap-v2-router02'
  | 'original-v3'
  | 'slipstream'
  | 'algebra-deployer'
  | 'algebra'
  | 'abyss'
  | 'liquidity-book'
  | 'up33-amm'
  | 'universal-router'
  | 'civ-game'
  | 'live-amount'
  | 'integrator-fee'
  | 'adapter'

export interface LegTarget {
  target: Address

  venue: string
  dialect: LegDialect

  selectors: readonly Hex[]
}

const ORIGINAL_V3_ABI = parseAbi([
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)',
])
const ALGEBRA_DEPLOYER_ABI = parseAbi([
  'function exactInputSingle((address tokenIn, address tokenOut, address deployer, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 limitSqrtPrice) params) payable returns (uint256 amountOut)',
])
const ALGEBRA_ABI = parseAbi([
  'function exactInputSingle((address tokenIn, address tokenOut, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 limitSqrtPrice) params) payable returns (uint256 amountOut)',
])
const ABYSS_ABI = parseAbi([
  'function exactInputSingle((address token0, address token1, uint8 profile, uint24 fee, bool quoteIsToken0, bytes32 oracleConfigId) key, address recipient, bool zeroForOne, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96, uint256 deadline) returns (uint256 amountOut)',
])
const LIQUIDITY_BOOK_ABI = parseAbi([
  'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, (uint256[] pairBinSteps, uint8[] versions, address[] tokenPath) path, address to, uint256 deadline) returns (uint256 amountOut)',
])
const UNISWAP_V2_ROUTER02_ABI = parseAbi([
  'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)',
  'function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline)',
])
const CIV_GAME_ABI = parseAbi([
  'function buyExactIn(bytes32 factionId,uint256 quoteIn,uint256 minTokenOut,address to) returns(uint256 tokenOut)',
  'function sellExactIn(bytes32 factionId,uint256 tokenIn,uint256 minQuoteOut,address to) returns(uint256 quoteOut)',
])
export const MANCER_INTEGRATOR_FEE_ABI = parseAbi(['function pay(address token, address recipient, uint16 bps, bool native) returns (uint256)'])
const DIRECT_POOL_EXECUTOR_ABI = parseAbi(['function swap(bytes route)'])

const DIALECT_ABI: Record<Exclude<LegDialect, 'adapter'>, Abi> = {
  'swap-router-02': swapRouter02Abi,
  'uniswap-v2-router02': UNISWAP_V2_ROUTER02_ABI,
  'original-v3': ORIGINAL_V3_ABI,
  slipstream: up33ClRouterAbi,
  'algebra-deployer': ALGEBRA_DEPLOYER_ABI,
  algebra: ALGEBRA_ABI,
  abyss: ABYSS_ABI,
  'liquidity-book': LIQUIDITY_BOOK_ABI,
  'up33-amm': up33RouterAbi,
  'universal-router': universalRouterAbi,
  'civ-game': CIV_GAME_ABI,
  'live-amount': liveAmountAdapterAbi,
  'integrator-fee': MANCER_INTEGRATOR_FEE_ABI,
}

const ADAPTER_ABI: Record<string, Abi> = {
  'v4-pool-manager-adapter': v4PoolManagerAdapterAbi,
  'infinity-cl-adapter': infinityClAdapterAbi,
  'prop-adapter': metricPropAdapterAbi,
  'maker-adapter': tesseraAdapterAbi,
  'up33-cl-adapter': up33ClAdapterAbi,
  'v2-pair-adapter': v2PairAdapterAbi,
  'direct-pool-executor': DIRECT_POOL_EXECUTOR_ABI,
  'pons-v2-adapter': ponsV2AdapterAbi,
  'safe-launch-adapter': safeLaunchV2AdapterAbi,
}

const t = (target: string, venue: string, dialect: LegDialect, selectors: string[]): LegTarget => ({
  target: getAddress(target), venue, dialect, selectors: selectors.map((s) => s.toLowerCase() as Hex),
})
const SR02 = ['0x04e45aaf', '0xb858183f', '0x472b43f3', '0xac9650d8']
const SAFE_LAUNCH = ['0x706910ff', '0xb233e056']

export const MANCER_ROUTER_LEG_TARGETS: Record<number, readonly LegTarget[] | undefined> = {
  4663: [
    t('0xcaf681a66d020601342297493863e78c959e5cb2', 'uniswap-v3', 'swap-router-02', SR02),
    t('0x13f4ea83d0bd40e75c8222255bc855a974568dd4', 'pancakeswap-v3', 'swap-router-02', ['0x04e45aaf', '0x472b43f3']),
    t('0x57a148316b58c6a20d748a8581cd416ed7dbe82d', 'giga-v3', 'swap-router-02', ['0x04e45aaf']),
    t('0x89e5db8b5aa49aa85ac63f691524311aeb649eba', 'uniswap-v2-router02', 'uniswap-v2-router02', ['0x38ed1739', '0x5c11d795']),
    t('0x1e406484f1f204b23ce84b9901c0171a738fd406', 'sushiswap-v3', 'original-v3', ['0x414bf389']),
    t('0x52909af724a7db5c8312ef7ba120bd42404a6978', 'swaphood-v3', 'original-v3', ['0x414bf389']),
    t('0x44e613593d7cc00164d790f2636ac2e2ed7dd292', 'parity', 'original-v3', ['0x414bf389']),
    t('0x83727d2d07c8dcb83bce151e4b2c30986dbf5874', 'cefc5da4-v3', 'original-v3', ['0x414bf389']),
    t('0x7bef1e8c941310b457fea16f860e42dbf62ec9be', 'ea561e05-v3', 'original-v3', ['0x414bf389']),
    t('0x7a8dd63026162663839abbcd2e788cd0785fd036', 'ouro-v3', 'original-v3', ['0x414bf389']),
    t('0x59b9cff4a6367d8f54916a3ef4270b61c56c2569', 'rubicon-clmm', 'original-v3', ['0x414bf389']),
    t('0x16e5ec75431accb65bfcc7aeffc1d2aeb44069b0', 'goo-v3', 'original-v3', ['0x414bf389']),
    t('0xfcbbe2af83f94e7e2a9c35a535b3a04719afd2ae', 'ramses-v3', 'slipstream', ['0xa026383e']),
    t('0xb17125089bcaef75f7c06d4b578ec624982cb2a8', 'raphael-cl', 'slipstream', ['0xa026383e']),
    t('0x2e7395a6e0de6ee1f390bece891069cd18ff8572', 'topaz-cl', 'slipstream', ['0xa026383e']),
    t('0x9ee35bf1bd69a03c6f0393582030fce8bb93d418', 'slipstream-c63d7338', 'slipstream', ['0xa026383e']),
    t('0xcb0615a1478838dea20e57447309be97f45dca0f', 'sheriff', 'algebra-deployer', ['0x1679c792']),
    t('0x7064c7bb85979f008212877c4ce41285ddf5374c', 'kittenswap', 'algebra-deployer', ['0x1679c792']),
    t('0x03f8b4b140249dc7b2503c928e7258cce1d91f1a', 'algebra-10253594', 'algebra-deployer', ['0x1679c792']),
    t('0x8971d5a8f950f021e97583855925b021bfae2b35', 'alandale', 'algebra', ['0xbc651188']),
    t('0xf2a3afb36768950eb2c7f04583328c09aec0c366', 'abyss', 'abyss', ['0xc86c0dd7']),
    t('0xd0019e86edb35e1fedaab03aed5c3c60f115d28b', 'ramses-dlmm', 'liquidity-book', ['0x2a443fae']),
    t('0xb3eae1211bb42ac20c915ad80038454d9f840fac', 'sectorone-lb', 'liquidity-book', ['0x2a443fae']),
    t('0xf5198743240fac98db71868f34c70139b1eb0474', 'up33-amm', 'up33-amm', ['0xcac88ea9']),
    t('0x8876789976decbfcbbbe364623c63652db8c0904', 'uniswap-v4', 'universal-router', ['0x3593564c']),
    t('0xfa7fbf829889eb811e467b1433ab692cb6a5d5b4', 'civ-game', 'civ-game', ['0xe38b0285', '0xf2bda48b']),
    t('0xec5100c67fb12368abf74a6020e21b545a5da93c', 'live-amount-adapter', 'live-amount', ['0x25c12151']),
    t('0x2542ed17313b265eb2658c2ac101e8855c4c3d22', 'integrator-fee', 'integrator-fee', ['0x8d02e9a1']),
    t('0xad64899f8b144d0b6614a9fd4c370db6ae6bf91b', 'v4-pool-manager-adapter', 'adapter', ['0xac9d4104', '0x2b42c847']),
    t('0x56ad09f5226873c660abaf2ace83279eb145234f', 'v4-pool-manager-adapter', 'adapter', ['0xac9d4104', '0x2b42c847']),
    t('0xf6b899f3b0182be923507b323c408aebc062278f', 'infinity-cl-adapter', 'adapter', ['0x1d6b7a42', '0x6716cd97']),
    t('0x476d6c45a5a2837994c0f8fb8d5d81e5dbedf56b', 'infinity-cl-adapter', 'adapter', ['0x1d6b7a42', '0x6716cd97']),
    t('0x0bb42ec950d8b19963fe3ba27fcdc56d70f24dc9', 'prop-adapter', 'adapter', ['0xa9fbdb27']),
    t('0x05df9c422b2ff3f78ae070f634af2275aaec0156', 'prop-adapter', 'adapter', ['0xa9fbdb27']),
    t('0x9a131f3b0d4fa0995dd579c01a12a33c09979824', 'prop-adapter', 'adapter', ['0xa9fbdb27']),
    t('0x623690dfaddb77050e57b1cef158326b5fe20041', 'maker-adapter', 'adapter', ['0x56390c7f']),
    t('0xa952e63b2c83dcc72d371cefa94ebd795aafa616', 'maker-adapter', 'adapter', ['0x56390c7f']),
    t('0x71ef50456ece598008f66b569baa8f90ba1cbaa1', 'up33-cl-adapter', 'adapter', ['0x2136c0f7']),
    t('0xc695146b88cf89721a5975bd295f303249d89ad7', 'v2-pair-adapter', 'adapter', ['0xfe029156']),
    t('0xa997232f4607a6fc3d512a3dfae567384ac26b8c', 'direct-pool-executor', 'adapter', ['0x627dd56a']),
    t('0x32bbb7e6c6ecfb4fa1944774842287319dfcfcd8', 'pons-v2-adapter', 'adapter', ['0xa9d424e2', '0x31de7d15']),
    ...[
      '0x4b394e1bd42b0bb97edf756c586a587d9277a3a8', '0x90c1fb360f7f915da407696cd71a9a6d71b65836', '0x17d9b970737671e3e349f40a1f911f89f56447ac',
      '0x27e384e7a1332fc158c25137c6414d911ba5ed8d', '0xac95c283fc6a8f29ccd8f31b0ae8c6990b8efd47', '0x151242a10ffbf40ea8aebc46bf2eed43050e311b',
      '0x26c6ebbfef6325587f9611e8a60b1c8e7d0eb83b', '0x3ae5997c9421f8bea28b4b63e34ef1b2ba633a24', '0x7438c6c725a394b31e725b8d513b41c79265979f',
      '0xe2f07b65a845fac4432ac9248166a4cce3014336', '0x169704629293161638f927d75088ad349c8b2fbc', '0x127bcabc4f5b69b1a3ce0c7c15d6c06eae63fdcb',
      '0x6584ee499077bb00f0cbbba195c9650141b17ffd', '0x4d83e4191f5cedc9d7f98150933e013219f51350', '0xe8fc56cee7fc45e2d4649879ae3cdc5eb66418fd',
      '0x1fc30ec413595ac8dcf86f9ecff468a46273f7a5', '0xa2bcb57bbd0740397a3748577be490a223bfa714', '0x1f86f85fcf2473af77fda4781263dbf155a5c9a7',
    ].map((a) => t(a, 'safe-launch-adapter', 'adapter', SAFE_LAUNCH)),
  ],
  46630: undefined,
}

export const ROUTER_WILDCARD_TARGETS: Record<number, Readonly<Record<string, string>> | undefined> = {
  4663: {
    '0x6131b5fae19ea4f9d964eac0408e4408b66337b5': "KyberSwap's router",
    '0x6352a56caadc4f1e25cd6c75970fa768a3304e64': "OpenOcean's exchange",
    '0xcfbaa9cfce952ca4f4069874ff1df8c05e37a3c7': "Enso's router",
  },
  46630: undefined,
}

export function legTargetAbi(lt: LegTarget): Abi {
  if (lt.dialect !== 'adapter') return DIALECT_ABI[lt.dialect]
  const abi = ADAPTER_ABI[lt.venue]
  if (!abi) throw new Error(`the kit names no ABI for the adapter ${lt.venue}`)
  return abi
}

export function legTargetOf(chainId: number, target: string): LegTarget | null {
  const k = target.toLowerCase()
  return MANCER_ROUTER_LEG_TARGETS[chainId]?.find((x) => x.target.toLowerCase() === k) ?? null
}

export interface LegReading {
  target: Address
  selector: Hex
  venue: string
  dialect: LegDialect

  recipients: Address[]

  fee?: { token: Address; recipient: Address; bps: number }

  inner?: LegReading
}

export interface LegExpectation {

  runner: Address

  caller: Address

  integratorFee?: { recipient: Address; bps: number } | null
  chainId?: number
}

export const ROUTER_MSG_SENDER = '0x0000000000000000000000000000000000000001' as Address
export const ROUTER_ADDRESS_THIS = '0x0000000000000000000000000000000000000002' as Address

class LegRefused extends Error {}
const refuse = (why: string): never => {
  throw new LegRefused(why)
}
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
const NATIVE = zeroAddress
const WETH = '0x0bd7d308f8e1639fab988df18a8011f41eacad73'

const wrapped = (t: string) => (same(t, NATIVE) ? WETH : t.toLowerCase())

export const MANCER_ROUTER_LEG_TABLE_BLOCK = 101_910_000n

function decodeBy(abi: Abi, data: Hex, what: string): { functionName: string; args: readonly unknown[] } {
  try {
    const d = decodeFunctionData({ abi, data }) as { functionName: string; args?: readonly unknown[] }
    return { functionName: d.functionName, args: d.args ?? [] }
  } catch {
    return refuse(`${what}'s payload is not a call it takes`)
  }
}

interface LegContext {
  tokenIn: string
  tokenOut: string
  fund: number

  amountIn: bigint

  adapter: Address | null
}

const READS_SENTINELS = new Set<LegDialect>(['swap-router-02', 'universal-router'])

function plainRecipient(dialect: LegDialect, r: Address, e: LegExpectation, ctx: LegContext): boolean {
  if (same(r, e.runner) || same(r, e.caller)) return true
  if (READS_SENTINELS.has(dialect) && same(r, ROUTER_MSG_SENDER)) return true
  return !!ctx.adapter && same(r, ctx.adapter)
}

function swapTokens(dialect: LegDialect, venue: string, functionName: string, args: readonly unknown[]): { in: string; out: string } | null {
  const first = args[0] as Record<string, unknown> | undefined
  const path = (p: readonly string[]) => (p.length >= 2 ? { in: p[0]!, out: p[p.length - 1]! } : refuse(`a ${venue} leg's path names fewer than two tokens`))
  const pair = (key: Record<string, unknown>, zeroForOne: boolean) => (zeroForOne ? { in: key.currency0 as string, out: key.currency1 as string } : { in: key.currency1 as string, out: key.currency0 as string })
  switch (dialect) {
    case 'swap-router-02':
    case 'original-v3':
    case 'slipstream':
    case 'algebra-deployer':
    case 'algebra':
      if (functionName === 'exactInputSingle') return { in: first!.tokenIn as string, out: first!.tokenOut as string }
      if (functionName === 'exactInput') {
        const p = (first!.path as string).slice(2)
        if (p.length < 86 || (p.length - 40) % 46 !== 0) refuse(`a ${venue} leg's path does not read`)
        return { in: `0x${p.slice(0, 40)}`, out: `0x${p.slice(-40)}` }
      }
      if (functionName === 'swapExactTokensForTokens') return path(args[2] as readonly string[])
      return null
    case 'uniswap-v2-router02':
      return path(args[2] as readonly string[])
    case 'liquidity-book':
      return path((args[2] as { tokenPath: readonly string[] }).tokenPath)
    case 'up33-amm': {
      const routes = args[2] as readonly { from: string; to: string }[]
      if (!routes.length) refuse(`a ${venue} leg names no route`)
      return { in: routes[0]!.from, out: routes[routes.length - 1]!.to }
    }
    case 'abyss': {
      const key = first as { token0: string; token1: string }
      return args[2] ? { in: key.token0, out: key.token1 } : { in: key.token1, out: key.token0 }
    }
    case 'adapter':
      switch (venue) {
        case 'prop-adapter': return { in: args[1] as string, out: args[2] as string }
        case 'maker-adapter':
        case 'up33-cl-adapter':
        case 'v2-pair-adapter': return { in: args[0] as string, out: args[1] as string }
        case 'v4-pool-manager-adapter':
        case 'infinity-cl-adapter':
          if (functionName === 'swapExactInputSingle') return pair(first!, args[1] as boolean)
          return { in: pair(first!.keyA as Record<string, unknown>, first!.zeroForOneA as boolean).in, out: pair(first!.keyB as Record<string, unknown>, first!.zeroForOneB as boolean).out }
        case 'pons-v2-adapter':
        case 'safe-launch-adapter':

          return functionName === 'buy' ? { in: '', out: args[1] as string } : { in: args[1] as string, out: '' }
        default:
          return null
      }
    default:
      return null
  }
}

function swapRecipient(dialect: LegDialect, functionName: string, args: readonly unknown[]): Address | null {
  const first = args[0] as Record<string, unknown> | undefined
  switch (dialect) {
    case 'swap-router-02':
    case 'original-v3':
    case 'slipstream':
    case 'algebra-deployer':
    case 'algebra':
      if (functionName === 'exactInputSingle' || functionName === 'exactInput') return first!.recipient as Address
      if (functionName === 'swapExactTokensForTokens') return args[3] as Address
      return null
    case 'abyss':
      return args[1] as Address
    case 'uniswap-v2-router02':
    case 'liquidity-book':
    case 'up33-amm':
    case 'civ-game':
      return args[3] as Address
    default:
      return null
  }
}

function tokensAreTheLegs(venue: string, t: { in: string; out: string } | null, ctx: LegContext): void {
  if (!t) return
  if (t.in && wrapped(t.in) !== wrapped(ctx.tokenIn)) refuse(`a ${venue} leg spends ${t.in}, and the leg names ${ctx.tokenIn}`)
  if (t.out && wrapped(t.out) !== wrapped(ctx.tokenOut)) refuse(`a ${venue} leg pays ${t.out}, and the leg names ${ctx.tokenOut}`)
}

function readSwapRouter02(lt: LegTarget, abi: Abi, functionName: string, args: readonly unknown[], e: LegExpectation, ctx: LegContext, reading: LegReading): void {
  const parked = new Set<string>()
  if (ctx.fund === 1) parked.add(wrapped(ctx.tokenIn))
  const calls: Array<{ functionName: string; args: readonly unknown[] }> = []
  if (functionName === 'multicall') {
    for (const c of args[0] as readonly Hex[]) {
      const inner = decodeBy(abi, c, lt.venue)
      if (inner.functionName === 'multicall') refuse('a multicall nests another')
      calls.push(inner)
    }
  } else {
    calls.push({ functionName, args })
  }
  let swaps = 0
  for (const c of calls) {
    if (c.functionName === 'wrapETH') {
      parked.add(WETH)
      continue
    }
    if (c.functionName === 'unwrapWETH9') {
      const r = c.args[1] as Address
      if (!plainRecipient(lt.dialect, r, e, ctx)) refuse(`a ${lt.venue} leg unwraps to ${r}, neither the router nor the caller`)
      parked.delete(WETH)
      reading.recipients.push(r)
      continue
    }
    const t = swapTokens(lt.dialect, lt.venue, c.functionName, c.args)
    const r = swapRecipient(lt.dialect, c.functionName, c.args)
    if (!t || !r) return refuse(`${c.functionName} is no swap call`)
    swaps += 1
    const amountIn = c.functionName === 'swapExactTokensForTokens' ? (c.args[0] as bigint) : ((c.args[0] as { amountIn: bigint }).amountIn)

    if (amountIn === 0n) parked.delete(wrapped(t.in))
    else if (wrapped(t.in) !== wrapped(ctx.tokenIn)) refuse(`a ${lt.venue} leg pulls ${t.in}, and the leg names ${ctx.tokenIn}`)
    if (same(r, ROUTER_ADDRESS_THIS)) {
      parked.add(wrapped(t.out))
    } else {
      if (!plainRecipient(lt.dialect, r, e, ctx)) refuse(`a ${lt.venue} leg pays ${r}, neither the router nor the caller`)
      if (wrapped(t.out) !== wrapped(ctx.tokenOut)) refuse(`a ${lt.venue} leg pays ${t.out}, and the leg names ${ctx.tokenOut}`)
    }
    reading.recipients.push(r)
  }
  if (!swaps) refuse(`a ${lt.venue} leg swaps nothing`)
  if (parked.size) refuse(`a ${lt.venue} leg leaves ${[...parked].join(', ')} in the venue's router, where anyone may sweep it`)
}

const UR_CONTRACT_BALANCE = 1n << 255n
const V4_POOL_KEY = { type: 'tuple', components: [{ name: 'currency0', type: 'address' }, { name: 'currency1', type: 'address' }, { name: 'fee', type: 'uint24' }, { name: 'tickSpacing', type: 'int24' }, { name: 'hooks', type: 'address' }] } as const
const V4_EXACT_IN_SINGLE = [{
  type: 'tuple',
  components: [{ name: 'poolKey', ...V4_POOL_KEY }, { name: 'zeroForOne', type: 'bool' }, { name: 'amountIn', type: 'uint128' }, { name: 'amountOutMinimum', type: 'uint128' }, { name: 'minHopPriceX36', type: 'uint256' }, { name: 'hookData', type: 'bytes' }],
}] as const
const V4_EXACT_IN = [{
  type: 'tuple',
  components: [
    { name: 'currencyIn', type: 'address' },
    { name: 'path', type: 'tuple[]', components: [{ name: 'intermediateCurrency', type: 'address' }, { name: 'fee', type: 'uint24' }, { name: 'tickSpacing', type: 'int24' }, { name: 'hooks', type: 'address' }, { name: 'hookData', type: 'bytes' }] },
    { name: 'minHopPriceX36', type: 'uint256[]' },
    { name: 'amountIn', type: 'uint128' },
    { name: 'amountOutMinimum', type: 'uint128' },
  ],
}] as const

function v4SwapInput(action: number, p: Hex): { currency: string; amountIn: bigint } | null {
  try {
    if (action === 0x06) {
      const [s] = decodeAbiParameters(V4_EXACT_IN_SINGLE, p) as unknown as [{ poolKey: { currency0: string; currency1: string }; zeroForOne: boolean; amountIn: bigint }]
      return { currency: (s.zeroForOne ? s.poolKey.currency0 : s.poolKey.currency1).toLowerCase(), amountIn: s.amountIn }
    }
    const [s] = decodeAbiParameters(V4_EXACT_IN, p) as unknown as [{ currencyIn: string; amountIn: bigint }]
    return { currency: s.currencyIn.toLowerCase(), amountIn: s.amountIn }
  } catch {
    return null
  }
}

function readUniversalRouter(args: readonly unknown[], e: LegExpectation, ctx: LegContext, reading: LegReading): void {
  const [commands, inputs] = args as [Hex, readonly Hex[]]
  const bytes = commands.slice(2).match(/../g) ?? []
  if (bytes.length !== inputs.length) refuse("the Universal Router's commands and inputs do not pair")
  if (!bytes.length) refuse('a Universal Router leg runs no command')

  const parked = new Map<string, bigint | null>()
  const rest = (currency: string, amount: bigint | null) => {
    const c = currency.toLowerCase()
    const had = parked.get(c)
    parked.set(c, had === undefined ? amount : had === null || amount === null ? null : had + amount)
  }

  const spend = (currency: string, amount: bigint | null): bigint | null => {
    const c = currency.toLowerCase()
    if (!parked.has(c)) return amount === UR_CONTRACT_BALANCE ? null : amount
    const had = parked.get(c)!
    if (amount === UR_CONTRACT_BALANCE || (amount !== null && had !== null && amount === had)) {
      parked.delete(c)
      return had
    }
    if (amount !== null && had !== null && amount < had) parked.set(c, had - amount)
    return amount
  }
  if (ctx.fund === 1) rest(ctx.tokenIn, ctx.amountIn > 0n ? ctx.amountIn : null)
  const word = (v: Hex, types: readonly { type: string }[]) => decodeAbiParameters(types, v) as readonly unknown[]
  const pays = (currency: string, r: Address) => {
    if (!plainRecipient('universal-router', r, e, ctx)) refuse(`a Universal Router leg pays ${r}, neither the router nor the caller`)
    const c = wrapped(currency)
    if (c !== wrapped(ctx.tokenOut) && c !== wrapped(ctx.tokenIn)) refuse(`a Universal Router leg pays ${currency}, which the leg names neither as its input nor its output`)
    reading.recipients.push(r)
  }
  let swaps = 0
  bytes.forEach((b, i) => {
    const command = parseInt(b, 16)
    if (command & 0xc0) refuse('a Universal Router command allows a revert or names a reserved flag')
    const input = inputs[i]!
    try {
      switch (command) {
        case 0x04: {
          const [token, recipient] = word(input, [{ type: 'address' }, { type: 'address' }, { type: 'uint256' }]) as [Address, Address]
          parked.delete(token.toLowerCase())
          pays(token, recipient)
          return
        }
        case 0x0b: {
          const [recipient, amount] = word(input, [{ type: 'address' }, { type: 'uint256' }]) as [Address, bigint]
          const wrappedAmount = spend(NATIVE, amount)
          if (same(recipient, ROUTER_ADDRESS_THIS)) rest(WETH, wrappedAmount)
          else pays(WETH, recipient)
          return
        }
        case 0x0c: {
          const [recipient] = word(input, [{ type: 'address' }, { type: 'uint256' }]) as [Address]
          const had = parked.has(WETH) ? parked.get(WETH)! : null
          parked.delete(WETH)
          if (same(recipient, ROUTER_ADDRESS_THIS)) rest(NATIVE, had)
          else pays(NATIVE, recipient)
          return
        }
        case 0x10: {
          const [actions, params] = word(input, [{ type: 'bytes' }, { type: 'bytes[]' }]) as [Hex, readonly Hex[]]
          const acts = actions.slice(2).match(/../g) ?? []
          if (acts.length !== params.length) refuse("a V4 swap's actions and params do not pair")

          let nativeDebt: bigint | null = 0n
          acts.forEach((a, j) => {
            const action = parseInt(a, 16)
            if (action !== 0x06 && action !== 0x07) return
            const s = v4SwapInput(action, params[j]!)
            if (!s) nativeDebt = null
            else if (s.currency === NATIVE) nativeDebt = nativeDebt === null || s.amountIn === 0n ? null : nativeDebt + s.amountIn
          })
          acts.forEach((a, j) => {
            const action = parseInt(a, 16)
            const p = params[j]!
            switch (action) {
              case 0x06:
              case 0x07:
                swaps += 1
                return
              case 0x0b: {
                const [currency, amount, payerIsUser] = word(p, [{ type: 'address' }, { type: 'uint256' }, { type: 'bool' }]) as [Address, bigint, boolean]

                if (!payerIsUser) spend(currency, amount === 0n ? (same(currency, NATIVE) ? nativeDebt : null) : amount)
                return
              }
              case 0x0c: {
                const [currency] = word(p, [{ type: 'address' }, { type: 'uint256' }]) as [Address]
                if (same(currency, NATIVE)) spend(NATIVE, nativeDebt)
                return
              }
              case 0x0e: {
                const [currency, recipient, amount] = word(p, [{ type: 'address' }, { type: 'address' }, { type: 'uint256' }]) as [Address, Address, bigint]
                if (same(recipient, ROUTER_ADDRESS_THIS)) rest(currency, amount === 0n ? null : amount)
                else pays(currency, recipient)
                return
              }
              case 0x0f: {
                const [currency] = word(p, [{ type: 'address' }, { type: 'uint256' }]) as [Address]
                pays(currency, ROUTER_MSG_SENDER)
                return
              }
              default:
                refuse(`a V4 swap names the action 0x${a}, which Mancer's routing does not send`)
            }
          })
          return
        }
        default:
          refuse(`the Universal Router command 0x${b} is none Mancer's routing sends`)
      }
    } catch (err) {
      if (err instanceof LegRefused) throw err
      refuse(`the Universal Router command 0x${b}'s input does not read`)
    }
  })
  if (!swaps) refuse('a Universal Router leg swaps nothing')
  if (parked.size) refuse(`a Universal Router leg leaves ${[...parked.keys()].join(', ')} in the Universal Router, where anyone may sweep it`)
}

const LIVE_AMOUNT_PROBE = 0x5a17c0ffee5a17c0ffee5a17c0ffeen
const AMOUNT_FIELDS = new Set(['amountIn', 'quoteIn', 'tokensIn'])

function amountWordOffset(abi: Abi, functionName: string, args: readonly unknown[]): number | null {
  const fn = (abi as readonly { type: string; name?: string; inputs?: readonly { name?: string; type: string; components?: readonly { name?: string; type: string }[] }[] }[])
    .find((x) => x.type === 'function' && x.name === functionName && (x.inputs?.length ?? 0) === args.length)
  if (!fn?.inputs) return null
  let at: { i: number; field: string | null } | null = null
  fn.inputs.forEach((input, i) => {
    if (at) return
    if (input.type.startsWith('uint') && (AMOUNT_FIELDS.has(input.name ?? '') || (functionName === 'sellExactIn' && input.name === 'tokenIn'))) at = { i, field: null }
    else if (input.type === 'tuple') {
      const c = input.components?.find((x) => x.type.startsWith('uint') && AMOUNT_FIELDS.has(x.name ?? ''))
      if (c) at = { i, field: c.name! }
    }
  })
  if (!at) return null
  const { i, field } = at as { i: number; field: string | null }
  const probed = args.map((a, j) => (j !== i ? a : field === null ? LIVE_AMOUNT_PROBE : { ...(a as Record<string, unknown>), [field]: LIVE_AMOUNT_PROBE }))
  const data = encodeFunctionData({ abi, functionName, args: probed } as never)
  const body = data.slice(10)
  const want = LIVE_AMOUNT_PROBE.toString(16).padStart(64, '0')
  let offset: number | null = null
  for (let k = 0; k < body.length; k += 64) {
    if (body.slice(k, k + 64) !== want) continue
    if (offset !== null) return null
    offset = 4 + k / 2
  }
  return offset
}

function readOne(chainId: number, target: Address, data: Hex, e: LegExpectation, ctx: LegContext, depth: number): LegReading {
  const wild = ROUTER_WILDCARD_TARGETS[chainId]?.[target.toLowerCase()]
  if (wild) return refuse(`a leg calls ${wild}, which the router admits by its wildcard alone: no leg of Mancer's routing`)
  const lt = legTargetOf(chainId, target)
  if (!lt) {
    return refuse(`a leg calls ${target}, which the kit's venue table (read from the router's allowlist at block ${MANCER_ROUTER_LEG_TABLE_BLOCK}) does not name: no venue or adapter of Mancer's routing it knows, or one the router admitted since`)
  }
  const selector = data.slice(0, 10).toLowerCase() as Hex
  if (!lt.selectors.includes(selector)) {
    return refuse(`a leg calls ${lt.venue} with ${selector}, which the kit's venue table (block ${MANCER_ROUTER_LEG_TABLE_BLOCK}) admits for it nowhere`)
  }
  const abi = legTargetAbi(lt)
  const { functionName, args } = decodeBy(abi, data, lt.venue)
  const reading: LegReading = { target: lt.target, selector, venue: lt.venue, dialect: lt.dialect, recipients: [] }

  if (ctx.fund === 1 && !(lt.dialect === 'swap-router-02' || lt.dialect === 'universal-router' || lt.dialect === 'adapter')) {
    refuse(`a leg hands ${lt.venue} its input by transfer, and ${lt.venue} spends no balance it holds`)
  }
  if (ctx.fund === 2 && lt.dialect !== 'universal-router') refuse(`a leg funds ${lt.venue} through Permit2, which only the Universal Router pulls through`)
  switch (lt.dialect) {
    case 'adapter':
      tokensAreTheLegs(lt.venue, swapTokens(lt.dialect, lt.venue, functionName, args), ctx)
      return reading
    case 'integrator-fee': {
      const [token, recipient, bps] = args as [Address, Address, number, boolean]
      if (ctx.fund !== 0) refuse('an integrator fee leg is funded by approval alone')
      if (!e.integratorFee) refuse('a leg pays an integrator fee nobody asked for')
      if (!same(recipient, e.integratorFee!.recipient)) refuse('an integrator fee leg pays another recipient than the one asked for')
      if (Number(bps) !== e.integratorFee!.bps) refuse('an integrator fee leg pays another rate than the one asked for')
      reading.recipients = [recipient]
      reading.fee = { token, recipient, bps: Number(bps) }
      return reading
    }
    case 'live-amount': {
      if (depth > 0) refuse('a LiveAmountAdapter call nests another')
      if (ctx.fund !== 0) refuse('a LiveAmountAdapter leg is funded by approval alone')
      const [innerTarget, innerData, amountOffset, tokenIn, tokenOut] = args as [Address, Hex, bigint, Address, Address]

      if (!same(tokenIn, ctx.tokenIn) || !same(tokenOut, ctx.tokenOut)) refuse("a LiveAmountAdapter call names other tokens than its leg's")
      const innerLt = legTargetOf(chainId, innerTarget)
      if (!innerLt || innerLt.dialect === 'live-amount' || innerLt.dialect === 'integrator-fee') refuse('a LiveAmountAdapter call enters no venue')
      const innerCtx: LegContext = { tokenIn, tokenOut, fund: 0, amountIn: 0n, adapter: lt.target }
      const inner = readOne(chainId, innerTarget, innerData, e, innerCtx, depth + 1)
      const innerCall = decodeBy(legTargetAbi(innerLt!), innerData, innerLt!.venue)
      const t = swapTokens(innerLt!.dialect, innerLt!.venue, innerCall.functionName, innerCall.args)
      if (!t || !t.in || !t.out) refuse(`a LiveAmountAdapter call's venue (${innerLt!.venue}) names no output it can be held to`)

      const want = amountWordOffset(legTargetAbi(innerLt!), innerCall.functionName, innerCall.args)
      if (want === null || BigInt(want) !== amountOffset) refuse(`a LiveAmountAdapter call writes its amount at byte ${amountOffset}, and ${innerLt!.venue}'s call carries its amount at ${want ?? 'no one word'}`)
      reading.inner = inner
      reading.recipients = inner.recipients
      return reading
    }
    case 'universal-router':
      readUniversalRouter(args, e, ctx, reading)
      return reading
    case 'swap-router-02':
      readSwapRouter02(lt, abi, functionName, args, e, ctx, reading)
      return reading
    default: {
      const r = swapRecipient(lt.dialect, functionName, args)
      if (!r) return refuse(`${functionName} is no swap call`)
      if (!plainRecipient(lt.dialect, r, e, ctx)) refuse(`a ${lt.venue} leg pays ${r}, neither the router nor the caller`)
      tokensAreTheLegs(lt.venue, swapTokens(lt.dialect, lt.venue, functionName, args), ctx)
      reading.recipients = [r]
      return reading
    }
  }
}

export function readRouterLegs(data: Hex, e: LegExpectation): { legs: LegReading[]; mismatch: string | null } {
  const chainId = e.chainId ?? 4663
  let decoded: { functionName: string; args?: readonly unknown[] }
  try {
    decoded = decodeFunctionData({ abi: mancerRouterAbi, data }) as typeof decoded
  } catch {
    return { legs: [], mismatch: 'calldata is not a Mancer router call' }
  }
  const p = (decoded.args ?? [])[0] as Record<string, unknown>
  type Call = { target: Address; payload: Hex; tokenIn: string; tokenOut: string; fund: number; amountIn?: bigint }
  const calls: Call[] =
    decoded.functionName === 'execute'
      ? (p.legs as readonly { target: Address; payload: Hex; tokenIn: Address; tokenOut: Address; amountIn: bigint; fund: number }[]).map((l) => ({ target: l.target, payload: l.payload, tokenIn: l.tokenIn, tokenOut: l.tokenOut, fund: Number(l.fund), amountIn: l.amountIn }))
      : decoded.functionName === 'swap'
        ? [{ target: p.target as Address, payload: p.payload as Hex, tokenIn: p.tokenIn as string, tokenOut: p.tokenOut as string, fund: 0 }]
        : decoded.functionName === 'swapVia'
          ? [
              { target: p.targetA as Address, payload: p.payloadA as Hex, tokenIn: p.tokenIn as string, tokenOut: p.cash as string, fund: 0 },
              { target: p.targetB as Address, payload: p.payloadB as Hex, tokenIn: p.cash as string, tokenOut: p.tokenOut as string, fund: 0 },
            ]
          : []
  if (!calls.length) return { legs: [], mismatch: 'calldata is not a swap' }
  const legs: LegReading[] = []
  let fees = 0
  for (const [i, c] of calls.entries()) {
    if (![0, 1, 2].includes(c.fund)) return { legs, mismatch: `leg ${i} names a funding mode the router has none of` }
    if (same(c.target, zeroAddress)) return { legs, mismatch: `leg ${i} calls no contract` }
    try {
      const leg = readOne(chainId, getAddress(c.target), c.payload, e, { tokenIn: wrapped(c.tokenIn ?? ''), tokenOut: wrapped(c.tokenOut ?? ''), fund: c.fund, amountIn: c.amountIn ?? 0n, adapter: null }, 0)
      if (leg.fee) fees += 1
      legs.push(leg)
    } catch (err) {
      if (err instanceof LegRefused) return { legs, mismatch: `leg ${i}: ${err.message}` }
      throw err
    }
  }
  if (fees > 1) return { legs, mismatch: 'the plan pays more than one integrator fee' }
  if (e.integratorFee && fees === 0) return { legs, mismatch: 'the plan pays no integrator fee, where one was asked for' }
  return { legs, mismatch: null }
}

export function routerLegsMismatch(data: Hex, e: LegExpectation): string | null {
  return readRouterLegs(data, e).mismatch
}

export function dialectSelectors(lt: LegTarget): Hex[] {
  return (legTargetAbi(lt) as readonly { type: string }[]).filter((x) => x.type === 'function').map((x) => toFunctionSelector(x as never).toLowerCase() as Hex)
}
