// SPDX-License-Identifier: MIT
// Part of Mancer's contracts kit as the SDK uses it, mirrored with the rest of this repository at each release.
import { zeroAddress, type Abi, type Address, type Hex } from 'viem'
import type { CodePinnedAddress } from '../launch-deployments'
import { BOOK_ABIS } from './abis'

export type CodePinned = CodePinnedAddress

export type BookAbiSet = 'books' | 'books-4e07ea0' | 'books-e8d92ea'

export interface BookAbiRules {

  pad: 'gen3' | 'claims'

  settlement: 'weth' | 'chosen'
}

export const BOOK_ABI_RULES: Readonly<Record<BookAbiSet, BookAbiRules>> = {
  books: { pad: 'gen3', settlement: 'weth' },
  'books-4e07ea0': { pad: 'claims', settlement: 'weth' },
  'books-e8d92ea': { pad: 'claims', settlement: 'chosen' },
}

export const BOOK_VAULT_DOMAIN_NAME_GEN3 = 'TOKENIZE.FUN'

export function bookVaultDomainName(d: Pick<BookDeployment, 'expected'>): string {
  return d.expected.vaultDomainName ?? BOOK_VAULT_DOMAIN_NAME_GEN3
}

export function bookVaultDomainNames(deployments: readonly Pick<BookDeployment, 'expected'>[] = BOOK_DEPLOYMENTS): string[] {
  return [...new Set(deployments.map((d) => bookVaultDomainName(d)))]
}

export function bookPadKind(d: Pick<BookDeployment, 'abiSet'>): BookAbiRules['pad'] {
  return BOOK_ABI_RULES[d.abiSet].pad
}

export function bookSettlesInChosenAsset(d: Pick<BookDeployment, 'abiSet'>): boolean {
  return BOOK_ABI_RULES[d.abiSet].settlement === 'chosen'
}

export const BOOK_SETTLE_SWITCH_MARGIN_SECS = 300n

export function bookSettleSwitchClosed(unlockAt: bigint, nowSec: bigint): boolean {
  return unlockAt !== 0n && nowSec + BOOK_SETTLE_SWITCH_MARGIN_SECS >= unlockAt
}

export type BookAccess = 'public' | 'beta'

export interface BookDeployment {

  factory: CodePinned

  label: string
  abiSet: BookAbiSet

  access: BookAccess
  chainId: 4663

  deployBlock: bigint

  opensNewBooks: boolean
  pad: CodePinned
  settler: CodePinned
  lpFees: CodePinned

  locker: CodePinned

  lockerV4?: CodePinned
  operatorNft: CodePinned
  accountImplementation: CodePinned

  vaultCloneCodeHash: Hex

  bookTokenCodeHash: Hex
  adapters: { uniswap: CodePinned; mancer?: CodePinned }

  bookAnvilFactory?: CodePinned

  padRegistry?: CodePinned

  stonkPerpsAdapter?: CodePinned

  orderSpenders: Address[]
  expected: BookExpected

  mancerSignerSlot?: Hex
  constants: BookConstants

  displayNames: Record<string, string>
}

export interface BookListedQuote {
  token: Address
  symbol: string
  decimals: number

  usdFeed: Address

  maxAgeSecs: number

  feed?: BookQuoteFeedPin
}

export interface BookQuoteFeedPin {
  address: Address
  runtimeCodeHash: Hex

  pool: Address

  maxAgeSecs: number
}

export interface BookExpected {

  adapterRouter?: Address
  adapterAllowanceTarget?: Address
  adapterTestMode?: false

  uniswapAdapterRouter: Address
  uniswapAdapterDefaultFee: number
  uniswapAdapterTestMode: false
  settlerWeth: Address

  settlerMancerFeeTo?: Address
  settlerProtocolTreasury?: Address
  padWeth: Address
  padLocker: Address
  padEthUsdFeed: Address
  padTreasury: Address
  padStockBooster: Address
  factoryWeth: Address
  lockerNfpm: Address
  lockerUniFactory: Address
  lockerFactory: Address
  lockerPoolFee: number
  lockerTickSpacing: number
  lpFeesWeth: Address

  lockerV4?: { poolManager: Address; poolFee: number; tickSpacing: number; factory: Address }

  bookAnvil?: { bookFactory: Address; mancerFeeTo: Address; protocolTreasury: Address; ethUsdFeed: Address }

  owner: Address

  padOwner: Address

  pendingOwner: Address

  mancerSigner?: Address

  minDurationSecs?: number

  quotes?: readonly BookListedQuote[]

  hooksAllowed?: readonly Address[]

  bootstrapSealed?: boolean

  padVersion?: number

  padRegistryOwner?: Address

  vaultDomainName?: string

  stonkPerps?: { factory: Address; weth: Address; operator: Address; accountImpl: Address; testMode: false; bridge: Address }
}

export interface BookConstants {
  liquidateGraceSecs: number
  maxTracked: number
  taxFloorBps: number
  creatorProfitBps: number

  closeFeeBps?: number
  mancerShareBps?: number
  maxOrderFeeBps?: number

  autoBondMinGas?: number
  bondBountyBps?: number
}

