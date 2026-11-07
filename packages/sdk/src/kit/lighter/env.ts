// SPDX-License-Identifier: MIT
// Part of Mancer's contracts kit as the SDK uses it, mirrored with the rest of this repository at each release.
export const LIGHTER_ENVS = ['rh-mainnet', 'rh-testnet', 'lighter-testnet'] as const
export type LighterEnv = (typeof LIGHTER_ENVS)[number]

export interface LighterEnvironment {
  id: LighterEnv

  name: string

  restUrl: string

  wsUrl: string

  chainId: number

  depositChainId: number | null

  webApp: string
}

export const LIGHTER_RH_MAINNET_CHAIN_ID = 466324
export const LIGHTER_TESTNET_CHAIN_ID = 300

export const LIGHTER_ENVIRONMENTS: Readonly<Record<LighterEnv, LighterEnvironment>> = {
  'rh-mainnet': {
    id: 'rh-mainnet',
    name: 'Lighter RH',
    restUrl: 'https://api.rh.lighter.xyz',
    wsUrl: 'wss://api.rh.lighter.xyz/stream',
    chainId: LIGHTER_RH_MAINNET_CHAIN_ID,
    depositChainId: 4663,
    webApp: 'https://robinhoodchain.lighter.xyz',
  },
  'rh-testnet': {
    id: 'rh-testnet',
    name: 'Lighter RH testnet',
    restUrl: 'https://api.rh-testnet.lighter.xyz',
    wsUrl: 'wss://api.rh-testnet.lighter.xyz/stream',
    chainId: LIGHTER_TESTNET_CHAIN_ID,
    depositChainId: null,
    webApp: 'https://rhctestnet.lighter.xyz',
  },
  'lighter-testnet': {
    id: 'lighter-testnet',
    name: 'Lighter testnet',
    restUrl: 'https://testnet.zklighter.elliot.ai',
    wsUrl: 'wss://testnet.zklighter.elliot.ai/stream',
    chainId: LIGHTER_TESTNET_CHAIN_ID,
    depositChainId: null,
    webApp: 'https://testnet.app.lighter.xyz',
  },
}

export function isLighterEnv(v: unknown): v is LighterEnv {
  return typeof v === 'string' && (LIGHTER_ENVS as readonly string[]).includes(v)
}

export function lighterEnvironment(id: LighterEnv): LighterEnvironment {
  const env = LIGHTER_ENVIRONMENTS[id]
  if (!env) throw new Error(`no Lighter environment ${String(id)}`)
  return env
}

export function lighterReadOnlyStreamUrl(env: Pick<LighterEnvironment, 'wsUrl'>): string {
  return `${env.wsUrl}?readonly=true`
}

export function lighterEnvironmentMismatch(given: { id?: unknown; restUrl?: unknown; wsUrl?: unknown; chainId?: unknown }): string | null {
  if (!isLighterEnv(given.id)) return 'the environment is none of the kit’s'
  const env = LIGHTER_ENVIRONMENTS[given.id]
  if (given.restUrl !== env.restUrl) return 'the REST URL is not the environment’s'
  if (given.wsUrl !== env.wsUrl) return 'the WebSocket is not the environment’s'
  if (given.chainId !== env.chainId) return 'the signing chain id is not the environment’s'
  return null
}
