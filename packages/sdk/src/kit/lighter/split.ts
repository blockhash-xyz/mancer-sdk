// SPDX-License-Identifier: MIT
// Part of Mancer's contracts kit as the SDK uses it, mirrored with the rest of this repository at each release.
import { LIGHTER_SIGNER } from './deployments'

export const MANCER_SPLIT_SIGNER = {
  build: 'wasm',
  source: 'packages/perps-split',
  lighterGoCommit: LIGHTER_SIGNER.sourceCommit,
  poseidonCrypto: 'v0.0.15',
  goVersion: LIGHTER_SIGNER.goVersion,
  wasm: {
    sha256: 'ce8a29f8b39377264eae5aa0e1513ee385aee17cd577afaf6936ab9a021622f7',
    bytes: 8_882_189,
    file: 'mancer-split-ce8a29f8.wasm',
  },
  runtime: LIGHTER_SIGNER.runtime,

  path: '/lighter-split/',
} as const

export const SPLIT_TRADER = 1 as const
export const SPLIT_MANCER = 2 as const

export type SplitHex = string

export interface SplitKeyGenMsg {
  party: 1 | 2
  context: string
  public: SplitHex
  popR: SplitHex
  popZ: SplitHex
}

export interface SplitShare {
  party: 1 | 2
  context: string
  secret: SplitHex
  public: SplitHex
  peerParty: 1 | 2
  peerPublic: SplitHex

  group: SplitHex
}

export interface SplitCommitment {
  party: 1 | 2
  d: SplitHex
  f: SplitHex
}

export interface SplitPartial {
  party: 1 | 2
  z: SplitHex
}

export interface SplitAnswer {
  txType: number

  hash: string
  commitment: SplitCommitment
  partial: SplitPartial
}

export const SPLIT_KINDS = ['create-order', 'cancel-order', 'cancel-all-orders', 'modify-order', 'update-leverage', 'update-margin'] as const
export type SplitKind = (typeof SPLIT_KINDS)[number]

export interface SplitTx {
  chainId: number
  kind: SplitKind
  accountIndex: number
  apiKeyIndex: number
  nonce: number
  expiredAt: number
  params: Record<string, number | boolean | null>
}

export interface SplitSigned {
  txType: number
  txInfo: string
  txHash: string
}

export class SplitSignerError extends Error {
  constructor(
    readonly fn: string,
    readonly words: string,
  ) {
    super(`${fn}: ${words}`)
    this.name = 'SplitSignerError'
  }
}

export class SplitSignerDeadError extends Error {
  constructor(readonly fn: string) {
    super(`the split signer stopped inside ${fn}`)
    this.name = 'SplitSignerDeadError'
  }
}

export class SplitSignerPinError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SplitSignerPinError'
  }
}

export const SPLIT_EXPORTS = [
  'MancerSplitKeyGenStart',
  'MancerSplitKeyGenFinish',
  'MancerSplitLoad',
  'MancerSplitDrop',
  'MancerSplitForget',
  'MancerSplitCommit',
  'MancerSplitFinish',
  'MancerSplitTxHash',
  'MancerSplitVerifyPop',
  'MancerSplitJoin',
  'MancerSplitVerify',
  'MancerSplitServiceKeyGen',
  'MancerSplitServiceSign',
] as const
export type SplitExport = (typeof SPLIT_EXPORTS)[number]

export interface SplitSigner {
  readonly wasmSha256: string
  readonly exited: boolean

  keyGenStart(context: string): SplitKeyGenMsg
  keyGenFinish(context: string, peer: SplitKeyGenMsg): { share: SplitShare; group: SplitHex }

  load(share: SplitShare): { group: SplitHex; public: SplitHex; peerPublic: SplitHex; context: string }

  drop(group: SplitHex): void

  forget(group: SplitHex, session: string): void
  commit(group: SplitHex): { session: string; commitment: SplitCommitment }
  finish(group: SplitHex, chainId: number, session: string, own: SplitCommitment, tx: SplitTx, answer: SplitAnswer): SplitSigned

  txHash(tx: SplitTx): { txType: number; hash: string }
  verifyPop(msg: SplitKeyGenMsg): { public: SplitHex; party: number; context: string }
  join(a: SplitHex, b: SplitHex): SplitHex
  verify(txType: number, txInfo: string, chainId: number, key: SplitHex): void

  serviceKeyGen(context: string, peer: SplitKeyGenMsg): { msg: SplitKeyGenMsg; share: SplitShare }
  serviceSign(share: SplitShare, chainId: number, tx: SplitTx, peer: SplitCommitment, hash: string): SplitAnswer
}

export interface SplitModule {
  exportOf(name: string): unknown
  exited(): boolean
}