export const BOOK_SHARED = {
  weth: '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73',
  swapRouter02: '0xCaf681a66D020601342297493863E78C959E5cb2',
  uniswapV3Factory: '0x1f7d7550B1b028f7571E69A784071F0205FD2EfA',
  nfpm: '0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3',
  quoterV2: '0x33e885eD0Ec9bF04EcfB19341582aADCb4c8A9E7',

  uniswapV4PoolManager: '0x8366a39CC670B4001A1121B8F6A443A643e40951',
  ethUsdFeed: '0x6091E64eb7138EEF066a80FD3A0d7427B91f2721',
  mancerRouter: '0xa62858659C83095Eb5E702f0Af6a7Bb7F370B3e7',
  mancerRouterAllowanceTarget: '0x4c16269006dB0DD87e6aE3C8A014B2807Aa2e388',
  mancerOrdersV3: '0xf300A6549Cd46206629e6719d3f258022d7F2da1',
  mancerFeeConverter: '0x5f3b7E837f2d5b6C38E78eE4f45BD140A226656e',
  stonkBrokersTreasury: '0xb668382cF44038a3E8140E789060F6A809787CDa',
  clockIn: '0xB673276C46dE1428EacC15Ed6eceF480259D8566',
  dead: '0x000000000000000000000000000000000000dEaD',
  multicall3: '0xcA11bde05977b3631167028862bE2a173976CA11',
} as const satisfies Record<string, Address>

export const BOOK_CONSTANTS: Required<Omit<BookConstants, 'autoBondMinGas' | 'bondBountyBps'>> = {
  liquidateGraceSecs: 172_800,
  maxTracked: 16,
  taxFloorBps: 100,
  creatorProfitBps: 2_000,
  closeFeeBps: 200,
  mancerShareBps: 5_000,
  maxOrderFeeBps: 100,
}

export const BOOK_QUOTE_FEEDS = {
  STONKBROKER: {
    address: '0x6f873226277A82DDcC25C62C6E0648415F735dEF',
    runtimeCodeHash: '0x66315381d460ed31f18864a4b4bbc2052b70dbe566ef1257b25b6807cb95c3dc',
    pool: '0x9cd74d5980A4BF60408B9bA2B0F6a3d368EBf594',
    maxAgeSecs: 172_800,
  },
  MANCER: {
    address: '0x8c0fbDA2f6FfE060Fa6899EE0B8C494205FB1Fb5',
    runtimeCodeHash: '0x7bb735d12b962270ca527013df5558a18ce6894543eefb874f81215d40a69aed',
    pool: '0x543127d6a1932689fAaCc1Afad4A81146d9ccF54',
    maxAgeSecs: 172_800,
  },
  PONS: {
    address: '0x1d1C210714FA97120D5497F06C6edC40C5dB4c68',
    runtimeCodeHash: '0x4dd3f941603ee3be349140e68973eef95b2f437cc46d7d8b31849e94657bd611',
    pool: '0x10CC6BD38112cAc182db90B6a71d8Bb5939526bA',
    maxAgeSecs: 172_800,
  },
  CASHCAT: {
    address: '0xf2DcDff944c4d43795ad02170d5fA1145e61FB54',
    runtimeCodeHash: '0xec4b537dba25be5bb47f8b1926dc6d01973b6ca1a8e10a35a36e6e24a62cf349',
    pool: '0xd42A491087a15E5afd51FEb3606066Cc152d2b09',
    maxAgeSecs: 172_800,
  },
  HOOKR: {
    address: '0xdF09E15Dc548516a96E4891715499920c7154D19',
    runtimeCodeHash: '0x7f2603f27a1c76ae824bd1ae4e64d1a5ea588a10db509c5817851a21caf39109',
    pool: '0x42b19e5e3F28C4148C518444546f102F6ba87aB1',
    maxAgeSecs: 172_800,
  },
} as const satisfies Record<string, BookQuoteFeedPin>

export const BOOK_LISTED_QUOTES: readonly BookListedQuote[] = [
  { token: '0xe934e36A439C94017B64a3FecE66AF12099aBF50', symbol: 'STONKBROKER', decimals: 18, usdFeed: zeroAddress, maxAgeSecs: 172_800, feed: BOOK_QUOTE_FEEDS.STONKBROKER },
  { token: '0xc72F232a6869e6CF34dC06129AfFD07F8a2a246A', symbol: 'MANCER', decimals: 18, usdFeed: zeroAddress, maxAgeSecs: 172_800, feed: BOOK_QUOTE_FEEDS.MANCER },
  { token: '0x39dBED3a2bd333467115dE45665cC57F813C4571', symbol: 'PONS', decimals: 18, usdFeed: zeroAddress, maxAgeSecs: 172_800, feed: BOOK_QUOTE_FEEDS.PONS },
  { token: '0x020bfC650A365f8BB26819deAAbF3E21291018b4', symbol: 'CASHCAT', decimals: 18, usdFeed: zeroAddress, maxAgeSecs: 172_800, feed: BOOK_QUOTE_FEEDS.CASHCAT },
  { token: '0x18E674231A58c239Dc7DaeDcffE15Ec3A24cff5c', symbol: 'HOOKR', decimals: 18, usdFeed: zeroAddress, maxAgeSecs: 172_800, feed: BOOK_QUOTE_FEEDS.HOOKR },
]

const BOOKS_OWNER: Address = '0xD4aF10Bc56b08f8fc2990a3ADeeD4b757ae6A26C'

