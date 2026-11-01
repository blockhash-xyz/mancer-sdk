import { inspect } from 'node:util'
import type { Address } from 'viem'

/**
 * One MCP connection's sign-in: the agent's own wallet signed Mancer's sign-in message through `sign_in` and
 * `complete_sign_in`, and the session token the API answered is kept here, for this connection alone, and sent on its
 * calls. The token never leaves this object but as the `Authorization` header of a call to the API: no tool answer, log
 * line or refusal carries it, and the object prints and serializes without it. A stdio server holds one; a Streamable
 * HTTP server one for each MCP session id, dropped when the connection ends or has been idle past its bound, and none
 * outlives the process: a restart means the agent signs in again. Over HTTP the sign-in lives with the session id and
 * nothing else: whoever holds the id holds the sign-in, as a bearer holds a token, until `sign_out` ends it (or the
 * session ends). The id is the transport's own, a random UUID that crosses only the client's connection.
 */

/** A sign-in begun and not yet completed: the message the wallet signs, and its nonce. A nonce lives ten minutes. */
export interface PendingSignIn {
  wallet: Address
  nonce: string
  message: string
  /** When it was begun, in ms. */
  at: number
}

/** A sign-in the API answered: whom it names and when it ends. The token is kept apart. */
export interface SignedIn {
  wallet: Address
  account: Address | null
  /** Seconds. */
  expiresAt: number
}

/** A Book's record this connection saved (`create_book_draft`): what the open it builds later is held to. */
export interface SavedDraft {
  factory: Address
  name: string
  symbol: string
}

/** What a process that holds many connections says of their sign-ins (http.ts): whether one may sign in now, and that one
 * did. A stdio server holds one connection and sets none. */
export interface SignInGuard {
  /** Null where the connection may sign in as the wallet now, else the sentence of the refusal. */
  admit(connection: Connection, wallet: Address): string | null
  /** Told once the connection's sign-in completed. */
  signedIn(connection: Connection, wallet: Address): void
}

export const PENDING_SIGN_IN_MS = 10 * 60_000
/** The records a connection keeps of the drafts it saved: the newest few. */
const DRAFTS_KEPT = 16
/** A session this close to its end is not sent: the agent is asked to sign in again. */
export const SESSION_MARGIN_SEC = 60

export class Connection {
  readonly id: string
  #token: string | null = null
  #signedIn: SignedIn | null = null
  #pending: PendingSignIn | null = null
  readonly #drafts = new Map<string, SavedDraft>()
  #lastSeen: number
  readonly #now: () => number
  /** The process's word on this connection's sign-ins, where it holds many (http.ts). */
  guard: SignInGuard | null = null

  constructor(id: string, now: () => number = () => Date.now()) {
    this.id = id
    this.#now = now
    this.#lastSeen = now()
  }

  /** When this connection last asked for anything, in ms. */
  get lastSeen(): number {
    return this.#lastSeen
  }

  touch(): void {
    this.#lastSeen = this.#now()
  }

  /** The sign-in in force, or null where none is or it has run out. */
  signedIn(): SignedIn | null {
    const s = this.#signedIn
    if (!s) return null
    if (s.expiresAt - this.#now() / 1000 <= SESSION_MARGIN_SEC) {
      this.endSession()
      return null
    }
    return s
  }

  /** The session token to send, where a sign-in is in force. The asker alone reads it (api.ts). */
  sessionToken(): string | null {
    return this.signedIn() ? this.#token : null
  }

  begin(p: Omit<PendingSignIn, 'at'>): PendingSignIn {
    this.#pending = { ...p, at: this.#now() }
    return this.#pending
  }

  /** The sign-in begun, while its nonce lives. */
  pending(): PendingSignIn | null {
    const p = this.#pending
    if (p && this.#now() - p.at > PENDING_SIGN_IN_MS) this.#pending = null
    return this.#pending
  }

  complete(token: string, s: SignedIn): void {
    this.#token = token
    this.#signedIn = s
    this.#pending = null
    this.guard?.signedIn(this, s.wallet)
  }

  /** Keeps a draft this connection saved, by its id. */
  rememberDraft(id: string, d: SavedDraft): void {
    this.#drafts.delete(id)
    this.#drafts.set(id, d)
    while (this.#drafts.size > DRAFTS_KEPT) this.#drafts.delete(this.#drafts.keys().next().value!)
  }

  /** A draft this connection saved, or null. */
  draft(id: string): SavedDraft | null {
    return this.#drafts.get(id) ?? null
  }

  /** Forgets the session the API answered (it ran out, or the API refused it); a sign-in begun beside it stands. */
  endSession(): void {
    this.#token = null
    this.#signedIn = null
  }

  /** Forgets the sign-in and any begun. It ends nothing on Mancer's side: the token is forgotten, never sent again. */
  signOut(): void {
    this.#token = null
    this.#signedIn = null
    this.#pending = null
    this.#drafts.clear()
  }

  toJSON(): Record<string, unknown> {
    const s = this.signedIn()
    return { id: this.id, signedIn: s !== null, wallet: s?.wallet ?? null }
  }

  [inspect.custom](): string {
    return `Connection ${JSON.stringify(this.toJSON())}`
  }
}