const HEX40 = /^[0-9a-f]{80}$/
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

export function splitKeyHex(h: SplitHex): `0x${string}` {
  if (!HEX40.test(h)) throw new Error('not 40 bytes of hex')
  return `0x${h}`
}

export function splitHexOf(key: string): SplitHex {
  const h = key.toLowerCase().replace(/^0x/, '')
  if (!HEX40.test(h)) throw new Error('not 40 bytes of hex')
  return h
}

function hex40(v: unknown, what: string): SplitHex {
  if (typeof v !== 'string' || !HEX40.test(v)) throw new Error(`${what} is not 40 bytes of hex`)
  return v
}

function keyGenMsgOf(v: unknown): SplitKeyGenMsg {
  if (!isObj(v) || (v.party !== 1 && v.party !== 2) || typeof v.context !== 'string') throw new Error('not a key generation message')
  return { party: v.party, context: v.context, public: hex40(v.public, 'public'), popR: hex40(v.popR, 'popR'), popZ: hex40(v.popZ, 'popZ') }
}

function shareOf(v: unknown): SplitShare {
  if (!isObj(v) || (v.party !== 1 && v.party !== 2) || (v.peerParty !== 1 && v.peerParty !== 2) || typeof v.context !== 'string') throw new Error('not a share')
  return {
    party: v.party, context: v.context, secret: hex40(v.secret, 'secret'), public: hex40(v.public, 'public'),
    peerParty: v.peerParty, peerPublic: hex40(v.peerPublic, 'peerPublic'), group: hex40(v.group, 'group'),
  }
}

function commitmentOf(v: unknown): SplitCommitment {
  if (!isObj(v) || (v.party !== 1 && v.party !== 2)) throw new Error('not a commitment')
  return { party: v.party, d: hex40(v.d, 'd'), f: hex40(v.f, 'f') }
}

export function splitCommitmentOf(v: unknown): SplitCommitment {
  if (!isObj(v) || Object.keys(v).sort().join(',') !== 'd,f,party') throw new Error('not a commitment')
  return commitmentOf(v)
}

export function splitKeyGenMsgOf(v: unknown): SplitKeyGenMsg {
  if (!isObj(v) || Object.keys(v).sort().join(',') !== 'context,party,popR,popZ,public') throw new Error('not a key generation message')
  return keyGenMsgOf(v)
}

export function splitAnswerOf(v: unknown): SplitAnswer {
  if (!isObj(v) || Object.keys(v).sort().join(',') !== 'commitment,hash,partial,txType') throw new Error('not an answer')
  if (typeof v.txType !== 'number' || !Number.isInteger(v.txType) || typeof v.hash !== 'string' || !HEX40.test(v.hash)) throw new Error('not an answer')
  const p = v.partial
  if (!isObj(p) || (p.party !== 1 && p.party !== 2)) throw new Error('not an answer')
  return { txType: v.txType, hash: v.hash, commitment: commitmentOf(v.commitment), partial: { party: p.party, z: hex40(p.z, 'z') } }
}