export const BOOKS_MANCER_SIGNER: Address = '0x119B0496B837B60a464923b6521d6D98Dc61a68c'

export const BOOK_LAUNCH_FACTORY: Address = '0x0D650F791f6c53C83D5076f1f144C7C2d673cCB2'

export function booksStack(s: {
  label: string

  abiSet?: BookAbiSet
  deployBlock: bigint
  minDurationSecs: number
  factory: CodePinned
  pad: CodePinned
  settler: CodePinned
  lpFees: CodePinned
  locker: CodePinned
  lockerV4: CodePinned
  operatorNft: CodePinned
  accountImplementation: CodePinned
  uniswapAdapter: CodePinned
  mancerAdapter: CodePinned
  bookAnvilFactory: CodePinned
  vaultCloneCodeHash: Hex
  bookTokenCodeHash: Hex

  opensNewBooks?: boolean

  padStockBooster?: Address

  bootstrapSealed?: boolean
  padRegistry?: CodePinned
  stonkPerpsAdapter?: CodePinned
  stonkPerps?: BookExpected['stonkPerps']

  quotes?: readonly BookListedQuote[]

  vaultDomainName?: string
}): BookDeployment {
  const f = s.factory.address
  const abiSet = s.abiSet ?? 'books'
  const claims = BOOK_ABI_RULES[abiSet].pad === 'claims'
  return {
    factory: s.factory,
    label: s.label,
    abiSet,

    access: 'public',
    chainId: 4663,
    deployBlock: s.deployBlock,
    opensNewBooks: s.opensNewBooks ?? f.toLowerCase() === BOOK_LAUNCH_FACTORY.toLowerCase(),
    pad: s.pad,
    settler: s.settler,
    lpFees: s.lpFees,
    locker: s.locker,
    lockerV4: s.lockerV4,
    operatorNft: s.operatorNft,
    accountImplementation: s.accountImplementation,
    vaultCloneCodeHash: s.vaultCloneCodeHash,
    bookTokenCodeHash: s.bookTokenCodeHash,
    adapters: { uniswap: s.uniswapAdapter, mancer: s.mancerAdapter },
    bookAnvilFactory: s.bookAnvilFactory,
    ...(s.padRegistry ? { padRegistry: s.padRegistry } : {}),
    ...(s.stonkPerpsAdapter ? { stonkPerpsAdapter: s.stonkPerpsAdapter } : {}),
    orderSpenders: [BOOK_SHARED.mancerOrdersV3],
    expected: {
      adapterRouter: BOOK_SHARED.mancerRouter,
      adapterAllowanceTarget: BOOK_SHARED.mancerRouterAllowanceTarget,
      adapterTestMode: false,
      uniswapAdapterRouter: BOOK_SHARED.swapRouter02,
      uniswapAdapterDefaultFee: 10_000,
      uniswapAdapterTestMode: false,
      settlerWeth: BOOK_SHARED.weth,
      settlerMancerFeeTo: BOOK_SHARED.mancerFeeConverter,
      settlerProtocolTreasury: BOOK_SHARED.stonkBrokersTreasury,
      padWeth: BOOK_SHARED.weth,
      padLocker: s.locker.address,
      padEthUsdFeed: BOOK_SHARED.ethUsdFeed,
      padTreasury: BOOK_SHARED.stonkBrokersTreasury,
      padStockBooster: s.padStockBooster ?? BOOK_SHARED.clockIn,
      factoryWeth: BOOK_SHARED.weth,
      lockerNfpm: BOOK_SHARED.nfpm,
      lockerUniFactory: BOOK_SHARED.uniswapV3Factory,
      lockerFactory: f,
      lockerPoolFee: 10_000,
      lockerTickSpacing: 200,
      lpFeesWeth: BOOK_SHARED.weth,
      lockerV4: { poolManager: BOOK_SHARED.uniswapV4PoolManager, poolFee: 10_000, tickSpacing: 200, factory: f },
      bookAnvil: { bookFactory: f, mancerFeeTo: BOOK_SHARED.mancerFeeConverter, protocolTreasury: BOOK_SHARED.stonkBrokersTreasury, ethUsdFeed: BOOK_SHARED.ethUsdFeed },
      owner: BOOKS_OWNER,
      padOwner: BOOKS_OWNER,
      pendingOwner: zeroAddress,
      mancerSigner: BOOKS_MANCER_SIGNER,
      minDurationSecs: s.minDurationSecs,
      quotes: s.quotes ?? BOOK_LISTED_QUOTES,
      hooksAllowed: [],
      ...(s.bootstrapSealed === false ? { bootstrapSealed: false } : {}),
      ...(claims ? { padVersion: 2, padRegistryOwner: BOOKS_OWNER } : {}),
      ...(s.stonkPerps ? { stonkPerps: s.stonkPerps } : {}),
      ...(s.vaultDomainName ? { vaultDomainName: s.vaultDomainName } : {}),
    },
    mancerSignerSlot: '0x0000000000000000000000000000000000000000000000000000000000000005',
    constants: { ...BOOK_CONSTANTS, ...(claims ? { autoBondMinGas: 3_000_000, bondBountyBps: 2_000 } : {}) },

    displayNames: { [s.operatorNft.address.toLowerCase()]: 'Book Operator' },
  }
}

