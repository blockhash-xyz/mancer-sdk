// SPDX-License-Identifier: MIT
// Part of Mancer's contracts kit as the SDK uses it, mirrored with the rest of this repository at each release.
import type { Address } from 'viem'

export const MAINNET_UNISWAP_V3 = {
  factory: '0x1f7d7550b1b028f7571e69a784071f0205fd2efa',
  swapRouter02: '0xcaf681a66d020601342297493863e78c959e5cb2',
  quoterV2: '0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7',
  weth: '0x0bd7d308f8e1639fab988df18a8011f41eacad73',
} as const satisfies Record<string, Address>

export const MAINNET_UNISWAP_V2 = {
  factory: '0x8bceaa40b9acdfaedf85adf4ff01f5ad6517937f',
} as const satisfies Record<string, Address>

export const MAINNET_UNISWAP_V4 = {
  poolManager: '0x8366a39cc670b4001a1121b8f6a443a643e40951',
  positionManager: '0x58daec3116aae6d93017baaea7749052e8a04fa7',
  quoter: '0x8dc178efb8111bb0973dd9d722ebeff267c98f94',
  stateView: '0xf3334192d15450cdd385c8b70e03f9a6bd9e673b',
  universalRouter: '0x8876789976decbfcbbbe364623c63652db8c0904',

  exactInputAdapter: '0x56aD09F5226873c660aBaf2ACe83279eb145234F',
  permit2: '0x000000000022d473030f116ddee9f6b43ac78ba3',
} as const satisfies Record<string, Address>

export const UP33 = {
  factory: '0xfa5429aeba338bea2bfcc1b9a889862ee395bc28',
  router: '0xf5198743240fac98db71868f34c70139b1eb0474',
} as const satisfies Record<string, Address>

export const UP33_CL = {
  factory: '0x1ac9dB4a2608ba45D6127B1737949b51Bb54B7F3',
  swapRouter: '0xc062b870e813fca720f1e002c234369ab3ab9415',
} as const satisfies Record<string, Address>

export const EKUBO = {
  core: '0x00000000000014aa86c5d3c41765bb24e11bd701',
  router: '0xd26f20001a72a18c002b00e6710000d68700ce00',
} as const satisfies Record<string, Address>

export interface KnownToken {
  address: Address
  symbol: string
  name: string
  decimals: number

  isStock: boolean
}

export const KNOWN_TOKENS: Record<number, KnownToken[]> = {
  4663: [
    {
      address: '0x0bd7d308f8e1639fab988df18a8011f41eacad73',
      symbol: 'WETH',
      name: 'Wrapped Ether',
      decimals: 18,
      isStock: false,
    },
    {
      address: '0x5fc5360d0400a0fd4f2af552add042d716f1d168',
      symbol: 'USDG',
      name: 'Global Dollar',
      decimals: 6,
      isStock: false,
    },
    {
      address: '0xaf3d76f1834a1d425780943c99ea8a608f8a93f9',
      symbol: 'AAPL',
      name: 'Apple Stock Token',
      decimals: 18,
      isStock: true,
    },
    {
      address: '0x12f190a9f9d7d37a250758b26824b97ce941bf54',
      symbol: 'AMZN',
      name: 'Amazon Stock Token',
      decimals: 18,
      isStock: true,
    },
    {
      address: '0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec',
      symbol: 'NVDA',
      name: 'NVIDIA Stock Token',
      decimals: 18,
      isStock: true,
    },

  ],
}

export const MANCER_FEE_CONVERTER_DEPLOYMENTS: Record<number, Address | undefined> = {
  4663: '0x5f3b7E837f2d5b6C38E78eE4f45BD140A226656e',
  46630: undefined,
}

export const MANCER_ROUTER_DEPLOYMENTS: Record<number, Address | undefined> = {

  4663: '0xa62858659C83095Eb5E702f0Af6a7Bb7F370B3e7',
  46630: undefined,
}

export const MANCER_ROUTER_ALLOWANCE_TARGETS: Record<number, Readonly<Record<string, Address>> | undefined> = {
  4663: { '0xa62858659c83095eb5e702f0af6a7bb7f370b3e7': '0x4c16269006dB0DD87e6aE3C8A014B2807Aa2e388' },
  46630: undefined,
}

