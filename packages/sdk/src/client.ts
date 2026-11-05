import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  type Account,
  type Address,
  type Hex,
  type PublicClient,
  type Transport,
  type WalletClient,
} from 'viem'
import { sessionClaims, signInMessageMismatch, type SessionClaims } from './auth'
import { contractsMismatch, pinnedContracts, readCodeHashes, type TrustedContracts } from './contracts'
import { MancerCheckError, MancerError, SDK_ERROR_CODES, readRateLimit, type RateLimitInfo } from './errors'
import { OPERATIONS, type Contracts, type OperationId, type Operations } from './generated/openapi'
import { BOOK_DEPLOYMENTS, launchAdapterDeployment, robinhoodChain, type BookDeployment } from './shared'

/** A Smart Launch pad's quote token (constructor state, read back beside its code hash). */
const PAD_QUOTE_ABI = parseAbi(['function quote() view returns (address)'])

/** Mancer's API. */
export const DEFAULT_BASE_URL = 'https://api.mancer.xyz'
/** Robinhood Chain's public RPC, which needs no key. */
export const DEFAULT_RPC_URL = 'https://rpc.mainnet.chain.robinhood.com'
/** Mancer's own API origins: the only hosts a client signs Mancer's sign-in for, unless it names a domain itself. */
export const MANCER_API_ORIGINS: readonly string[] = ['https://api.mancer.xyz']

export interface MancerOptions {
  /** The API's origin. Default https://api.mancer.xyz. */
  baseUrl?: string
  /** An API key issued to you, sent as `Authorization: Bearer`. Kept on your servers: it never belongs in a browser. */
  apiKey?: string
  /** A session token you already hold, from an earlier sign-in. */
  session?: string
  /**
   * The bot's own viem account. It signs in, signs orders and cancels, and signs every step it sends. The SDK never
   * logs, sends or stores its key: a local account signs on this machine, and only signatures and transactions leave it.
   */
  account?: Account
  /** Sends the steps; default, one made from `account` over `rpcUrl`. */
  walletClient?: WalletClient
  /** Reads the chain: receipts, code hashes, the maker's epoch. Default, one over `rpcUrl`. */
  publicClient?: PublicClient
  /** The chain's RPC for the clients the SDK makes. Default Robinhood Chain's public RPC. */
  rpcUrl?: string
  /** Default, the global fetch (Node 22, every browser). */
  fetch?: typeof fetch
  /** Sign in again this long before the session ends, in seconds. Default 3600. */
  signInMarginSeconds?: number
  /** How long one request may take, in milliseconds. Default 30,000. */
  timeoutMs?: number
  /** Told the rate bucket nearest its end on every answer that names one. */
  onRateLimit?: (info: RateLimitInfo) => void
  /** The contracts every check holds a build to. Default, the kit's pins for chain 4663: name others only to run against
   * a local stand-in of the chain. */
  trusted?: TrustedContracts
  /**
   * The domain the sign-in message must name. Unset, the client signs Mancer's sign-in (`mancer.xyz`) only where
   * `baseUrl` is one of Mancer's own API origins, and refuses for any other host. Name a domain only to sign in on
   * purpose to another host, such as a local stand-in of the API in a test.
   */
  signInDomain?: string
  /** The Books deployments a Book's act is held to. Default, the kit's pins: name others only to run against a local
   * stand-in of the chain. */
  bookDeployments?: readonly BookDeployment[]
}

export interface RequestOptions {
  query?: Record<string, string | number | bigint | boolean | null | undefined>
  /** A JSON body. */
  body?: unknown
  headers?: Record<string, string>
  /** Sent as `Idempotency-Key` on the writes that take one: the same request sent again with it runs once. */
  idempotencyKey?: string
  /** What credential the route takes. `required` signs in first where the client has an account and no credential. */
  auth?: 'none' | 'optional' | 'required'
  signal?: AbortSignal
}

export interface Answer<T> {
  data: T
  status: number
  headers: Headers
  requestId: string | null
  rateLimit: RateLimitInfo | null
  /** True where the answer is the one kept for the request's Idempotency-Key, and the write did not run again. */
  replayed: boolean
}

export interface Session extends SessionClaims {
  token: string
  /** The account the wallet signed in to, where the sign-in named it. */
  account: Address | null
}

type CallArgs<K extends OperationId> = {
  [P in 'pathParams' | 'query' | 'body' as Operations[K][P] extends never ? never : P extends 'pathParams' ? 'path' : P]?: Operations[K][P]
} & { headers?: Record<string, string>; idempotencyKey?: string; signal?: AbortSignal }