export const BOOKS_DEPLOYMENT: BookDeployment = booksStack({
  label: 'books',
  deployBlock: 93_679_105n,
  minDurationSecs: 604_800,
  factory: { address: '0xa727e7AF47A965afD0341AfCEF7Bc3F86be876b0', runtimeCodeHash: '0x8a93322403017d1103aeec613f7bcf08f6f1af2acffd25b7e71d5d1ec6454cd6' },
  pad: { address: '0xdf4bFc928F0b94916Df29E2fF736C121Da6b3B10', runtimeCodeHash: '0x12e391d6310cf14ea1d46208dcfda37d1925e1305407e566e6efe3822443bf3d' },
  settler: { address: '0x05116a284CeED7aeeEb552d82402d0c7953bd0fb', runtimeCodeHash: '0x433d33622b2db6138579039f4a9d1e37123e4dfe33850f05b78a5c869d98c60c' },
  lpFees: { address: '0xA4f65B448f6cef1dD49Ca1aa8f84F0948a6Ee180', runtimeCodeHash: '0xd788bbfcfceb4fb71a3741d6ec2ce17180e4bc11225d3c9d215831bebd5b4f5f' },
  locker: { address: '0x4155d6bc8dA56f418e5c9F712f1fcb57688Abe02', runtimeCodeHash: '0x40b8692a0491c1762c2bcf6442687597c4a728a68341f786cb2859755902df05' },
  lockerV4: { address: '0x4d18492A24B1DDfCCDe5777F5684939Bbc91C490', runtimeCodeHash: '0x391547c8fa686a9857aae38d404e2f8a589ea5f52362820a4e96a1d290570c34' },
  operatorNft: { address: '0x8AB85f6103B5d660ac9981e9aA4cA18a3880BC60', runtimeCodeHash: '0xacddc3672ab2473f48f5312639a5ea0f796e505a0e8e674b7ca8331b18eed0ed' },
  accountImplementation: { address: '0xa67B2C61Cf3d80418c85c17dAEbF25Fb13BC83C0', runtimeCodeHash: '0x5c541035aae72446624b70ba7ee2344bd6e1b80dc0d876cfe92c67ce4b151f31' },
  uniswapAdapter: { address: '0x942c025a03246Fc5f2B1E01978c14612e6a56399', runtimeCodeHash: '0x7f7bcc6431575a0705937d825da0f00620099e1ebb7033e2aada00d9c7f0937c' },
  mancerAdapter: { address: '0x916A618E1ad398aA28D5842A42AB831a79693f80', runtimeCodeHash: '0xe12193044ecc08e1c3f46e7d7f0d0022fb66051909fbe48970c9a1e88d2edc04' },
  bookAnvilFactory: { address: '0x43cE08926b0F6EaEC0e2a297f075D1dDb6E25060', runtimeCodeHash: '0xd75053b2a67e6f2d37359ad9e745a695cae12e2a56b76ffb23ff2097f420c4d9' },
  vaultCloneCodeHash: '0xd289c88f8839be24c48cedfc6d12af2d8e4f9e58044fbbba40337144e9474877',
  bookTokenCodeHash: '0xfdd5c6593898c7b24a3238a583fdbd939e75e2c9d6f9082681d1bb2c56124006',
})

const STONK_PERPS_ADAPTER_1103: Address = '0x1A8D2cC2F88d9e80E0C797b2d7FCAD97299cFCc1'