export function splitSignerOf(module: SplitModule, wasmSha256: string): SplitSigner {
  let dead = false
  const exited = () => dead || module.exited()
  const call = (fn: SplitExport, ...args: string[]): unknown => {
    if (exited()) throw new SplitSignerDeadError(fn)
    const f = module.exportOf(fn)
    if (typeof f !== 'function') throw new SplitSignerDeadError(fn)
    let r: unknown
    try {
      r = (f as (...a: string[]) => unknown)(...args)
    } catch {
      dead = true
      throw new SplitSignerDeadError(fn)
    }
    if (!isObj(r)) throw new SplitSignerDeadError(fn)
    if (typeof r.error === 'string') throw new SplitSignerError(fn, r.error.replace(/[^\x20-\x7e]/g, ' ').slice(0, 300))
    if (typeof r.json !== 'string') throw new SplitSignerDeadError(fn)
    return JSON.parse(r.json)
  }
  const obj = (fn: SplitExport, ...args: string[]): Record<string, unknown> => {
    const r = call(fn, ...args)
    if (!isObj(r)) throw new SplitSignerError(fn, 'answered no object')
    return r
  }
  const j = JSON.stringify
  return {
    wasmSha256,
    get exited() {
      return exited()
    },
    keyGenStart(context) {
      return keyGenMsgOf(obj('MancerSplitKeyGenStart', context).msg)
    },
    keyGenFinish(context, peer) {
      const r = obj('MancerSplitKeyGenFinish', context, j(peer))
      return { share: shareOf(r.share), group: hex40(r.group, 'group') }
    },
    load(share) {
      const r = obj('MancerSplitLoad', j(share))
      return { group: hex40(r.group, 'group'), public: hex40(r.public, 'public'), peerPublic: hex40(r.peerPublic, 'peerPublic'), context: String(r.context) }
    },
    drop(group) {
      obj('MancerSplitDrop', group)
    },
    forget(group, session) {
      obj('MancerSplitForget', group, session)
    },
    commit(group) {
      const r = obj('MancerSplitCommit', group)
      if (typeof r.session !== 'string') throw new SplitSignerError('MancerSplitCommit', 'answered no session')
      return { session: r.session, commitment: commitmentOf(r.commitment) }
    },
    finish(group, chainId, session, own, tx, answer) {
      const r = obj('MancerSplitFinish', group, String(chainId), session, j(own), j(tx), j(answer))
      if (typeof r.txType !== 'number' || typeof r.txInfo !== 'string' || typeof r.txHash !== 'string') throw new SplitSignerError('MancerSplitFinish', 'answered no transaction')
      return { txType: r.txType, txInfo: r.txInfo, txHash: r.txHash }
    },
    txHash(tx) {
      const r = obj('MancerSplitTxHash', j(tx))
      if (typeof r.txType !== 'number' || typeof r.hash !== 'string' || !HEX40.test(r.hash)) throw new SplitSignerError('MancerSplitTxHash', 'answered no hash')
      return { txType: r.txType, hash: r.hash }
    },
    verifyPop(msg) {
      const r = obj('MancerSplitVerifyPop', j(msg))
      return { public: hex40(r.public, 'public'), party: Number(r.party), context: String(r.context) }
    },
    join(a, b) {
      return hex40(obj('MancerSplitJoin', a, b).group, 'group')
    },
    verify(txType, txInfo, chainId, key) {
      obj('MancerSplitVerify', String(txType), txInfo, String(chainId), key)
    },
    serviceKeyGen(context, peer) {
      const r = obj('MancerSplitServiceKeyGen', context, j(peer))
      return { msg: keyGenMsgOf(r.msg), share: shareOf(r.share) }
    },
    serviceSign(share, chainId, tx, peer, hash) {
      const r = obj('MancerSplitServiceSign', j(share), String(chainId), j(tx), j(peer), hash)
      return splitAnswerOf({ txType: r.txType, hash: r.hash, commitment: r.commitment, partial: r.partial })
    },
  }
}

export async function splitSha256(bytes: Uint8Array): Promise<string> {
  const subtle = (globalThis as { crypto?: { subtle?: { digest(a: string, b: Uint8Array): Promise<ArrayBuffer> } } }).crypto?.subtle
  if (!subtle) throw new SplitSignerPinError('no WebCrypto here to check the split signer against its pin')
  const d = new Uint8Array(await subtle.digest('SHA-256', bytes))
  return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function splitFilesProblem(files: { wasm: Uint8Array; runtime: string | Uint8Array }): Promise<string | null> {
  if (files.wasm.length !== MANCER_SPLIT_SIGNER.wasm.bytes || (await splitSha256(files.wasm)) !== MANCER_SPLIT_SIGNER.wasm.sha256) return 'the split signer is not the pinned build'
  const rt = typeof files.runtime === 'string' ? new TextEncoder().encode(files.runtime) : files.runtime
  if ((await splitSha256(rt)) !== MANCER_SPLIT_SIGNER.runtime.sha256) return "the split signer's runtime is not the pinned one"
  return null
}

type GoInstance = { importObject: object; exited?: boolean; run(instance: object): Promise<void> }

export async function startSplitSigner(files: { wasm: Uint8Array; runtime: string }, evaluate: (code: string) => void): Promise<SplitSigner> {
  const problem = await splitFilesProblem(files)
  if (problem) throw new SplitSignerPinError(problem)
  const G = globalThis as unknown as Record<string, unknown>
  evaluate(files.runtime)
  const GoClass = G.Go as (new () => GoInstance) | undefined
  if (typeof GoClass !== 'function') throw new SplitSignerPinError("the split signer's runtime did not load")
  const go = new GoClass()
  const wasmApi = G.WebAssembly as { instantiate(b: Uint8Array, i: object): Promise<{ instance: object }> }
  const { instance } = await wasmApi.instantiate(files.wasm, go.importObject)
  let ended = false
  void go.run(instance).then(
    () => (ended = true),
    () => (ended = true),
  )
  for (const name of SPLIT_EXPORTS) if (typeof G[name] !== 'function') throw new SplitSignerPinError(`the split signer has no ${name}`)
  return splitSignerOf({ exportOf: (n) => G[n], exited: () => ended || !!go.exited }, MANCER_SPLIT_SIGNER.wasm.sha256)
}