export function pinnedAllowanceTarget(chainId: number, router: Address): Address | null {
  return MANCER_ROUTER_ALLOWANCE_TARGETS[chainId]?.[router.toLowerCase()] ?? null
}

export const MANCER_ROUTER_LEGACY_ENTRY_SIGNATURES: Record<number, readonly string[]> = {
  4663: ['exactInputSingle((address,address,int24,address,uint256,uint256,uint256,uint160))'],
}

export const MANCER_V4_POOL_MANAGER_ADAPTER_DEPLOYMENTS: Record<number, Address | undefined> = {
  4663: '0x56aD09F5226873c660aBaf2ACe83279eb145234F',
  46630: undefined,
}

export interface RouterBoundAdapterDeployment {
  router: Address
  adapter: Address
}

export const MANCER_UP33_CL_ADAPTER_DEPLOYMENTS: Record<
  number,
  RouterBoundAdapterDeployment | undefined
> = {
  4663: {
    router: '0xa62858659C83095Eb5E702f0Af6a7Bb7F370B3e7',
    adapter: '0x71Ef50456ECe598008F66b569baA8F90Ba1CBaA1',
  },
  46630: undefined,
}

export const MANCER_LIVE_AMOUNT_ADAPTER_DEPLOYMENTS: Record<
  number,
  RouterBoundAdapterDeployment | undefined
> = {
  4663: {
    router: '0xa62858659C83095Eb5E702f0Af6a7Bb7F370B3e7',
    adapter: '0xEc5100C67Fb12368ABF74A6020E21b545a5dA93C',
  },
  46630: undefined,
}

export const MANCER_V2_PAIR_ADAPTER_DEPLOYMENTS: Record<
  number,
  RouterBoundAdapterDeployment | undefined
> = {
  4663: {
    router: '0xa62858659C83095Eb5E702f0Af6a7Bb7F370B3e7',
    adapter: '0xc695146B88Cf89721a5975BD295f303249d89ad7',
  },
  46630: undefined,
}

export const MANCER_DIRECT_POOL_EXECUTOR_DEPLOYMENTS: Record<
  number,
  RouterBoundAdapterDeployment | undefined
> = {
  4663: {
    router: '0xa62858659C83095Eb5E702f0Af6a7Bb7F370B3e7',
    adapter: '0xA997232f4607A6fC3D512a3dfAe567384AC26B8C',
  },
  46630: undefined,
}

export const MANCER_INTEGRATOR_FEE_DEPLOYMENTS: Record<number, Address | undefined> = {
  4663: '0x2542ED17313B265EB2658C2ac101E8855c4c3D22',
  46630: undefined,
}

export interface RecordedAdapter {
  address: Address
  adapter: 'v4-pool-manager' | 'metric' | 'infinity-cl'
}
export const MANCER_ENV_NAMED_ADAPTERS: Record<number, readonly RecordedAdapter[] | undefined> = {
  4663: [
    { address: '0xaD64899F8b144D0B6614a9fd4C370dB6AE6Bf91B', adapter: 'v4-pool-manager' },
    { address: '0x9a131F3B0D4fa0995dd579C01A12A33c09979824', adapter: 'metric' },
    { address: '0xf6B899F3b0182bE923507B323C408aEbC062278f', adapter: 'infinity-cl' },
    { address: '0x476D6c45A5A2837994C0f8fb8d5D81e5dBedF56b', adapter: 'infinity-cl' },
  ],
  46630: undefined,
}

export const MANCER_ROUTER_V1_DEPLOYMENTS: Record<number, readonly Address[]> = {
  4663: ['0x2e8e97fa55f9cab71b210e69c7800cfe95d036c8'],
}

export function isV1Router(chainId: number, router: Address): boolean {
  const r = router.toLowerCase()
  return (MANCER_ROUTER_V1_DEPLOYMENTS[chainId] ?? []).some((a) => a.toLowerCase() === r)
}

export const MANCER_ORDERS_DEPLOYMENTS: Record<number, Address | undefined> = {

  4663: '0xf300A6549Cd46206629e6719d3f258022d7F2da1',
  46630: undefined,
}

export const MANCER_ORDERS_EXECUTORS: Record<number, readonly Address[] | undefined> = {
  4663: ['0x1Fba2e657088a89e75EdfF0f722AbfA4d894Cd75'],
  46630: undefined,
}

export const V3_FEE_TIERS = [100, 500, 3000, 10000] as const