export const BOOKS_1103_DEPLOYMENT: BookDeployment = booksStack({
  label: 'books-1103',
  abiSet: 'books-4e07ea0',
  deployBlock: 105_181_288n,
  minDurationSecs: 604_800,
  factory: { address: '0x6b6784Fa1F54d3274a5CeaD0E493643b83834C84', runtimeCodeHash: '0x4190a0ca0734c0defcbec0d84da12aaffc8e3c3aba3338802208bbb481af7089' },
  pad: { address: '0xBeD0F4962EcC442bA23ECc3308A99cEc57a29982', runtimeCodeHash: '0x7db8bd53fdc2ccdcb11b9d294c5c7d8b3a0dd08c6a9f76b62d7515c787717a68' },
  settler: { address: '0x41632753eE5B9Ef1EeF134F0bF6ff0f9D10a4D77', runtimeCodeHash: '0x1368a0e07d3a31f9c90da4090f0ecb52f4cb2918162cd2a69ee3129fd6972248' },
  lpFees: { address: '0xC58eAB88FC8082cEC7F9F183fc5d0a1A0948DE6b', runtimeCodeHash: '0x7165604eb1506fc74e6379f55de8c29599fb155ec3be4988011df2753ad5fd54' },
  locker: { address: '0xD011EFED5170406E78FF69EC47eE67aA27602DaB', runtimeCodeHash: '0x40b8692a0491c1762c2bcf6442687597c4a728a68341f786cb2859755902df05' },
  lockerV4: { address: '0x2368E62597df5A67Ddd3c589B966394eD9860D37', runtimeCodeHash: '0x391547c8fa686a9857aae38d404e2f8a589ea5f52362820a4e96a1d290570c34' },
  operatorNft: { address: '0x8Effcf556d8E9D5748De99e3c0d31D438c77d6F0', runtimeCodeHash: '0x9aea787d2a323a9c94762cf060989afc0b604792fd533558e24c76ad62df342f' },
  accountImplementation: { address: '0x96963edB329DC27ABd7B79eE59483B50A537eD68', runtimeCodeHash: '0x597ce8da6d700e05a13e7e5cf436d23ef6c7ae76dd011fa4c15723fdc81d7652' },
  uniswapAdapter: { address: '0x0E4bF370CC51dD9CD4004cc7b0Efddfa8ed0820B', runtimeCodeHash: '0x7f7bcc6431575a0705937d825da0f00620099e1ebb7033e2aada00d9c7f0937c' },
  mancerAdapter: { address: '0x07752878BcEFE50e22Fb9543284FbdF3F0139931', runtimeCodeHash: '0xe12193044ecc08e1c3f46e7d7f0d0022fb66051909fbe48970c9a1e88d2edc04' },
  bookAnvilFactory: { address: '0xa6A329697Cae9CF61F276E77a7833a89CEf39208', runtimeCodeHash: '0x1d52d278586aaab61f6f25398b8e524f73fa5758e6774c6f1a4a4fed85e90f09' },
  padRegistry: { address: '0x23f85f1A3649072E11eeea6880F1b79a2198b342', runtimeCodeHash: '0x978637759822d545c6b9e92802c80b5885a5d4cfca982e22df570d03af088437' },
  stonkPerpsAdapter: { address: STONK_PERPS_ADAPTER_1103, runtimeCodeHash: '0x9b3902c8f283de07184288ed05d6ccd898f65097bdff7e4c5ba61ec2e5636164' },
  stonkPerps: {
    factory: '0x6b6784Fa1F54d3274a5CeaD0E493643b83834C84',
    weth: BOOK_SHARED.weth,
    operator: BOOKS_OWNER,
    accountImpl: '0x964674ba896069eF6981f250Acb62C8e5E94d58a',
    testMode: false,
    bridge: zeroAddress,
  },
  vaultCloneCodeHash: '0x3f50cd41d8e82b20cd5a40f71a42a57c8d4e9ceb06031271131c0215d078789a',
  bookTokenCodeHash: '0x533d5913e513d3cd5a13b2c57b0e486e70840305554c6cc8be0ca58117469e46',
  padStockBooster: '0xf4129019D8838f2555Bdc8EcB3024a02145dbC58',
  bootstrapSealed: false,
})

export const BOOKS_V2C_DEPLOYMENT: BookDeployment = booksStack({
  label: 'books-1105',
  abiSet: 'books-e8d92ea',
  deployBlock: 107_132_534n,
  minDurationSecs: 604_800,
  factory: { address: '0x0D650F791f6c53C83D5076f1f144C7C2d673cCB2', runtimeCodeHash: '0xccabadcb23983a3cbba3eb93baee67d77f7e53d4b0c371152d55a2e0f7139c68' },
  pad: { address: '0xEa44025C4900E6cD14c830d4983454Fe3101536c', runtimeCodeHash: '0x8931690e458a99204cf2d83bb66b9bd711e470f88ec23c7034f54565c149b0b3' },
  settler: { address: '0x42e94e2A9FdC40482B5d7959eA97EcCC7c6e2a37', runtimeCodeHash: '0xd508326e9f45d3bf9c43c8738ab9c9a469e804d9356dcfbd835f6c14009d9af0' },
  lpFees: { address: '0x4449e6fFB1d117642352aFBAC61Fafa64c9A9FA9', runtimeCodeHash: '0xd142111e73e4b01263d0a753d603d63d709a6fcc7c2f8788478bd97fc2036fb9' },
  locker: { address: '0x861b50411022C750e9a3e49a0AbA207EF10ffF7e', runtimeCodeHash: '0x7c22184f0f5a3ccbc2bafc6bd3c0ee4acd9859a8c0ad676b594b745227cca595' },
  lockerV4: { address: '0x8477442A4e5F01553eB1772233c7695Eb83E638f', runtimeCodeHash: '0xdcdce45c347b15b5c421018ee7b2a703178c4b162775709ee8c0e82d11085053' },
  operatorNft: { address: '0x15A5Dd33328f391CED235e7FA8a6C229ad8BbF69', runtimeCodeHash: '0xd9b5e0f56be3951637790fbfd3266ae8aed7fb4aee633f965d936c9be637283f' },
  accountImplementation: { address: '0x929b25a5980417F6b51231d0889c3e2591b1707E', runtimeCodeHash: '0xca1dd159b2fe703d8397a64829dadc057b40e1cc8957777b91fc957b6965663d' },
  uniswapAdapter: { address: '0x3E6abBcd24799e71997049b46A6DbAaaB886C627', runtimeCodeHash: '0xd83ea0610864f3a26016cd21c5008a70c1fb8dc210bb4e97bf72731593265a72' },
  mancerAdapter: { address: '0xd8c56E6a272A47bF306c8C171B5dA91d7CC4709a', runtimeCodeHash: '0x375ee8492d236c0f1c9cd8be234d2ca9b1fc30eac41f2ea940107bb92239ad35' },
  bookAnvilFactory: { address: '0x0e50856eAEdd438b14c1921F0C3bBc11a8D9c69A', runtimeCodeHash: '0x52dfdcec8414c929027220b34f87c4eba56dd7ec2cbc364f5aa546212d481f03' },
  padRegistry: { address: '0x23f85f1A3649072E11eeea6880F1b79a2198b342', runtimeCodeHash: '0x978637759822d545c6b9e92802c80b5885a5d4cfca982e22df570d03af088437' },
  vaultCloneCodeHash: '0x16fb7fb134d28b42d066504f52e6eef2d327cbad081509d650510b233d705831',
  bookTokenCodeHash: '0xc8943e5298c87a5da795806433e00da48da037f2af9ca83727dbdcb90515c3ef',
  padStockBooster: '0xf4129019D8838f2555Bdc8EcB3024a02145dbC58',
  vaultDomainName: 'Mancer Books',
})

