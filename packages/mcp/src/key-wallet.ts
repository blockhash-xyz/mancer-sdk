import { createHash } from 'node:crypto'
import type { Address } from 'viem'
import type { Asker } from './api'

/**
 * The wallet a wallet key acts as, which a tool defaults to where no wallet is signed in on the connection and none is
 * named (server.ts, tool.ts `walletOf`). A key a wallet's sign-in minted (mancer.xyz/account, the app, `/v1/me/api-keys`)
 * acts as that wallet, and the API's `GET /auth/me` names it (`address`), asked with the key itself. A partner's key acts as
 * no wallet (401, `no-wallet`), and a key without the `read` scope may not ask (403, `no-read`): each defaults to nothing,
 * and the tool names its wallet as before. An ask that got no answer is `unread`, and the tool may be called again.
 *
 * Each answer is kept by the key's sha-256, never the key: a wallet five minutes, no wallet one minute. A paused or deleted
 * key is the API's to refuse at once on every call it carries; only the default lags. A failure to reach the API, a 429 or
 * a 5xx is kept for nothing, and a tool that needed the default refuses `key-wallet-unread`, to be asked again. One process keeps 4,096 keys at the most, the oldest
 * going first, and one ask a key is in flight at a time.
 */

export const KEY_WALLET_KEEP_MS = 5 * 60_000
export const KEY_NO_WALLET_KEEP_MS = 60_000
const KEPT_MAX = 4_096
const ADDRESS = /^0x[0-9a-fA-F]{40}$/

/** What a key's ask read: the wallet, or why there is none. */
export type KeyWallet = { wallet: Address; why: 'ok' } | { wallet: null; why: 'no-wallet' | 'no-read' | 'unread' }

export class KeyWallets {
  readonly #now: () => number
  readonly #kept = new Map<string, { read: KeyWallet; until: number }>()
  readonly #asking = new Map<string, Promise<KeyWallet>>()

  constructor(now: () => number = () => Date.now()) {
    this.#now = now
  }

  /** The wallet `bearer` acts as, asked through `ask` (the call's own asker, which sends that key) where none is kept. */
  async of(bearer: string, ask: Asker): Promise<KeyWallet> {
    const id = createHash('sha256').update(bearer).digest('hex')
    const kept = this.#kept.get(id)
    if (kept && kept.until > this.#now()) return kept.read
    const asking = this.#asking.get(id)
    if (asking) return asking
    const p = this.#ask(id, ask).finally(() => this.#asking.delete(id))
    this.#asking.set(id, p)
    return p
  }

  async #ask(id: string, ask: Asker): Promise<KeyWallet> {
    let answer: Awaited<ReturnType<Asker>>
    try {
      answer = await ask({ method: 'GET', path: '/auth/me' })
    } catch {
      return { wallet: null, why: 'unread' }
    }
    // the asker sends the connection's credential as it stands when the ask goes out: an answer read with a sign-in that
    // landed in between is that session's word, never the key's, and is kept for nothing
    if (answer.usedSession) return { wallet: null, why: 'unread' }
    const { status, body } = answer
    let read: KeyWallet
    if (status === 200) {
      const address = (body as { address?: unknown } | null)?.address
      read = typeof address === 'string' && ADDRESS.test(address) ? { wallet: address.toLowerCase() as Address, why: 'ok' } : { wallet: null, why: 'no-wallet' }
    } else if (status === 401) {
      read = { wallet: null, why: 'no-wallet' }
    } else if (status === 403) {
      read = { wallet: null, why: 'no-read' }
    } else {
      return { wallet: null, why: 'unread' }
    }
    this.#keep(id, read, read.wallet ? KEY_WALLET_KEEP_MS : KEY_NO_WALLET_KEEP_MS)
    return read
  }

  #keep(id: string, read: KeyWallet, ms: number): void {
    this.#kept.delete(id)
    this.#kept.set(id, { read, until: this.#now() + ms })
    while (this.#kept.size > KEPT_MAX) this.#kept.delete(this.#kept.keys().next().value!)
  }
}