/** A random 128-bit key, for the writes the SDK sends with an `Idempotency-Key` of its own. */
export function newIdempotencyKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return `sdk-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`
}

/**
 * A client of Mancer's API for one bot or one server. With an `account`, it signs in with the wallet and signs in again
 * before the session ends; with an `apiKey`, every request carries the key. Its helpers (swaps, orders, transfers, Books,
 * events) check every build and every order against what was asked for before anything is signed.
 */
export class MancerClient {
  readonly baseUrl: string
  readonly account: Account | null
  readonly publicClient: PublicClient
  readonly walletClient: WalletClient | null
  readonly #fetch: typeof fetch
  readonly #timeoutMs: number
  readonly #marginSec: number
  readonly #onRateLimit: ((info: RateLimitInfo) => void) | undefined
  readonly #pinned: TrustedContracts | null
  readonly #signInDomain: string | null
  /** The Books deployments this client trusts. */
  readonly bookDeployments: readonly BookDeployment[]
  #launchStack: Promise<void> | null = null
  #apiKey: string | null
  #session: Session | null = null
  #signingIn: Promise<Session> | null = null
  #contracts: Promise<TrustedContracts> | null = null
  /** The last rate bucket an answer named. */
  lastRateLimit: RateLimitInfo | null = null

  constructor(options: MancerOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
    this.account = options.account ?? null
    this.#apiKey = options.apiKey ?? null
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis)
    this.#timeoutMs = options.timeoutMs ?? 30_000
    this.#marginSec = options.signInMarginSeconds ?? 3_600
    this.#onRateLimit = options.onRateLimit
    this.#pinned = options.trusted ?? pinnedContracts(robinhoodChain.id)
    this.#signInDomain = options.signInDomain ?? null
    this.bookDeployments = options.bookDeployments ?? BOOK_DEPLOYMENTS
    const transport: Transport = http(options.rpcUrl ?? DEFAULT_RPC_URL)
    this.publicClient = options.publicClient ?? (createPublicClient({ chain: robinhoodChain, transport }) as PublicClient)
    this.walletClient = options.walletClient ?? (this.account ? createWalletClient({ account: this.account, chain: robinhoodChain, transport }) : null)
    if (options.session) this.useSession(options.session)
  }

  // ------------------------------------------------------------------------------------------------- the credential

  /** The session in use, or null. */
  get session(): Session | null {
    return this.#session
  }

  /** Use a session token you hold. */
  useSession(token: string, account: Address | null = null): Session {
    const claims = sessionClaims(token)
    if (!claims) throw new MancerCheckError('sign-in', 'the token is no session token')
    this.#session = { ...claims, token, account }
    return this.#session
  }

  /** Use an API key from now on, or none. */
  useApiKey(key: string | null): void {
    this.#apiKey = key
  }

  /** Forget the session this client holds. It is not ended on Mancer's side: `revokeSessions` does that. */
  forgetSession(): void {
    this.#session = null
  }

  /** The wallet that signs: the account's address. */
  get wallet(): Address {
    if (!this.account) throw new MancerCheckError('wallet', 'this client has no account to sign with')
    return this.account.address
  }

  /**
   * Sign in with the account: `GET /auth/nonce`, the message checked line by line, `personal_sign`, `POST /auth/verify`.
   * The message is signed only where it is Mancer's sign-in for this wallet, chain 4663 and the nonce just issued.
   */
  async signIn(): Promise<Session> {
    if (this.#signingIn) return this.#signingIn
    this.#signingIn = (async () => {
      const wallet = this.wallet
      const origin = new URL(this.baseUrl).origin
      if (!this.#signInDomain && !MANCER_API_ORIGINS.includes(origin)) {
        throw new MancerCheckError('sign-in', `this client talks to ${origin}, which is not Mancer's API: it signs no Mancer sign-in there (name signInDomain to sign in to another host on purpose)`)
      }
      const { data: n } = await this.request<{ nonce: string; message: string }>('GET', '/auth/nonce', { query: { address: wallet }, auth: 'none' })
      const wrong = signInMessageMismatch(n.message, { address: wallet, nonce: n.nonce, domain: this.#signInDomain ?? 'mancer.xyz' })
      if (wrong) throw new MancerCheckError('sign-in', wrong)
      const signature = await this.signMessage(n.message)
      const { data: v } = await this.request<{ token: string; account: Address }>('POST', '/auth/verify', {
        body: { address: wallet, signature, nonce: n.nonce },
        auth: 'none',
      })
      const session = this.useSession(v.token, v.account ?? null)
      if (session.wallet.toLowerCase() !== wallet.toLowerCase()) {
        this.#session = null
        throw new MancerCheckError('sign-in', 'the session names another wallet')
      }
      return session
    })()
    try {
      return await this.#signingIn
    } finally {
      this.#signingIn = null
    }
  }

  /**
   * End every session issued so far, and keep the fresh one returned. `scope` is `wallet` by default: this wallet's own
   * sessions, which any wallet of an account may end. `account` ends every session of every wallet the account holds, and
   * takes the account's primary wallet: a linked wallet asking it is refused `403 primary-wallet-only`. The scope named is
   * the one sent.
   */
  async revokeSessions(scope: 'account' | 'wallet' = 'wallet'): Promise<Operations['revokeSessions']['response']> {
    const { data } = await this.request<Operations['revokeSessions']['response']>('POST', '/v1/me/sessions/revoke', { body: { scope }, auth: 'required' })
    this.useSession(data.token, this.#session?.account ?? null)
    return data
  }

  /** The session's own account: its wallets, profile and what it is shown. */
  async me(): Promise<Operations['getAuthMe']['response']> {
    return (await this.request<Operations['getAuthMe']['response']>('GET', '/auth/me', { auth: 'required' })).data
  }

  /** The credential a request carries, signing in first where the route needs one and the session is missing or ends soon. */
  async #credential(auth: 'none' | 'optional' | 'required'): Promise<string | null> {
    if (auth === 'none') return null
    if (this.#apiKey) return this.#apiKey
    const now = Date.now() / 1000
    const s = this.#session
    if (s && s.expiresAt - now > this.#marginSec) return s.token
    if (this.account) {
      // a session that ends soon, or none: sign in again before it is needed
      if (auth === 'required' || s) return (await this.signIn()).token
    }
    return s && s.expiresAt > now ? s.token : null
  }

  // ------------------------------------------------------------------------------------------------- the requests

  /** One request to the API: its answer as JSON, or a `MancerError` carrying the envelope. */
  async request<T = unknown>(method: string, path: string, options: RequestOptions = {}): Promise<Answer<T>> {
    // a path under the API's own origin and nothing else: an answer that names a path (a draft's bind) can never send the
    // credential to another host, by an absolute URL, a `//host` or a backslash the URL parser reads as one
    if (typeof path !== 'string' || !/^\/(?!\/)/.test(path) || path.includes('\\')) throw new MancerCheckError('request', 'a request names a path under the API, starting with one slash')
    const url = new URL(path, `${this.baseUrl}/`)
    if (url.origin !== new URL(this.baseUrl).origin) throw new MancerCheckError('request', "a request goes to the API's own origin alone")
    for (const [k, v] of Object.entries(options.query ?? {})) {
      if (v === undefined || v === null) continue
      url.searchParams.set(k, typeof v === 'boolean' ? (v ? '1' : '0') : String(v))
    }
    const headers = new Headers(options.headers)
    headers.set('accept', 'application/json')
    const credential = await this.#credential(options.auth ?? 'optional')
    if (credential) headers.set('authorization', `Bearer ${credential}`)
    if (options.idempotencyKey) headers.set('idempotency-key', options.idempotencyKey)
    let body: BodyInit | undefined
    if (options.body instanceof Uint8Array) {
      body = options.body as unknown as BodyInit
      if (!headers.has('content-type')) headers.set('content-type', 'application/octet-stream')
    } else if (options.body !== undefined) {
      body = JSON.stringify(options.body, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))
      headers.set('content-type', 'application/json')
    }
    const label = `${method} ${url.pathname}`
    const safeToResend = method === 'GET' || !!options.idempotencyKey
    let res: Response
    try {
      const timeout = AbortSignal.timeout(this.#timeoutMs)
      const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout
      res = await this.#fetch(url, { method, headers, body, signal })
    } catch (e) {
      const timedOut = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')
      throw new MancerError({
        status: 0,
        code: timedOut ? SDK_ERROR_CODES.timeout : SDK_ERROR_CODES.network,
        message: timedOut ? 'the API did not answer in time' : 'the API could not be reached',
        retryable: safeToResend,
        request: label,
      })
    }
    const rateLimit = readRateLimit(res.headers)
    if (rateLimit) {
      this.lastRateLimit = rateLimit
      this.#onRateLimit?.(rateLimit)
    }
    const requestId = res.headers.get('x-request-id')
    // a body cut off or timed out after the headers is the request's error, named by its label: for a POST the API may
    // have done what it asked
    let text: string
    try {
      text = await res.text()
    } catch (e) {
      const timedOut = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')
      throw new MancerError({
        status: res.status,
        code: timedOut ? SDK_ERROR_CODES.timeout : SDK_ERROR_CODES.network,
        message: timedOut ? "the API's answer did not arrive whole in time" : "the API's answer could not be read whole",
        retryable: safeToResend,
        requestId,
        rateLimit,
        request: label,
      })
    }
    let json: unknown = undefined
    if (text) {
      try {
        json = JSON.parse(text)
      } catch {
        json = undefined
      }
    }
    const retryAfter = Number(res.headers.get('retry-after'))
    if (!res.ok) {
      const env = (json && typeof json === 'object' ? json : null) as { error?: unknown; code?: unknown; retryable?: unknown; retryAfterSeconds?: unknown; detail?: unknown } | null
      if (!env || typeof env.code !== 'string') {
        throw new MancerError({
          status: res.status,
          code: SDK_ERROR_CODES.notJson,
          message: `the API answered ${res.status} with no error envelope`,
          retryable: res.status >= 500 && safeToResend,
          retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter >= 0 && res.headers.has('retry-after') ? retryAfter : null,
          requestId,
          rateLimit,
          request: label,
          body: text.slice(0, 2_000),
        })
      }
      const named = typeof env.retryAfterSeconds === 'number' ? env.retryAfterSeconds : res.headers.has('retry-after') && Number.isFinite(retryAfter) ? retryAfter : null
      throw new MancerError({
        status: res.status,
        code: env.code,
        message: typeof env.error === 'string' ? env.error : 'error',
        retryable: env.retryable === true,
        retryAfterSeconds: named,
        detail: env.detail && typeof env.detail === 'object' ? (env.detail as Record<string, unknown>) : null,
        requestId,
        rateLimit,
        request: label,
        body: json,
      })
    }
    if (json === undefined && text) {
      throw new MancerError({ status: res.status, code: SDK_ERROR_CODES.notJson, message: 'the answer is not JSON', retryable: false, requestId, rateLimit, request: label })
    }
    return { data: json as T, status: res.status, headers: res.headers, requestId, rateLimit, replayed: res.headers.get('idempotent-replayed') === 'true' }
  }

  /**
   * Any operation of the reference by its operationId, typed from it: `call('getTokenDetail', { path: { address } })`.
   * Its path, method and credential are the reference's own.
   */
  async call<K extends OperationId>(id: K, args: CallArgs<K> = {} as CallArgs<K>): Promise<Operations[K]['response']> {
    const op = OPERATIONS[id]
    const a = args as { path?: Record<string, unknown>; query?: Record<string, unknown>; body?: unknown; headers?: Record<string, string>; idempotencyKey?: string; signal?: AbortSignal }
    const path = op.path.replace(/\{([^}]+)\}/g, (_m, name: string) => {
      const v = a.path?.[name]
      if (v === undefined || v === null) throw new MancerCheckError('request', `${id} needs the path parameter ${name}`)
      return encodeURIComponent(String(v))
    })
    const answer = await this.request<Operations[K]['response']>(op.method, path, {
      query: a.query as RequestOptions['query'],
      body: a.body,
      headers: a.headers,
      idempotencyKey: a.idempotencyKey,
      signal: a.signal,
      auth: op.auth,
    })
    return answer.data
  }

  // ------------------------------------------------------------------------------------------------- the signer

  /** `personal_sign` with the account. */
  async signMessage(message: string): Promise<Hex> {
    const account = this.account
    if (!account) throw new MancerCheckError('wallet', 'this client has no account to sign with')
    if (account.type === 'local') return account.signMessage({ message })
    if (!this.walletClient) throw new MancerCheckError('wallet', 'this account signs through a wallet client, and none was given')
    return this.walletClient.signMessage({ account, message })
  }

  /** EIP-712 with the account. */
  async signTypedData(typed: Parameters<WalletClient['signTypedData']>[0]): Promise<Hex> {
    const account = this.account
    if (!account) throw new MancerCheckError('wallet', 'this client has no account to sign with')
    if (account.type === 'local') return account.signTypedData(typed as never)
    if (!this.walletClient) throw new MancerCheckError('wallet', 'this account signs through a wallet client, and none was given')
    return this.walletClient.signTypedData({ ...(typed as object), account } as never)
  }

  // ------------------------------------------------------------------------------------------------- the contracts

  /** The contracts this client trusts before it has read the API or the chain: the kit's pins, or those handed in. */
  get pinned(): TrustedContracts {
    if (!this.#pinned) throw new MancerCheckError('contracts', 'this SDK pins no contracts for chain 4663')
    return this.#pinned
  }

  /** `GET /v1/contracts`: the live contracts and their code hashes, as the API names them. */
  async contracts(): Promise<Contracts> {
    return (await this.request<Contracts>('GET', '/v1/contracts', { auth: 'none' })).data
  }

  /**
   * The contracts every check holds a build to: the kit's pins, set beside `GET /v1/contracts` and the code each address
   * holds on the caller's own node. Read once and kept; a contract that differs anywhere is refused.
   */
  async trustedContracts(): Promise<TrustedContracts> {
    if (!this.#contracts) {
      this.#contracts = (async () => {
        const pinned = this.#pinned
        if (!pinned) throw new MancerCheckError('contracts', 'this SDK pins no contracts for chain 4663')
        const answer = await this.contracts()
        const wrong = contractsMismatch(answer, pinned)
        if (wrong) throw new MancerCheckError('contracts', wrong)
        const entries = [answer.router, answer.allowanceTarget, answer.orders, answer.weth, answer.usdg, answer.launchCoordinator, answer.launchAllowanceTarget].filter((e): e is NonNullable<typeof e> => !!e)
        const read = await readCodeHashes(this.publicClient, entries.map((e) => e.address as Address))
        for (const e of entries) {
          const mine = read[e.address.toLowerCase()]
          if (!mine) throw new MancerCheckError('contracts', `your node shows no code at ${e.address}`)
          if (mine.toLowerCase() !== e.codeHash.toLowerCase()) throw new MancerCheckError('contracts', `the code at ${e.address} on your node differs from the code hash the API names`)
        }
        return pinned
      })()
      this.#contracts.catch(() => {
        this.#contracts = null
      })
    }
    return this.#contracts
  }

  /** The account-bound launch stack (its coordinator, its allowance target, each pad and its adapter), each address
   * holding its reviewed code on the caller's own node. Read once, before the first launch route is checked. */
  async trustedLaunchStack(): Promise<NonNullable<TrustedContracts['launch']>> {
    const trusted = await this.trustedContracts()
    const launch = trusted.launch
    const pinned = launchAdapterDeployment(trusted.chainId)
    if (!launch || !pinned?.coordinator || !pinned.coordinatorAllowanceTarget) throw new MancerCheckError('contracts', 'this SDK pins no launch stack for the router it trusts')
    if (!this.#launchStack) {
      this.#launchStack = (async () => {
        const pins = [pinned.coordinator!, pinned.coordinatorAllowanceTarget!, ...pinned.safeLaunchV2Pads.flatMap((p) => [p.pad, p.adapter]), ...(pinned.ponsV2 ? [pinned.ponsV2.factory, pinned.ponsV2.adapter] : []), ...(pinned.safeLaunchLens ? [pinned.safeLaunchLens] : [])]
        const read = await readCodeHashes(this.publicClient, pins.map((p) => p.address))
        for (const p of pins) {
          if ((read[p.address.toLowerCase()] ?? '').toLowerCase() !== p.runtimeCodeHash.toLowerCase()) throw new MancerCheckError('contracts', `the code at ${p.address} on your node is not the launch stack's reviewed build`)
        }
        // each pad's quote token is constructor state in the code just read, and the pad says it too: a sale's round trip
        // is held to it (launch-execution.ts), so the kit's word for it is read back on your own node once
        // (a pad the kit names no quote token for is no pinned pad of TrustedContracts, and is not read)
        const quoted = pinned.safeLaunchV2Pads.filter((p) => !!p.quoteToken)
        const quotes = await Promise.all(quoted.map((p) => this.publicClient.readContract({ address: p.pad.address, abi: PAD_QUOTE_ABI, functionName: 'quote' })))
        quoted.forEach((p, i) => {
          if (quotes[i]!.toLowerCase() !== p.quoteToken.toLowerCase()) throw new MancerCheckError('contracts', `the pad at ${p.pad.address} on your node is quoted in another token than this SDK pins`)
        })
      })()
      this.#launchStack.catch(() => {
        this.#launchStack = null
      })
    }
    await this.#launchStack
    return launch
  }
}