export const BOOK_DEPLOYMENTS: readonly BookDeployment[] = [BOOKS_DEPLOYMENT, BOOKS_1103_DEPLOYMENT, BOOKS_V2C_DEPLOYMENT]

export function bookLaunchDeployment(deployments: readonly BookDeployment[] = BOOK_DEPLOYMENTS): BookDeployment | null {
  return deployments.find((d) => d.opensNewBooks) ?? null
}

export function publicBookDeployments(deployments: readonly BookDeployment[] = BOOK_DEPLOYMENTS): BookDeployment[] {
  return deployments.filter((d) => d.access === 'public')
}

export function visibleBookDeployments(
  beta: boolean,
  deployments: readonly BookDeployment[] = BOOK_DEPLOYMENTS,
): BookDeployment[] {
  return deployments.filter((d) => bookDeploymentVisible(d, beta))
}

export function bookDeploymentVisible(deployment: Pick<BookDeployment, 'access'>, beta: boolean): boolean {
  return deployment.access === 'public' || (beta && deployment.access === 'beta')
}

export function bookDeploymentForFactory(
  factory: string,
  deployments: readonly BookDeployment[] = BOOK_DEPLOYMENTS,
): BookDeployment | null {
  const key = factory.toLowerCase()
  return deployments.find((d) => d.factory.address.toLowerCase() === key) ?? null
}

export function publicBookDeploymentForFactory(
  factory: string,
  deployments: readonly BookDeployment[] = BOOK_DEPLOYMENTS,
): BookDeployment | null {
  const found = bookDeploymentForFactory(factory, deployments)
  return found?.access === 'public' ? found : null
}

export function visibleBookDeploymentForFactory(
  factory: string,
  beta: boolean,
  deployments: readonly BookDeployment[] = BOOK_DEPLOYMENTS,
): BookDeployment | null {
  const found = bookDeploymentForFactory(factory, deployments)
  return found && bookDeploymentVisible(found, beta) ? found : null
}

export function bookAbisFor(deployment: Pick<BookDeployment, 'abiSet'>) {
  return BOOK_ABIS[deployment.abiSet]
}

export function bookDisplayName(deployment: Pick<BookDeployment, 'displayNames'>, token: string, chainName: string): string {
  return deployment.displayNames[token.toLowerCase()] ?? chainName
}

export type BookPinnedRole =
  | 'factory' | 'pad' | 'settler' | 'lpFees' | 'locker' | 'lockerV4' | 'operatorNft' | 'accountImplementation'
  | 'uniswapAdapter' | 'mancerAdapter' | 'bookAnvilFactory' | 'padRegistry' | 'stonkPerpsAdapter'

export function bookPinnedContracts(d: BookDeployment): Array<{ role: BookPinnedRole; pin: CodePinned }> {
  const out: Array<{ role: BookPinnedRole; pin: CodePinned }> = [
    { role: 'factory', pin: d.factory },
    { role: 'pad', pin: d.pad },
    { role: 'settler', pin: d.settler },
    { role: 'lpFees', pin: d.lpFees },
    { role: 'locker', pin: d.locker },
  ]
  if (d.lockerV4) out.push({ role: 'lockerV4', pin: d.lockerV4 })
  out.push(
    { role: 'operatorNft', pin: d.operatorNft },
    { role: 'accountImplementation', pin: d.accountImplementation },
    { role: 'uniswapAdapter', pin: d.adapters.uniswap },
  )
  if (d.adapters.mancer) out.push({ role: 'mancerAdapter', pin: d.adapters.mancer })
  if (d.bookAnvilFactory) out.push({ role: 'bookAnvilFactory', pin: d.bookAnvilFactory })
  if (d.padRegistry) out.push({ role: 'padRegistry', pin: d.padRegistry })
  if (d.stonkPerpsAdapter) out.push({ role: 'stonkPerpsAdapter', pin: d.stonkPerpsAdapter })
  return out
}

export interface BookExpectedRead {
  label: string
  role: BookPinnedRole
  address: Address
  abi: Abi
  functionName: string
  args: readonly unknown[]
  expected: Address | boolean | number
  output?: number

  anyOf?: ReadonlyArray<Address | boolean | number>
}

export function bookExpectedReads(d: BookDeployment): BookExpectedRead[] {
  const abis = bookAbisFor(d)
  const e = d.expected
  const reads: BookExpectedRead[] = []
  const add = (role: BookPinnedRole, address: Address, abi: Abi, functionName: string, expected: Address | boolean | number) => {
    reads.push({ label: `${role}.${functionName}()`, role, address, abi, functionName, args: [], expected })
  }
  const f = d.factory.address
  add('factory', f, abis.factory, 'pad', d.pad.address)
  add('factory', f, abis.factory, 'settler', d.settler.address)
  add('factory', f, abis.factory, 'lpFees', d.lpFees.address)
  add('factory', f, abis.factory, 'operatorNft', d.operatorNft.address)
  add('factory', f, abis.factory, 'accountImplementation', d.accountImplementation.address)
  add('factory', f, abis.factory, 'weth', e.factoryWeth)
  add('factory', f, abis.factory, 'owner', e.owner)
  add('factory', f, abis.factory, 'pendingOwner', e.pendingOwner)
  add('pad', d.pad.address, abis.pad, 'factory', f)
  add('pad', d.pad.address, abis.pad, 'weth', e.padWeth)
  add('pad', d.pad.address, abis.pad, 'locker', e.padLocker)
  add('pad', d.pad.address, abis.pad, 'ethUsdFeed', e.padEthUsdFeed)
  add('pad', d.pad.address, abis.pad, 'treasury', e.padTreasury)
  add('pad', d.pad.address, abis.pad, 'stockBooster', e.padStockBooster)
  add('pad', d.pad.address, abis.pad, 'owner', e.padOwner)
  add('settler', d.settler.address, abis.settler, 'factory', f)
  add('settler', d.settler.address, abis.settler, 'weth', e.settlerWeth)
  if (e.settlerMancerFeeTo) add('settler', d.settler.address, abis.settler, 'mancerFeeTo', e.settlerMancerFeeTo)
  if (e.settlerProtocolTreasury) add('settler', d.settler.address, abis.settler, 'protocolTreasury', e.settlerProtocolTreasury)
  add('lpFees', d.lpFees.address, abis.lpFees, 'factory', f)
  add('lpFees', d.lpFees.address, abis.lpFees, 'locker', d.locker.address)
  add('lpFees', d.lpFees.address, abis.lpFees, 'weth', e.lpFeesWeth)
  add('locker', d.locker.address, abis.locker, 'factory', e.lockerFactory)
  add('locker', d.locker.address, abis.locker, 'nfpm', e.lockerNfpm)
  add('locker', d.locker.address, abis.locker, 'uniFactory', e.lockerUniFactory)
  add('locker', d.locker.address, abis.locker, 'poolFee', e.lockerPoolFee)
  add('locker', d.locker.address, abis.locker, 'tickSpacing', e.lockerTickSpacing)
  add('operatorNft', d.operatorNft.address, abis.operatorNft, 'factory', f)
  const u = d.adapters.uniswap.address
  add('uniswapAdapter', u, abis.uniswapAdapter, 'router', e.uniswapAdapterRouter)
  add('uniswapAdapter', u, abis.uniswapAdapter, 'defaultFee', e.uniswapAdapterDefaultFee)
  add('uniswapAdapter', u, abis.uniswapAdapter, 'testMode', e.uniswapAdapterTestMode)
  if (d.lockerV4) {

    const v4 = e.lockerV4
    if (!v4) throw new Error(`deployment ${d.label} names a v4 locker without its expected PoolManager, fee, spacing and factory`)
    const l = d.lockerV4.address
    add('pad', d.pad.address, abis.pad, 'lockerV4', l)
    add('lockerV4', l, abis.lockerV4, 'poolManager', v4.poolManager)
    add('lockerV4', l, abis.lockerV4, 'poolFee', v4.poolFee)
    add('lockerV4', l, abis.lockerV4, 'tickSpacing', v4.tickSpacing)
    add('lockerV4', l, abis.lockerV4, 'factory', v4.factory)
  }
  if (d.adapters.mancer) {
    const m = d.adapters.mancer.address
    if (!e.adapterRouter || !e.adapterAllowanceTarget || e.adapterTestMode !== false) {
      throw new Error(`deployment ${d.label} names a Mancer adapter without its expected router, allowance target and test mode`)
    }
    add('mancerAdapter', m, abis.mancerAdapter, 'router', e.adapterRouter)
    add('mancerAdapter', m, abis.mancerAdapter, 'allowanceTarget', e.adapterAllowanceTarget)
    add('mancerAdapter', m, abis.mancerAdapter, 'testMode', e.adapterTestMode)
  }
  if (d.bookAnvilFactory) {
    if (!e.bookAnvil) throw new Error(`deployment ${d.label} names a Book Anvil factory without its expected four`)
    const a = d.bookAnvilFactory.address
    add('bookAnvilFactory', a, abis.anvilFactory, 'bookFactory', e.bookAnvil.bookFactory)
    add('bookAnvilFactory', a, abis.anvilFactory, 'mancerFeeTo', e.bookAnvil.mancerFeeTo)
    add('bookAnvilFactory', a, abis.anvilFactory, 'protocolTreasury', e.bookAnvil.protocolTreasury)
    add('bookAnvilFactory', a, abis.anvilFactory, 'ethUsdFeed', e.bookAnvil.ethUsdFeed)
  }
  if (BOOK_ABI_RULES[d.abiSet].pad === 'claims') {
    if (e.padVersion === undefined) throw new Error(`deployment ${d.label} has a claims pad and names no PAD_VERSION`)
    add('pad', d.pad.address, abis.pad, 'PAD_VERSION', e.padVersion)
  }
  if (d.padRegistry) {
    if (!e.padRegistryOwner) throw new Error(`deployment ${d.label} names a pad registry without its owner`)
    add('padRegistry', d.padRegistry.address, BOOK_ABIS['books-4e07ea0'].padRegistry, 'owner', e.padRegistryOwner)
  }
  if (d.stonkPerpsAdapter) {
    const p = e.stonkPerps
    if (!p) throw new Error(`deployment ${d.label} names StonkBrokers' perps adapter without its expected immutables`)
    const s = d.stonkPerpsAdapter.address
    const abi = BOOK_ABIS['books-4e07ea0'].stonkPerpsAdapter
    add('stonkPerpsAdapter', s, abi, 'factory', p.factory)
    add('stonkPerpsAdapter', s, abi, 'weth', p.weth)
    add('stonkPerpsAdapter', s, abi, 'operator', p.operator)
    add('stonkPerpsAdapter', s, abi, 'accountImpl', p.accountImpl)
    add('stonkPerpsAdapter', s, abi, 'testMode', p.testMode)
  }
  return reads
}

export function bookStorageReads(d: BookDeployment): BookExpectedRead[] {
  const books = bookAbisFor(d)
  const e = d.expected
  const f = d.factory.address
  const reads: BookExpectedRead[] = []
  const add = (role: BookPinnedRole, address: Address, abi: Abi, functionName: string, args: readonly unknown[], expected: Address | boolean | number, label: string, output?: number, anyOf?: ReadonlyArray<Address | boolean | number>) => {
    reads.push({ label, role, address, abi, functionName, args, expected, ...(output === undefined ? {} : { output }), ...(anyOf ? { anyOf } : {}) })
  }
  add('factory', f, books.factory, 'modulesLocked', [], true, 'factory.modulesLocked()')
  add('factory', f, books.factory, 'adapterBootstrapSealed', [], e.bootstrapSealed ?? true, 'factory.adapterBootstrapSealed()')
  add('factory', f, books.factory, 'isAdapter', [d.adapters.uniswap.address], true, `factory.isAdapter(${d.adapters.uniswap.address.toLowerCase()})`)
  if (d.adapters.mancer) add('factory', f, books.factory, 'isAdapter', [d.adapters.mancer.address], true, `factory.isAdapter(${d.adapters.mancer.address.toLowerCase()})`)
  if (d.stonkPerpsAdapter && e.stonkPerps) {
    const s = d.stonkPerpsAdapter.address
    add('factory', f, books.factory, 'isAdapter', [s], true, `factory.isAdapter(${s.toLowerCase()})`)
    add('stonkPerpsAdapter', s, BOOK_ABIS['books-4e07ea0'].stonkPerpsAdapter, 'bridge', [], e.stonkPerps.bridge, 'stonkPerpsAdapter.bridge()')
  }
  for (const spender of d.orderSpenders) add('factory', f, books.factory, 'isSpender', [spender], true, `factory.isSpender(${spender.toLowerCase()})`)
  if (e.mancerSigner) add('factory', f, books.factory, 'mancerSigner', [], e.mancerSigner, 'factory.mancerSigner()')
  if (e.minDurationSecs !== undefined) add('factory', f, books.factory, 'minDurationSecs', [], e.minDurationSecs, 'factory.minDurationSecs()')
  for (const q of e.quotes ?? []) {
    const label = (field: string) => `pad.quoteConfig(${q.token.toLowerCase()}).${field}`
    add('pad', d.pad.address, books.pad, 'quoteConfig', [q.token], true, label('allowed'), 0)
    add('pad', d.pad.address, books.pad, 'quoteConfig', [q.token], q.decimals, label('decimals'), 1)
    add('pad', d.pad.address, books.pad, 'quoteConfig', [q.token], q.usdFeed, label('usdFeed'), 2,
      q.feed && q.feed.address.toLowerCase() !== q.usdFeed.toLowerCase() ? [q.usdFeed, q.feed.address] : undefined)
    add('pad', d.pad.address, books.pad, 'quoteConfig', [q.token], q.maxAgeSecs, label('maxAge'), 4,
      q.feed && q.feed.maxAgeSecs !== q.maxAgeSecs ? [q.maxAgeSecs, q.feed.maxAgeSecs] : undefined)
  }
  for (const hook of e.hooksAllowed ?? []) add('pad', d.pad.address, books.pad, 'hookAllowed', [hook], true, `pad.hookAllowed(${hook.toLowerCase()})`)
  return reads
}

export function bookReadMatches(read: Pick<BookExpectedRead, 'expected' | 'output' | 'anyOf'>, answer: unknown): boolean {
  let value = answer
  if (read.output !== undefined) {
    const list = Array.isArray(answer) ? answer : answer && typeof answer === 'object' ? Object.values(answer) : null
    if (!list || list.length <= read.output) return false
    value = list[read.output]
  }
  const same = (want: Address | boolean | number) => {
    if (typeof want === 'string') return typeof value === 'string' && value.toLowerCase() === want.toLowerCase()
    if (typeof want === 'number') return (typeof value === 'number' || typeof value === 'bigint') && BigInt(value) === BigInt(want)
    return value === want
  }
  return (read.anyOf ?? [read.expected]).some(same)
}

export function bookQuoteFeedPins(d: Pick<BookDeployment, 'expected'>): Map<string, BookQuoteFeedPin> {
  const out = new Map<string, BookQuoteFeedPin>()
  for (const q of d.expected.quotes ?? []) if (q.feed) out.set(q.token.toLowerCase(), q.feed)
  return out
}
