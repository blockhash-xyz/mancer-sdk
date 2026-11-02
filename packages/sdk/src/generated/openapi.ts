// Generated from Mancer's API reference (openapi.yaml) by scripts/gen-types.mjs. Do not edit: run
// `npm run gen:types -w @blockhash/mancer-sdk` after the reference changes. API version "1".
/* eslint-disable */

/** One transaction the wallet signs and sends itself, in the order given. An approval is a step of its own, with its calldata. */
export type ReadyStep = {
  /** What the step does: `approval`, `wrap`, `swap`, `transfer`, `cancel`, `cancelAll`, `authorization`, a Book act's name (`arm`, `redeem` and the rest), or a route's own (`buy`, `sell`, `liquidate`). */
  kind: string
  to: Address
  data: Hex
  /** Wei sent with the step. */
  value: Uint
  /** A gas limit the simulation proved, in decimal: what the step spent, 30% more and 10,000 for the L1 data share, at most 30,000,000; null where the simulation did not reach it. */
  gas: string | null
  /** One sentence. */
  why: string
}

/** What stopped the steps. */
export type ReadyStepsRevert = {
  /** The step that reverted, from 0. Null where none ran: the wallet cannot pay a step's gas at the base fee and its value (`error` `insufficient-funds`). */
  step: number | null
  kind: string | null
  /** The decoded error: a contract's own by name, `Error` with its reason, `Panic`, or `insufficient-funds`. Null where the revert carried nothing Mancer decodes. */
  error: string | null
  selector: string | null
  args: string[]
  message: string
}

/** The steps run in order from the wallet, in one block on top of the head at the head's own second, on the wallet's own balances and allowances, at the gas each names and the head's base fee. What the wallet must hold is priced at twice it (`outcome.fees`). */
export type ReadyStepsSimulation = {
  /** Whether every step ran. Steps that would revert are answered with `ok` false and `revert`, never as a refusal. */
  ok: boolean
  /** The head the steps ran on top of. */
  block: number
  /** The head's second, the chain's clock every deadline was read on. */
  timestamp: number
  /** What the steps did: each step's gas and returned word, the events (ether moved as `EthTransfer`), the fees beside the wallet's ether, the route's own facts (`received`, `payoutWei` and the rest). */
  outcome?: {
    gasUsed?: string[]
    returns?: (string | null)[]
    /** At most 64. */
    events?: {
      step: number
      address: string
      /** The event's name, or `unknown:<topic0's first four bytes>`. */
      event: string
      args: {
        [key: string]: unknown
      }
    }[]
    fees?: {
      baseFeePerGas?: string | null
      /** Twice the head's base fee. */
      maxFeePerGas?: string | null
      /** Every step's gas at `maxFeePerGas`, and every step's value. */
      needWei?: string | null
      balanceWei?: string | null
      covered?: boolean | null
    }
    [key: string]: unknown
  }
  revert?: ReadyStepsRevert
}

/** What one wallet signs and sends, in order, and the simulation that proved them at one head. Mancer signs and sends nothing. Steps are for that head and that wallet: ask again rather than keep them. */
export type ReadySteps = {
  chainId: 4663
  /** The wallet that signs and sends every step, lowercase. */
  wallet: Address
  steps: ReadyStep[]
  simulation: ReadyStepsSimulation
  /** The Mancer read that shows what the steps did, where there is one. */
  readAfter: {
    path: string
    /** The first block the steps can land in. Name the last step's receipt block as `?minBlock=` where the read takes one. */
    minBlock: number
    /** Where the read is not a GET. */
    method?: "POST"
  } | null
}

/** With `steps=1`: the steps, or why not, beside the route's own answer: `key-required` for a public read asked with no session or key, `steps-unavailable` where the chain did not answer. */
export type ReadyStepsField = ReadySteps | {
  error: string
  code: string
  detail?: {
    [key: string]: unknown
  }
}

/** A steps route's refusal or outage, its sentence and its code. Where it carries `detail.why`, that names the reason in a word (`not-the-creator`, `not-a-trader`, `already-confirmed` and the rest). */
export type StepsError = {
  error: string
  code: "bad-body" | "bad-action" | "bad-wallet" | "wallet-required" | "bad-amount" | "bad-recipient" | "recipient-not-found" | "not-an-nft" | "quote-required" | "quote-invalid" | "quote-expired" | "salt-required" | "unknown-order" | "order-not-open" | "not-eligible" | "wrong-phase" | "nothing-to-do" | "draft-not-found" | "terms-refused" | "steps-unavailable" | "bad-address" | "not-a-book" | "book-indexing" | "books-index-unavailable" | "books-state-unavailable"
  detail?: {
    [key: string]: unknown
  }
}

/** One act and the wallet that sends it. Each act takes its own fields beside `action` and `wallet`, and any other field is 400 `bad-body`. */
export type BookStepsRequest = {
  /** The act. Who may send it is checked against the Book's phase and the wallet's role; [Ready-to-sign steps](/api/guides/steps) lists each act's sender. */
  action: "arm" | "abort" | "graduate" | "bond" | "proposeTrade" | "confirmTrade" | "executeTrade" | "cancelOrder" | "revokeOrders" | "revokeAllowance" | "syncTax" | "syncTracked" | "stake" | "unstake" | "claim" | "harvest" | "sweepUnowned" | "sweepLeftover" | "redeem" | "claimCreatorCut"
  /** The wallet that sends the steps: a session's own wallet by default, which a session may override; an API key must name it (400 `wallet-required`). */
  wallet?: Address
  /** `proposeTrade`, and `sweepLeftover` of a token other than WETH and the Book's own: Mancer's signed quote from `POST /v1/books/{token}/vault-quote`, unused, and at least 15 seconds from its deadline. */
  quote?: {
    [key: string]: unknown
  }
  /** `sweepLeftover` of WETH or the Book's own token, which sells nothing and carries no signature. `revokeAllowance`: the token whose order allowance is zeroed. */
  token?: Address
  /** `cancelOrder` and `revokeAllowance`: the order book the grant names, the deployment's first order spender by default. */
  spender?: Address
  /** `cancelOrder`: the granted order's hash. */
  orderHash?: Hash
  /** `syncTracked`: the tokens to sync, the vault's tracked tokens by default. */
  tokens?: Address[]
  /** `stake`, `unstake` and `redeem`: raw units of the Book token, or `all` for what the wallet holds (or has staked). */
  amount?: string
}

export type BookStepsResponse = ReadySteps & {
  action: string
  book: {
    token: Address
    bookId: string
    factory: Address
    vault: Address
    phase: BookPhase
  }
}

export type DraftOpenStepsRequest = {
  /** The record's creator, who sends the open. A session's own wallet by default. */
  wallet?: Address
  /** `openBook`'s terms beside the record's name, ticker and factory. A zero economics field takes the raise contract's default, a zero `quote` is WETH, and `venue` 0 is Uniswap v3, 1 v4. */
  terms: {
    traders: Address[]
    durationSecs: number
    /** 0 burns the pool's fees */
    lpFeeMode?: 0 | 1
    startMcapUsd8?: string
    gradMcapUsd8?: string
    startTaxBps?: number
    taxDecayPerMinBps?: number
    windowSecs?: number
    buysOnly?: boolean
    bondAfterSecs?: number
    guaranteedBond?: boolean
    /** The base pair */
    quote?: Address
    venue?: 0 | 1
    hook?: Address
  }
}

export type DraftOpenStepsResponse = ReadySteps & {
  draft: {
    id: string
    factory: Address
    name: string
    symbol: string
  }
  /** Once the wallet sends the open, name its hash here (`{txHash}`) so the record binds to the Book by its transaction. */
  bind: {
    method: "PATCH"
    path: string
  }
}

export type TransferStepsRequest = {
  /** The wallet that sends. A session's own by default; an API key names it. */
  wallet?: Address
  /** The recipient: a whole address, or `@username` for the wallet that holds it. No address, a checksum typo, the zero address, the sender and the asset's own contract are refused (`bad-recipient`). */
  to: string
  asset: {
    kind: "native"
  } | {
    kind: "erc20"
    token: Address
  } | {
    kind: "nft"
    collection: Address
    tokenId: string
  }
  /** Raw units: required for ether (wei) and a token. An ERC-721 piece moves whole, by the three-argument `safeTransferFrom`; an ERC-1155 sends 1 by default. */
  amount?: string
}

export type TransferStepsResponse = ReadySteps & {
  warnings: string[]
}

/** A 20-byte hex address. */
export type Address = string

/** A 32-byte hex hash. */
export type Hash = string

export type Hex = string

/** An unsigned integer as a decimal string, in the token's smallest unit. */
export type Uint = string

export type TxNetFlows = {
  token: Address
  amountRaw: Uint
  amount: number | null
  usd: number | null
}[]

/** Every answer that is not a success. A route's own fields stay beside these (a refused quote's `quote`, a refusal's `detail`). */
export type Error = {
  /** A sentence naming what was wrong. Show it; branch on `code`. */
  error: string
  code: ErrorCode
  /** Whether the same request, sent again unchanged after `Retry-After`, may succeed. An unexpected error is retryable for a read, or for a write that carries an `Idempotency-Key`. */
  retryable: boolean
  /** The `Retry-After` header's seconds, where the answer carries one: every 429 and every 503. */
  retryAfterSeconds?: number
  /** On a 429 `rate-limited`, the bucket that refused. */
  bucket?: "key" | "key-account" | "session" | "ip" | "ip-ceiling" | "art" | "estimate" | "build" | "build-ceiling" | "auth" | "discover" | "discover-ceiling" | "account-write" | "follow-write" | "user-search" | "user-lookup" | "user-follows" | "username-check" | "steps"
  /** What the refusal names, by code. */
  detail?: {
    [key: string]: unknown
  }
  [key: string]: unknown
}

/** Every code an answer may carry. A code keeps its meaning for good; a new rule takes a new code. */
export type ErrorCode = "account-not-found" | "alerts-max" | "already-in" | "amount-exceeds-tracked" | "app-access-unavailable" | "auth-required" | "auth-unavailable" | "bad-action" | "bad-address" | "bad-addresses" | "bad-amount" | "bad-avatar-source" | "bad-bio" | "bad-body" | "bad-choice" | "bad-collection" | "bad-count" | "bad-cursor" | "bad-details" | "bad-display-name" | "bad-fields" | "bad-filter" | "bad-gateway" | "bad-id" | "bad-image-url" | "bad-json" | "bad-key-name" | "bad-label" | "bad-limit" | "bad-message" | "bad-mode" | "bad-name" | "bad-page" | "bad-platform" | "bad-pool" | "bad-public" | "bad-push-token" | "bad-query" | "bad-read" | "bad-reason" | "bad-recipient" | "bad-request" | "bad-scope" | "bad-scopes" | "bad-seq" | "bad-show-portfolio" | "bad-signature" | "bad-status" | "bad-symbol" | "bad-targets" | "bad-telegram" | "bad-then" | "bad-timeframe" | "bad-token" | "bad-token-id" | "bad-tokens-per-nft" | "bad-tx-hash" | "bad-username" | "bad-via" | "bad-wallet" | "bad-website" | "bad-x" | "batch-too-large" | "bio-length" | "bio-lines" | "block-self" | "blocking-max" | "book-cancelled" | "book-indexing" | "book-not-armed" | "book-settled" | "books-chain-stale" | "books-deployment-unverified" | "books-index-unavailable" | "books-rate-limited" | "books-sign-log-unavailable" | "books-signer-has-code" | "books-signer-not-current" | "books-signer-stopped" | "books-signer-unavailable" | "books-signing-off" | "books-state-unavailable" | "bucket-full" | "budget-exhausted" | "chain-unavailable" | "confirm-delete" | "conflict" | "contract-not-served" | "deadline-past-unlock" | "deletion-not-pending" | "deployment-unsupported" | "description-blank" | "description-length" | "description-lines" | "description-link" | "details-too-long" | "display-name-address" | "display-name-blank" | "display-name-length" | "display-name-link" | "display-name-word" | "draft-deployed" | "draft-name" | "draft-not-found" | "draft-symbol" | "events-unavailable" | "factory-not-open" | "feed-stale" | "field-not-for-kind" | "fill-impact-too-high" | "follow-blocked" | "follow-limit" | "follow-self" | "following-max" | "follows-paused" | "forbidden" | "geo-restricted" | "idempotency-in-progress" | "idempotency-key-busy" | "idempotency-key-invalid" | "idempotency-key-reused" | "impact-too-high" | "insufficient-eth" | "insufficient-tokens" | "integrator-fee-above-ceiling" | "integrator-fee-needs-key" | "integrator-fee-not-allowed" | "integrator-fee-unavailable" | "internal-error" | "invalid-accepted-min-out" | "invalid-integrator-fee" | "inventory-empty" | "inventory-short" | "invite-invalid" | "invite-not-found" | "invite-own" | "invite-tries" | "invite-used" | "key-managed-by-mancer" | "key-name-ambiguous" | "key-name-taken" | "key-not-found" | "key-not-owner" | "key-not-signing" | "key-required" | "key-scope" | "key-server-only" | "key-session-only" | "keys-max" | "keys-unavailable" | "launch-state-unavailable" | "legacy-closed" | "limit-under-market" | "link-busy" | "link-choice" | "link-contract-wallet" | "link-expired" | "link-limit" | "link-signature" | "linked-wallet-key-only" | "live-grants-full" | "logo-dimensions" | "logo-empty" | "logo-forbidden" | "logo-not-found" | "logo-not-raster" | "logo-too-large" | "logo-type" | "logo-type-mismatch" | "logo-unavailable" | "lp-share" | "middle-not-swept" | "middle-refused" | "names-required" | "nft-market-exists" | "nft-market-indexing" | "nft-market-paused" | "nft-market-state-unavailable" | "nft-market-unverified" | "nft-markets-unavailable" | "nft-not-found" | "no-image" | "no-nft-market" | "no-picture" | "no-reference" | "no-route" | "no-username" | "nonce-invalid" | "not-a-book" | "not-a-collection" | "not-a-trader" | "not-activated" | "not-an-eoa" | "not-an-nft" | "not-an-nft-market" | "not-book-operator" | "not-eligible" | "not-eligible-yet" | "not-following" | "not-found" | "not-frozen" | "not-in-inventory" | "not-market-maker" | "not-offered" | "not-owner" | "not-raising" | "not-read-yet" | "not-the-creator" | "note-required" | "nothing-to-claim" | "nothing-to-do" | "nothing-to-report" | "order-fills-unavailable" | "order-kind-unavailable" | "order-not-open" | "order-out-of-scope" | "orders-exceed-holding" | "orders-maker-only" | "origin-refused" | "payload-too-large" | "pending-mismatch" | "picture-dimensions" | "picture-empty" | "picture-forbidden" | "picture-frames" | "picture-not-raster" | "picture-too-large" | "picture-type" | "picture-type-mismatch" | "picture-unavailable" | "pool-fee-trap" | "pool-take-too-high" | "price-moved" | "primary-wallet" | "primary-wallet-only" | "profile-field-held" | "profiles-not-open" | "profiles-unavailable" | "q-required" | "quote-assessment-stale" | "quote-expired" | "quote-invalid" | "quote-required" | "quote-timeout" | "quote-value-discrepancy" | "quotes-paused" | "rate-limited" | "reason-required" | "recipient-not-found" | "refresh-nothing" | "refresh-unavailable" | "refresh-wait" | "report-limit" | "report-not-found" | "report-self" | "reversal-cooldown" | "reverses-live-order" | "round-trip-trap" | "route-leaves-stock" | "route-mismatch" | "route-pool-refused" | "route-touches-book-token" | "router-unavailable" | "salt-required" | "search-busy" | "search-unavailable" | "self-serve-keys-off" | "sell-exceeds-balance" | "sell-exceeds-curve" | "sells-disabled" | "session-required" | "session-revoked" | "signature-mismatch" | "simulation-mismatch" | "simulation-reverted" | "slippage-exceeded" | "stake-unread" | "steps-unavailable" | "stock-not-receivable" | "stocks-ack-required" | "stop-band-out-of-range" | "stop-band-too-narrow" | "stop-needs-cash-side" | "stop-over-market" | "stop-too-deep" | "stop-would-fire" | "store-busy" | "store-unavailable" | "stream-tickets-unavailable" | "target-duplicate" | "target-own-token" | "target-unknown" | "target-unverified" | "targets-locked" | "targets-required" | "terms-refused" | "thesis-blank" | "thesis-held" | "thesis-length" | "thesis-lines" | "thesis-link" | "thesis-not-found" | "tier-not-upgrade" | "timeout" | "token-is-a-book" | "token-refused" | "token-router-refused" | "token-sell-blocked" | "token-sell-gated" | "too-many-streams" | "transaction-not-found" | "transfer-refused" | "tx-taken" | "unavailable" | "unknown-field" | "unknown-leg" | "unknown-order" | "unknown-pool" | "unknown-token" | "unknown-username" | "unprocessable" | "unsupported-media-type" | "upload-limit" | "user-not-found" | "username-cooldown" | "username-format" | "username-held" | "username-in-use" | "username-length" | "username-lookalike" | "username-needs-x-or-stake" | "username-not-in-use" | "username-opened-elsewhere" | "username-prefix" | "username-reserved" | "username-staff-word" | "username-symbol" | "username-taken" | "username-x-handle" | "vault-simulation-failed" | "vault-tracks-16" | "venue-policy-changed" | "venue-policy-unavailable" | "vote-needs-verified" | "votes-rate-limited" | "wallet-already-linked" | "wallet-linked-elsewhere" | "wallet-mismatch" | "wallet-not-linked" | "wallet-required" | "wallets-max" | "webhook-busy" | "webhook-event-before-hook" | "webhook-event-not-found" | "webhook-event-not-subscribed" | "webhook-event-pending" | "webhook-events-invalid" | "webhook-not-found" | "webhook-resume-session-only" | "webhook-url-invalid" | "webhook-url-not-public" | "webhook-url-unresolvable" | "webhooks-max" | "webhooks-off" | "webhooks-unavailable" | "website-social" | "weth-spot" | "window-closed" | "window-closing" | "wrong-phase" | "x-device-expired" | "x-device-unknown" | "x-device-used" | "x-link-busy" | "x-link-denied" | "x-link-failed" | "x-not-linked" | "x-refresh-wait" | "x-ticket-not-yours" | "x-ticket-unknown" | "x-unavailable" | "zero-count" | "zero-trade"

/** What a wallet key may ask beyond the public reads: the account's own reads, building trades and orders, the account's records on Mancer, or Books signing for its own wallet. */
export type KeyScope = "read" | "trade" | "records" | "books"

export type ApiKey = {
  /** The key's name: the one given at the mint for a key the account minted. */
  name: string
  /** The key's id: `self.` and 16 hex digits for a key the account minted, its name for one Mancer issued. */
  id: string
  /** False while it is paused. */
  active: boolean
  rateClass: "standard" | "high"
  feeBpsCap?: number | null
  integratorFeeMaxBps?: number | null
  /** Kept for a key Mancer issued; no key is taken from a browser. */
  origins?: string[]
  /** Whether it acts as its owner wallet, as that wallet's session does. */
  actsAsOwner: boolean
  scopes: KeyScope[]
  /** True for a key the account minted, false for one Mancer issued. */
  selfServe: boolean
  /** The wallet the key belongs to and acts as. */
  owner: Address
  /** The holder's acknowledgement at the mint, with its time in seconds. */
  stocksAcknowledged?: {
    at?: number
    text?: string
  } | null
  createdAt: string
}

export type ApiKeyList = {
  account: Address
  keys: ApiKey[]
  /** The keys the account minted, in force and paused, and the most it may hold of each. */
  selfServe: {
    /** Keys in force. */
    held?: number
    /** Keys paused. */
    paused?: number
    /** The most in force: three. */
    max?: number
    /** The most kept, paused ones among them: ten. */
    keptMax?: number
  }
  scopes: KeyScope[]
  /** The sentence a mint sends as `acknowledgeStocks`. */
  stocksAcknowledgement: string
}

export type ApiKeyMinted = {
  /** The key, `mancer_` and 48 hex digits: in this answer alone. Null in a replay of the same Idempotency-Key. */
  key: string | null
  /** True in a replay, which withholds the key. */
  keyWithheld?: boolean
  name: string
  id: string
  owner: Address
  account: Address
  scopes: KeyScope[]
  rateClass: "standard"
  active: boolean
  selfServe: true
  stocksAcknowledged: {
    at?: number
    text?: string
  }
  createdAt: string
}

export type Limits = {
  /** Who the API takes the request for: `anonymous` (by its address), `session` (its wallet, account, `issuedAt` and `expiresAt`) or `key` (its `name` and `rateClass`, and a wallet key's `actsAs`). */
  caller: {
    kind: "anonymous" | "session" | "key"
    /** Anonymous: false where the request's address could not be read, so it shares one tight bucket. */
    proven?: boolean
    /** Anonymous: the request carried a session its account ended. */
    sessionRevoked?: boolean
    wallet?: Address
    account?: string | null
    issuedAt?: number | null
    expiresAt?: number
    name?: string
    rateClass?: "standard" | "high"
    /** Key: true for a key its account minted. */
    selfServe?: boolean
    /** Wallet key: the wallet it acts as, that wallet's account now, and its scopes. */
    actsAs?: {
      wallet?: Address
      account?: string | null
      scopes?: KeyScope[]
    }
  }
  /** Every rate bucket a request from this caller may pay, each refilled to now and charged nothing by this read. */
  buckets: {
    /** The bucket, as a 429's `bucket` and `RateLimit-Policy` name it. */
    name: string
    /** Whose it is: the key's, the session's wallet's, the account's (its wallets and its wallet keys share it), or the address's. */
    scope: "key" | "session" | "account" | "ip"
    /** Tokens a second. */
    rate: number
    /** Tokens at the most. */
    burst: number
    /** Requests that may follow at once. */
    remaining: number
    /** Seconds until the bucket is full again. */
    resetSeconds: number
    applies: string
  }[]
  /** The limits on an account's writes, with how many the account has used. `used` is null for a key or an anonymous caller, which hold no account. */
  durable: {
    name: string
    limit: number
    windowSeconds: number | null
    used: number | null
    applies: string
  }[]
}

export type SessionsRevoked = {
  revoked: true
  scope: "account" | "wallet"
  /** The cut, in seconds: every session of `wallets` issued at or before it is ended. */
  sessionsAfter: number
  wallets: Address[]
  /** The calling wallet's fresh session. */
  token: string
  /** The fresh session's issue, a second past the cut. */
  issuedAt: number
  /** Seven days past `issuedAt`. */
  expiresAt: number
  /** The webhooks paused with the sessions. Resume each with the fresh session. */
  pausedWebhooks?: PausedWebhook[]
}

export type ProfileReportResponse = {
  report: {
    [key: string]: unknown
  }
  duplicate: boolean
}

export type Health = {
  /** True when the API can quote. */
  ok?: boolean
  chainId?: number
  chain?: string
  swapRouter?: Address
  /** The address a user approves for swaps; null until the API has read it. A build's `tx.approval.spender` is authoritative. */
  allowanceTarget?: string | null
  orders?: Address
  /** Every orders contract the API reads and cancels on. New orders sign for `orders`. */
  ordersServed?: string[]
  storage?: string
  venueBookReady?: boolean
  /** The chain head the API reads, beside the public reference. */
  node?: {
    [key: string]: unknown
  }
}

export type ContractEntry = {
  address: Address
  /** keccak-256 of the runtime code at `address`, read from the chain. `eth_getCode` from your own node must hash to it. */
  codeHash: Hash
}

export type Contracts = {
  chainId: 4663
  chain: string
  /** MancerRouter: the `to` of every swap the API builds. */
  router: ContractEntry
  /** The one spender a swap's input token is approved to. */
  allowanceTarget: ContractEntry
  /** MancerOrders, with the EIP-712 domain and `Order` typehash every order signs under. */
  orders: ContractEntry & {
    eip712: {
      domain: {
        name: "Mancer Orders"
        version: "3"
        chainId: number
        verifyingContract: Address
      }
      primaryType: "Order"
      /** What the contract's `ORDER_TYPEHASH()` returns. */
      typehash: Hash
    }
  }
  /** Where an account-bound launch route is sent; null where the chain has none. */
  launchCoordinator: ContractEntry | null
  /** The spender a launch route's input is approved to. */
  launchAllowanceTarget: ContractEntry | null
  /** Wrapped ether, which stands for native ether in every route. */
  weth: ContractEntry
  /** The dollar, USDG. */
  usdg: ContractEntry | null
}

/** The fee already subtracted from `amountOut`. */
export type Fee = {
  /** Basis points charged. */
  bps?: number
  /** The pair category that set the rate. */
  tier?: "pegged" | "eth-stable" | "other" | "new-token"
  asset?: Address
  /** Which side of the trade carried the fee. */
  side?: "input" | "output" | "mid"
}

/** Present when the request named an integrator fee. `amountOut` and `minOut` are already net of it. */
export type IntegratorFee = {
  /** The rate the request named. */
  bps?: number
  recipient?: Address
  side?: "input" | "output"
  /** The token the fee is paid in; the zero address for native ETH. */
  token?: Address
  /** On the input, the exact fee. On the output, the fee at this quote; the transaction pays the same share of what it actually delivers. */
  amount?: Uint
}

/** Reference-value check, distinct from measured price impact. */
export type Safety = {
  /** True where the quote is refused (409, with a value guard code). A token whose simulated sale from a fresh wallet reverts is always refused. */
  blocked?: boolean
  reasonCode?: "value-discrepancy" | "pool-fee" | "sell-blocked" | "sell-gated" | "round-trip" | "router-refused" | null
  referenceShortfallBps?: number | null
  /** The largest single-pool take on the route, in bps: a static LP fee, a dynamic pool's last swap fee, a hook's modeled take on top. Absent when unknown. */
  poolFeeBps?: number
  /** The share of the trade, in bps, that runs through the pool `poolFeeBps` names. Absent where the route does not say, which reads as the whole trade. */
  poolFeeShareBps?: number
  /** What every pool of the route takes of the whole trade, in bps: each pool's take of what reaches it, on the share of the trade that runs through it. Absent where the route does not say. */
  routeFeeBps?: number
  /** An outside aggregator quoted the same trade within 5% of this quote (on `external=1` requests alone), so a reference shortfall is the reference's. Present (true) only then. */
  outsideAgrees?: boolean
  /** Share of a later sale the output token itself keeps, in bps, when its sale was simulated and measured. Absent otherwise. */
  sellTaxBps?: number
  /** Why the output token's simulated sale failed, from the chain. Present only with reasonCode sell-blocked. */
  sellBlockedReason?: string
  /** A wallet that never bought could not sell the output token, and nobody has traded it yet to confirm either way. Present (true) only then. */
  sellFreshWalletBlocked?: boolean
  referenceUsdIn?: number | null
  referenceUsdOut?: number | null
}

/** The ERC-20 allowance the sender must hold first. Approve `spender` exactly as given; it is the router's allowance target, never the router. */
export type Approval = {
  token?: Address
  spender?: Address
  amount?: Uint
}

/** The ready-to-sign terminal transaction. */
export type QuoteTx = {
  to: Address
  data: Hex
  value: Uint
  approval: Approval | null
  /** Route-specific setup beyond a plain approval. Never assume approval is the only setup. */
  preconditions?: string[]
}

/** The result of Mancer's simulation of the built transaction at an explicit block and fee context. */
export type Assessment = {
  status?: "simulated" | "reverted" | "unavailable"
  reasonCode?: string | null
  fundingMode?: "real" | "override" | "unknown"
  /** Decoded output where supported. */
  amountOut?: string | null
  outputStatus?: string
  gasEstimate?: string | null
  assessedAt?: number
  /** Block, hash, and fee context of the assessment. */
  context?: {
    [key: string]: unknown
  }
  revertSelector?: string | null
}

export type ExecutionRequirement = {
  kind: "erc20-allowance" | "protocol-operator"
  token?: Address
  spender?: Address
  amount?: Uint
  [key: string]: unknown
}

export type ExecutionTransaction = {
  chain: "robinhood"
  chainId: 4663
  kind: "approval" | "authorization" | "swap"
  to: Address
  data: Hex
  value: Uint
}

/** The complete ordered wallet sequence. Submit `transactions` in order; the last is the swap. */
export type Execution = {
  version: 1
  taker: Address
  recipient: Address
  /** `router`, or `launch-coordinator`, whose swap goes to the launch coordinator and not to the `swapRouter` of `GET /health`. */
  entrypoint: "router" | "launch-coordinator"
  requirements: ExecutionRequirement[]
  transactions: ExecutionTransaction[]
}

/** How the executable candidate was chosen. Gas converted into the output token is for the comparison alone: it never changes the on-chain minimum, the accepted floor or the fee. */
export type Selection = {
  requested?: string
  /** `net-output` for ETH and WETH output; `native-input-efficiency` for native ETH input; `reference-net-output` for other pairs; `output`, with `fallbackReason`, where no estimate was usable. */
  basis?: "output" | "net-output" | "native-input-efficiency" | "reference-net-output"
  /** Set where equal outputs were split by gas cost. */
  tieBreak?: string | null
  gasCostInOutput?: string | null
  netAmountOut?: string | null
  conversionBasis?: string | null
  assessedCandidates?: number
  fallbackReason?: string | null
  reference?: {
    [key: string]: unknown
  } | null
  [key: string]: unknown
}

/** The winning route's economics. Executable fields appear only when a build was requested. */
export type Quote = {
  amountOut: Uint
  /** Executable builds only. The estimate the floor is taken from, where `amountOut` is the measured net output. On a build with `repricedFrom`, what the route's first build delivered. */
  quotedAmountOut?: Uint
  /** Executable builds only. The floor the calldata enforces, the stronger of `acceptedMinOut` and the slippage-derived floor of `quotedAmountOut`. */
  minOut?: Uint
  /** Executable builds only, where the route's first build was stopped by its own floor alone and was built again at what it delivered (at least 80% of its estimate, and `acceptedMinOut`). */
  repricedFrom?: {
    /** The estimate the route's first build carried. */
    quotedAmountOut: Uint
    /** The floor the route's first build carried and delivered under. */
    minOut: Uint
    /** How far under the first estimate the route delivered, in basis points. */
    shortBps: number
  }
  /** Executable builds only, where the first plan was refused in simulation by a market maker's own contract and a plan without that maker's refused markets was built. Absent on every other build. */
  replannedFrom?: {
    /** The estimate the refused plan carried. */
    quotedAmountOut: Uint
    /** The maker venues whose contracts refused the plan. */
    refusedBy: string[]
    /** The markets left out of this plan, one string each. Opaque: show them, never parse them. */
    heldOut: string[]
  }
  route?: Route
  /** Alternatives, best first, the winner included. Absent on estimates. */
  all?: {
    route?: Route
    amountOut?: Uint
  }[]
  recommendedSlippageBps?: number
  slippageBasis?: "realtime-vol" | "prior"
  volBps?: number | null
  /** A sentence about market hours worth showing verbatim, when there is one. */
  marketNote?: string | null
  /** What the order's size cost against its own route's marginal rate, in basis points; never negative. Absent where it could not be measured: derive a coarse figure from `usdIn` and `usdOut`. */
  priceImpactBps?: number
  /** The route's marginal exchange rate in raw output units per raw input unit, gross of the protocol fee. Null on a flow route and whenever `priceImpactBps` is absent. */
  marginalRate?: number | null
  /** The input-side fee, in basis points, that the race already reflected in every candidate's output. Zero for an output-side or zero-fee schedule. A build recomputes it for the funding wallet. */
  raceInputFeeBps?: number
  /** Diagnostics of the race (per-arm latencies, timeouts). Useful when reporting a slow or missing quote; never a contract, since the fields change between releases. */
  timings?: {
    [key: string]: unknown
  }
  usdIn?: number | null
  usdOut?: number | null
  fee: Fee
  integratorFee?: IntegratorFee
  safety?: Safety
  latencyMs: number
  cached: boolean
  /** True on an anonymous estimate. Tell estimates apart by this field, never by a missing one. */
  estimate?: boolean
  /** Executable builds only. Absent or null when every candidate failed build, policy, or simulation. */
  tx?: QuoteTx | null
  /** `passed`; `skipped` where the request sent `verify=0`; `setup-required` where an account-bound build's setup must run before the swap can be simulated. */
  txSimulation?: "passed" | "skipped" | "setup-required"
  assessment?: Assessment
  execution?: Execution
  selection?: Selection
  /** With `steps=1` alone. */
  ready?: ReadyStepsField
}

/** The winning route, for display and audit. Calldata is compiled on the server from the same route at build time, so a client never turns a route into a transaction itself. `kind` says which shape the other fields take; treat a kind you do not know as opaque, because a new venue can add a kind without a version bump. | `kind` | What it is | Fields beside `kind` | | --- | --- | --- | | `flow` | A plan across many pools and middle tokens, each leg one pool. `takesNetted` is true where the amounts are already net of the tokens' transfer taxes. | `legs[]`, `amountOut`, `takesNetted` | | `direct` | One Uniswap v3 pool on the canonical tier. | `fee` | | `hop` | Two v3 pools through a hub token. | `mid`, `feeIn`, `feeOut`, `path` | | `hop3` | Three v3 pools across the WETH and USDG bridge. | `midA`, `midB`, `feeIn`, `feeBridge`, `feeOut`, `path` | | `v2` | A Uniswap v2 path of one to three hops. | `path` | | `v4` | One Uniswap v4 pool. `hooks` is the zero address on a pool with no hook, and the zero address as a currency is native ETH. | `currency0`, `currency1`, `fee`, `tickSpacing`, `hooks`, `zeroForOne`, `hookPools` | | `v4hop` | Two v4 pools through a hub currency. | `exactCurrency`, `mid`, `legA`, `legB`, `out` | | `up33` | UP33 router hops with a stable or volatile curve per hop. | `routes[{ from, to, stable }]` | | `up33cl` | One UP33 concentrated-liquidity pool. | `pool`, `tickSpacing`, `zeroForOne` | | `path` | A chain of single-pool hops across any venues. | `legs[]` | | `psplit` | The order split into disjoint branches settled in one plan. | `branches[{ legs, amountIn, amountOut }]` | | `msplit` | The order across up to five pool-disjoint v3 and v2 routes in one transaction. | `legs[{ route, amountIn, amountOut }]` | | `layered` | Two stages through one middle token: every first-stage leg trades the input for the middle, every second-stage leg trades the pooled middle for the output, and the two stages split independently. | `mid`, `stages[legs[], legs[]]`, `amountOut` | | `network` | A split over the hub tokens: direct legs beside every hub's inbound and outbound legs, each one pool. | `direct[]`, `vias[{ mid, first, second }]`, `amountOut` | | `via` | Two legs through a cash token, the fee taken between them. | `cash`, `legA`, `legB`, `midOut` | | `ext` | An outside aggregator's route, only with `external=1`. | `agg`, `variant` | | `launch` | A trade on a launch protocol's bonding curve, with an optional swap before or after it. | `protocol`, `origin`, `launchId`, `token`, `quoteToken`, `direction`, `launchSettlement`, `bridge` | | `consolidated` | Two entrances joined through a bridge pool into one exit. | `entrances`, `bridge`, `tail`, `family` | | `civ-game` | A Nightshades faction trade through the game's own desk, optionally behind a conversion (`bridge`: the input into WETH before a buy, or the desk's WETH into the output after a sell), or faction to faction (`into`: the desk's WETH buys the second faction). | `direction`, `factionId`, `token`, `bridge`, `into` | | `cashfanout` | WETH into cash across parallel tails at a fixed split. | `tails`, `v3TailBps`, `gigaTailBps` | | `split` | Retired: only an old quote can carry it. | `v3Fee`, `v3AmountIn`, `v3AmountOut`, `v2Path`, `v2AmountIn`, `v2AmountOut` | */
export type Route = {
  /** The route family. */
  kind: "flow" | "direct" | "hop" | "hop3" | "v2" | "v4" | "v4hop" | "up33" | "up33cl" | "path" | "psplit" | "msplit" | "layered" | "network" | "via" | "ext" | "launch" | "consolidated" | "civ-game" | "cashfanout" | "split"
  [key: string]: unknown
}

/** One leg of a route, through one pool. On a path or a branch, each leg's `amountIn` is the previous leg's `amountOut`. The pool is named by `fee`, `pool` and `tickSpacing`, `stable`, or the v4 key. */
export type RouteLeg = {
  /** The pool's venue, such as `v3`, `v2`, `v4`, `up33cl`, `ramsescl`, or a fee-tier v3 venue like `sushiswap-v3`. */
  venue: string
  tokenIn: Address
  tokenOut: Address
  amountIn: Uint
  amountOut: Uint
  /** v3-family fee tier in hundredths of a basis point. */
  fee?: number
  pool?: Address
  /** Concentrated-liquidity tick spacing for CL venues keyed by spacing rather than fee. */
  tickSpacing?: number
  /** UP33 stable-curve flag. */
  stable?: boolean
  currency0?: Address
  currency1?: Address
  hooks?: Address
  zeroForOne?: boolean
}

export type QuoteResponse = {
  /** Null when no route exists, which is an authoritative market claim, or when a Nightshades pair's game desk did not answer, which `reason` marks as transient. */
  quote: Quote | null
  /** Beside a null quote that is no market claim. `civ-game-desk-unavailable`: the Nightshades desk did not answer, so retry. `civ-game-night`: the game's pools refuse every swap until `nightEndsAt`. */
  reason?: "civ-game-desk-unavailable" | "civ-game-night"
  /** With `civ-game-night`, when the current Night ends according to the game's manager. */
  nightEndsAt?: string
  /** Present and true on an anonymous estimate. */
  estimate?: boolean
  acceptedMinOut?: Uint
}

export type LaunchAuthorization = {
  /** The launch protocol that needs setup. Pons pairs use the ordinary router allowance and never appear here. */
  protocol: "safe-launch-v2"
  origin: Address
  launchId: string
  requirements: ExecutionRequirement[]
  /** Setup only, in order. Never contains a swap. */
  transactions: ExecutionTransaction[]
}

/** The V3 order instrument. One signed message covers limit, stop, and recurring orders. */
export type Order = {
  maker: Address
  tokenIn: Address
  tokenOut: Address
  /** Raw units pulled from the maker per fill. */
  amountPerFill: Uint
  /** 1 for a limit or stop, N for a recurring order. */
  totalFills: number
  /** Seconds between fills. 0 for a single fill; 60..7776000 for recurring. */
  everySec: number
  /** Recurring slot window. 0 for a single fill; 1..everySec for recurring. Each slot is fillable in `[due, due + fillWindowSec)`; a missed slot is consumed, never shifted. */
  fillWindowSec: number
  /** Unix time of the earliest first fill. 0 anchors a recurring grid at the first successful fill. */
  startAt: number
  /** Unix time after which the order is dead. 0 = never. */
  expiry: number
  /** Floor on what reaches the maker per fill, net of fees, enforced on chain. 0 = market-priced recurring fill. */
  minOutPerFill: Uint
  /** Stop trigger. 0 unless a single-fill stop; must sit above `minOutPerFill`. */
  triggerOutPerFill: Uint
  /** Optional range cap. 0 = uncapped; otherwise must exceed `minOutPerFill`. */
  maxOutPerFill: Uint
  /** The most a fill may charge. At least the pair's schedule (`GET /v1/order-fee`), at most 100. */
  maxFeeBps: number
  /** The maker's current on-chain epoch, `makerEpoch(maker)`. Zero for a fresh wallet. */
  epoch: Hash
  /** Maker-chosen salt. Same terms with a new nonce is a new order. */
  nonce: Uint
  /** One-cancels-the-other group, the same fresh 32-byte value on every leg; zero when not grouped. */
  ocoGroup: Hash
}

export type OrderStatus = "open" | "filled" | "cancelled" | "expired"

/** The latest reason Mancer's executor held an open order. Context, never signed intent; it clears after a fill or a terminal state. */
export type ExecutorBlocker = {
  code: "market-data" | "no-route" | "reference-price" | "price-impact" | "unpriceable" | "uneconomic" | "simulation" | "pool-fee" | "sell-blocked" | "maker-funds" | "floor" | "better-route" | "search-incomplete"
  message: string
  observedAt: number
  amountOut?: string
  referenceOut?: string
  marginalOut?: string
  maxImpactPct?: number
  referenceAgeSec?: number
  feeUsd?: number
  gasUsd?: number
  minimumFeeUsd?: number
  /** With `pool-fee`: the largest single-pool take of the route that was refused, in bps. */
  poolFeeBps?: number
  /** With `better-route`: the gross output of the better route quoted for the same fill. The held route's `amountOut` pays well under it. */
  barOut?: string
}

/** An order as Mancer holds and serves it. The signature is never returned. */
export type OrderRecord = {
  hash: Hash
  /** The orders deployment the signature binds. */
  contract: Address
  maker: Address
  order: Order
  /** Unix seconds. */
  createdAt: number
  status: OrderStatus
  /** On V3, the schedule-slot cursor, which includes missed windows. */
  fillsDone: number
  /** Successful `Filled` events. */
  executionsDone?: number
  /** Unix seconds of the next slot. */
  nextDueAt: number
  executorBlocker?: ExecutorBlocker | null
  ocoGroup?: string | null
}

export type Fill = {
  order_hash: Hash
  fill_index: number
  maker: Address
  amount_in: Uint
  amount_out: Uint
  fee_bps: number
  tx_hash: Hash
  block_number: number
  /** Unix seconds. */
  timestamp: number
}

export type Token = {
  address: Address
  symbol: string
  name: string
  decimals: number
  /** A Robinhood Chain tokenized stock. */
  isStock: boolean
  /** 2 = verified by Mancer, 1 = issued stock, 0 = the unreviewed tail. */
  tier: number
  /** A symbol lookalike of a verified token. */
  impersonator?: boolean
  /** USD. */
  price?: number | null
  /** Percent. */
  change24h?: number | null
  liquidityUsd?: number | null
  /** Measured executable depth. */
  depthUsd?: number | null
  volume24h?: number | null
  trades24h?: number
  /** Pools that traded in the last 24 hours. */
  pools24h?: number
  /** Pools with a depth row (the ones with a cash side). */
  pools?: number
  /** `high` or `low` (a defended price, by the pools behind it), `day`, `last`, `pool` (its market pool's price, before any trade), or null without a price. */
  priceConfidence?: string | null
  /** The measured depth behind the price; 0 means it rests on volume alone. */
  priceDepthUsd?: number | null
  firstBlock?: number
  /** Unix seconds. */
  firstSeen?: number | null
  /** The price times the circulating supply, which leaves out the dead address's balance, an NFT market token's escrow and a Mosh token's agent vaults. */
  marketCapUsd?: number | null
  imageUrl?: string | null
  /** A Book token: its Book, and `name` is the display name where the deployment gives one. Absent on every other token. */
  book?: BookFlag
}

export type TokenDetail = Token & {
  /** Which components of the row are current, partial, or missing. */
  freshness?: {
    [key: string]: unknown
  }
  changes?: {
    m5?: number | null
    h1?: number | null
    h6?: number | null
    h24?: number | null
  }
  /** A bounded preview of the token's top pools. */
  poolsList?: {
    pool?: string
    venue?: string
    other?: Address
    otherSymbol?: string | null
    cash?: string
    liquidityUsd?: number | null
    depthUsd?: number | null
  }[]
  poolListTruncated?: boolean
  poolListLimit?: number
  /** The pool its chart is drawn from. */
  chartPool?: string | null
  candlePools?: number
  buyVolume24h?: number | null
  holders?: number | null
  /** Raw units as an integer string. */
  totalSupply?: string | null
  /** Human units: the supply less the dead address's balance, less its escrow's for an NFT market's token, and less its agent vaults' for a Mosh token. */
  circulatingSupply?: number | null
  /** An NFT market's token: the escrow its circulating supply and market cap leave out, which holds the token behind the collection's NFTs. Absent on every other token. */
  escrow?: {
    address: Address
    /** The market's trading vault. */
    market: Address
    collection: Address
    /** The escrow's balance of the token, raw units as an integer string. */
    balance: string
    /** The tokens one NFT trades at, raw units as an integer string. */
    tokensPerNft: string
  }
  /** A token Mosh launched: its swarm's agent vaults, which its circulating supply and market cap leave out, as Mosh's own supply figure does. Absent on every other token. */
  agentVaults?: {
    /** The Mosh swarm that lists the vaults. */
    swarm: Address
    /** What the vaults hold of the token together, raw units as an integer string. */
    balance: string
    vaults: {
      address: Address
      /** The vault's balance of the token, raw units as an integer string. */
      balance: string
    }[]
  }
  fdvUsd?: number | null
  source?: "indexer"
  /** How old the figures in this answer are, in seconds. */
  servedAgeSec?: number
}

export type TokenSwap = {
  /** The pool's own price after the swap, in USD; 0 where the venue reports none. */
  spotUsd?: number
  id?: string
  txHash?: Hash
  logIndex?: number
  blockNumber?: string
  timestamp?: number
  pool?: string
  venue?: string
  /** The cash leg the price is measured against. */
  cash?: Address
  priceUsd?: number
  volumeUsd?: number
  side?: "buy" | "sell" | null
  amountToken?: number | null
  amountCash?: number | null
  cashSymbol?: string | null
  /** Who made the swap: its payer, as `/v1/transactions/{hash}` names each swap's `maker`, else its sender. Null on a token's fee (`fee`). A swap neither names yet is left out of the tape. */
  trader?: string | null
  /** The transaction's sender. Absent on a token's fee. */
  sender?: string
  /** Present where the swap is a token's own fee traded inside someone else's trade: nobody's swap, its `trader` null. */
  fee?: true
  /** Where what the swap bought went, where that is a wallet other than its trader. */
  deliveredTo?: string
  /** Present where the trader is a solver's float that filled another's purchase out of its own money. */
  solver?: true
  /** Present where the print was a step of its owner's liquidity added, removed or moved (a zap's swap); absent for a trade. */
  purpose?: "liquidity-add" | "liquidity-remove" | "liquidity-move"
}

export type Candle = {
  /** Bucket start, unix seconds. */
  t: number
  o: number
  h: number
  l: number
  c: number
  /** Volume in USD. */
  v: number
}

export type RoutedTotals = {
  source: "swap" | "split" | "order"
  swaps: number
  volumeUsd: number
  feesUsd: number
  unpricedFees: number
  unpricedVolume: number
}

export type RoutedStats = {
  days: number
  series: (RoutedTotals & {
    /** UTC day as unix seconds. */
    day?: number
  })[]
  allTime: RoutedTotals[]
  asOf: number
  valuation: {
    basis?: "historical-usdg"
    anchor?: "USDG = $1"
    estimated?: true
  }
  indexing: {
    latestTradeAt?: number | null
    status?: "current" | "catching-up" | "unknown"
  }
}

export type MarketStatus = {
  /** Regular session in progress. */
  open: boolean
  phase: "open" | "pre" | "after" | "closed"
  /** Unix seconds of the next regular-session open. */
  nextOpen: number
  sessionOpen: number | null
  nextClose: number | null
  /** A line clients can show verbatim. */
  note: string | null
}

/** The contracts and rules a deployment speaks: `books` is StonkBrokers' Trader Book contracts. */
export type BookAbiSet = "books"

/** One curve trade, vault trade or market swap. */
export type BookActivityItem = {
  kind: "curve-buy" | "curve-sell" | "vault-trade" | "pool-swap"
  token: BooksAddress
  displayName: string
  symbol: string
  /** The buyer, the seller, the vault, or the market swap's sender. */
  account: BooksAddress | null
  /** Of the Book token; a vault trade has none. */
  side: "buy" | "sell" | null
  /** The Book's base pair. */
  quote: BooksAddress | null
  /** How much of the base pair moved. */
  quoteAmount: BooksUnits | null
  tokensWei: BooksUnits | null
  vaultTrade: {
    tokenIn: BooksAddress
    tokenOut: BooksAddress
    amountIn: BooksUnits
    amountOut: BooksUnits
  } | null
  block: number
  time: number
  tx: BooksHex
}

/** That a bond would revert now, and why. */
export type BookBondBlocked = {
  error: BookDecodedError
  /** The Book's v3 pool at the locker's fee, where one exists. One someone opened off the curve's closing price stops the bond (`PoolMispriced`). */
  pool: BooksAddress | null
  /** That pool's `liquidity()`, as it reads; null where it did not read. */
  poolLiquidity: BooksUnits | null
}

/** The curve's trades, newest first, and every one in time order for a chart. */
export type BookBuysResponse = {
  trades: BookCurveTrade[]
  history: {
    time: number
    mcapUsd8: BooksUnits
  }[]
  nextBefore: number | null
}

/** What the chain would take now, from whoever the contracts allow. */
export type BookCapabilities = {
  /** No market yet, and the Book is not cancelled. */
  openNftMarket: boolean
  /** A market that passed its checks, the Book armed, not settled and not cancelled, and the feed fresh. */
  wrap: boolean
  /** A market that passed its checks, and the feed fresh. */
  unwrap: boolean
  /** A market that passed its checks, and the feed fresh. */
  sellNft: boolean
  /** An NFT in the inventory, the Book not settled and not cancelled, and the feed fresh. */
  buyNft: boolean
  /** The creator may arm. */
  arm: boolean
  /** The creator may cancel: armed, no buy, the curve open. */
  abort: boolean
  buy: boolean
  sell: boolean
  /** Anyone may graduate. */
  graduate: boolean
  /** Anyone may bond. */
  bond: boolean
  /** The traders may trade the vault. */
  trade: boolean
  stake: boolean
  unstake: boolean
  claimFees: boolean
  /** Anyone may harvest the locked market's fees. */
  harvest: boolean
  /** Anyone may burn fees nobody staked for. */
  sweepUnowned: boolean
  /** Who may settle now, and from when anyone may. */
  liquidate: {
    tradersAndCreator: boolean
    anyone: boolean
    anyoneFrom: number | null
  }
  redeem: boolean
  /** A trader's cut waits to be claimed. */
  claimCut: boolean
  /** A settled Book's vault holds WETH, or a balance of a token it tracks. A token it does not track, which a sweep also sells, is not read here, and a sweep of WETH or of the Book token sells nothing. */
  sweep: boolean
}

/** Where part of circulating sits: the Book NFT market's vault. */
export type BookCirculatingParts = {
  /** The tokens behind the NFTs, behind NFTs stuck in its vault, and sent to its vault; null where the Book has no market or a read of it did not answer. */
  nftMarket: {
    escrowed: BooksUnits
    backed: number
    stuckTokens: BooksUnits
    donatedTokens: BooksUnits
  } | null
}

/** One trade on the curve. */
export type BookCurveTrade = {
  side: "buy" | "sell"
  /** The buyer (the call's recipient) or the seller. */
  account: BooksAddress
  /** What a buy paid, or what a sale moved on the curve, in the base pair. */
  grossQuote: BooksUnits
  taxQuote: BooksUnits
  taxBps: number
  /** What reached the curve, or the seller. */
  netQuote: BooksUnits
  tokensWei: BooksUnits
  /** The market cap after it. */
  mcapUsd8: BooksUnits
  block: number
  time: number
  tx: BooksHex
  logIndex: number
}

/** A contract's refusal, decoded by its selector where it is a Books error. */
export type BookDecodedError = {
  name: string | null
  selector: BooksHex | null
}

/** A Mancer route as the vault's adapter runs it, by token and amount. */
export type BookDecodedPlan = {
  tokenIn: BooksAddress
  tokenOut: BooksAddress
  amountIn: BooksUnits
  /** The route's floor. */
  minAmountOut: BooksUnits
  /** Who the route pays: the vault. */
  recipient: BooksAddress
  deadline: number
  /** Mancer's swap fee inside the route. */
  feeBps: number
  feeMode: "input" | "output" | "mid"
  /** The route's legs. */
  legs: {
    tokenIn: BooksAddress
    tokenOut: BooksAddress
    amountIn: BooksUnits
  }[]
}

/** The deployment a Book belongs to, for good. */
export type BookDeploymentRef = {
  factory: BooksAddress
  abiSet: BookAbiSet
  /** `books`. */
  label: string
}

/** One deployment of the Books contracts. */
export type BookDeploymentView = {
  factory: BooksAddress
  label: string
  abiSet: BookAbiSet
  /** A new Book may be opened on it. */
  opensNewBooks: boolean
  /** The shortest term a new Book may run, the factory's `minDurationSecs()`. */
  minDurationSecs: number | null
  /** Its contracts passed Mancer's checks. */
  verified: boolean
  /** The first check that failed, where one did. */
  failed: {
    address: BooksAddress
    field: string
  } | null
  addresses: {
    factory: BooksAddress
    pad: BooksAddress
    settler: BooksAddress
    lpFees: BooksAddress
    locker: BooksAddress
    lockerV4: BooksAddress | null
    operatorNft: BooksAddress
    /** The vault implementation every Book's vault is a clone of. */
    accountImplementation: BooksAddress
    adapters: {
      uniswap: BooksAddress
      mancer: BooksAddress | null
    }
    /** The Book NFT market factory. */
    bookAnvilFactory: BooksAddress | null
  }
  deployBlock: number
  /** The block the index has read the deployment through. */
  indexedTo: number | null
  /** How many Books it holds. */
  books: number
  /** The Book NFT markets its factory opened, and how many failed their checks or did not read. */
  nftMarkets: {
    count: number
    unverified: number
  } | null
  /** The factory's `mancerSigner()`, whether Mancer's API has a signer, and whether it is that one. */
  signer: {
    onChain: BooksAddress | null
    configured: boolean
    current: boolean
    hasCode: boolean
  } | null
  /** Each purpose, and whether Mancer's signing switch is on for it on this deployment. Whether the signer is ready is `signer`'s. */
  signing: {
    trade: boolean
    liquidate: boolean
    sweep: boolean
    "order-grant": boolean
  } | null
  /** The order spenders the factory lists: MancerOrders v3. */
  orderSpenders: BooksAddress[]
  /** Every base pair the raise contract lists beside WETH, delisted ones too (`allowed: false`), with its USD feed (`usdFeed`), its fixed USD price (`fixedUsd8`, 8 decimals) and its feed's age limit. */
  quotes: {
    token: BooksAddress
    symbol: string | null
    decimals: number
    usdFeed: BooksAddress | null
    fixedUsd8: BooksUnits
    maxAgeSecs: number
    allowed: boolean
  }[]
  /** The Uniswap v4 hooks a Book may name. */
  hooksAllowed: BooksAddress[]
  /** Every adapter, signer and spender the owner proposed and has not acted on, as Mancer's watch last read them: those still in their 2-day notice, and those past it. */
  pendingProposals: {
    kind: "adapter" | "signer" | "spender"
    address: BooksAddress
    since: number
  }[]
}

/** One Book's page: its summary, and every block its page shows. */
export type BookDetail = {
  /** The Book token, which names the Book. */
  token: BooksAddress
  deployment: BookDeploymentRef
  /** The Book's id on its deployment. Name a Book by its token. */
  bookId: string
  /** The display name where the deployment names one, else the chain's name; the same as `displayName`. */
  name: string
  displayName: string
  symbol: string
  /** Every Book token has 18 decimals. */
  decimals: 18
  /** `impersonator` where the Book's symbol is a verified token's symbol, or its name or symbol holds a protected name as a whole word (Mancer, StonkBrokers, TOKENIZE): such a Book is never ranked. */
  nameFlag: "impersonator" | null
  /** The Book's base pair. */
  quote: BookQuoteRef
  venue: BookVenueState
  /** The wallet that opened the Book. */
  creator: BooksAddress
  /** The Book's traders, one to eight. */
  traders: {
    address: BooksAddress
    /** The creator's own seat, or seen confirming, cancelling or revoking on chain. */
    acted: boolean
    /** The trader's wallet carries Mancer's verified mark now. */
    verified: boolean
    /** The trader's Ethos reading, at most 30 minutes old; null where none is held. */
    ethos: BookTraderEthos | null
  }[]
  /** `flagged` where the creator or a trader who acted has an Ethos score under 800; else `trusted` where one carries the verified mark or an Ethos score of 1,600 or more; else `plain`. */
  trust: BookTrust
  /** The verified accounts' votes on the Book. */
  votes: BookVoteCounts
  /** What its creator set of it. */
  profile: BookProfile
  traderCount: number
  phase: BookPhase
  step: BookStep
  launchPhase: BookLaunchPhase
  flags: BookStepFlags
  launchMode: BookLaunchMode | null
  /** Where the locked market's fees go: to stakers, or burned. */
  lpFeeMode: "stake" | "burn"
  /** The term, from the bond. */
  durationSecs: number
  times: {
    openedAt: number
    armedAt: number | null
    /** When the opening tax reaches its 1% floor. */
    antiSnipeEndsAt: number | null
    /** The earliest second the mark closes the curve: an hour after the tax reaches 1%. */
    minBondAt: number | null
    /** The window's end, or a buys-only Book's bond clock. It closes the curve where `forcedBond`. */
    deadline: number | null
    /** The window's end closes the curve. */
    forcedBond: boolean | null
    bondedAt: number | null
    /** The term's end. */
    unlockAt: number | null
    /** When anyone may settle: the unlock and the 2-day grace. */
    openToAllAt: number | null
    settledAt: number | null
    /** When its creator cancelled it. */
    cancelledAt: number | null
  }
  /** To the deadline while raising (null once an open-ended raise is past it), to the unlock while trading. */
  timeLeftSecs: number | null
  /** The Book token's market: before the bond, the curve's price and market cap, and no pool; after it, the locked market (the v3 pool, or the PoolManager and the pool id on v4). Priced in the base pair. */
  market: {
    pool: BooksAddress | null
    poolId: BooksHex | null
    /** The base pair's raw units per whole token. */
    pricePerTokenQuote: BooksUnits | null
    priceUsd: number | null
    marketCapUsd: number | null
  }
  /** What a settlement now would fix, while the Book trades or is frozen. */
  value: BookValue | null
  /** The Book's value in WETH: its raise before the bond; then its vault and the ETH its locked LP returns holders; once settled, what the settlement took in. Null if cancelled or unread. */
  bookValueWei: BooksUnits | null
  /** What its settlement fixed, once settled. */
  final: BookFinal | null
  rank: {
    /** Raised at least 0.1 ETH, a name not flagged, and a trader who acted. */
    ranked: boolean
    why: BookRankWhy | null
    /** What was sent to the vault from outside. */
    transfersInWei: BooksUnits
    /** What the board ranks by: while the Book trades or is frozen, its return net of what was sent to the vault from outside; once settled, its settlement's `returnBps`. */
    tradingReturnBps: number | null
  }
  /** The tracked holdings. A settled Book's leave out what the settlement emptied. */
  holdings: BookHoldings
  /** A settled Book alone: every token its vault tracked, its own token among them. */
  trackedTokens?: BooksAddress[]
  /** The launch's terms, the close fee and the traders' share. */
  terms: BookTerms
  /** The Book's operator NFT. */
  operatorNft: {
    address: BooksAddress
    tokenId: string
  }
  /** What the chain would take now. */
  capabilities: BookCapabilities
  /** While the step is `bond`, why a bond would revert now; null where it would land. */
  bondBlocked: BookBondBlocked | null
  /** The raise. */
  raise: BookRaiseState | null
  /** The vault. */
  vault: BookVaultState | null
  /** The locked market, once bonded. */
  lock: BookLockState | null
  /** The staking contract's figures for this Book, sent on every Book: before the bond nothing is staked or dripped. */
  stake: BookStakeState | null
  settlement: BookSettlementState
  /** What reached the vault in the raise, in WETH: its share of the tax and its 75% of the raise. */
  costBasisWei: BooksUnits
  /** The Book NFT market: none yet, or open. */
  nftMarket: NftMarketState | null
}

/** One Book, read at one block. */
export type BookDetailResponse = {
  head: BooksHead
  /** The block the answer is read through. */
  indexedBlock: number | null
  book: BookDetail
  /** Every token the page names. */
  tokens: BookTokenMetaMap
}

/** Ethos's level of a credibility score. */
export type BookEthosLevel = "untrusted" | "questionable" | "neutral" | "known" | "established" | "reputable" | "exemplary" | "distinguished" | "revered" | "renowned"

/** A settled Book's figures: what the settlement fixed, and what is left to redeem. */
export type BookFinal = {
  /** What the vault settled for, sweeps included. */
  navTotalWei: BooksUnits
  /** What the locked market returned to the holders' pot, in WETH. */
  lpPotWei: BooksUnits
  costBasisWei: BooksUnits
  /** This Book's close fee, sweeps included. */
  closeFeeWei: BooksUnits | null
  closeFeeMancerWei: BooksUnits | null
  closeFeeProtocolWei: BooksUnits | null
  /** The traders' cut. */
  creatorCutTotalWei: BooksUnits
  /** What the settlement contract still holds for the holders who have not redeemed, `settleOf(id).holderPot`. */
  holderPotLeftWei: BooksUnits
  /** The tokens not yet redeemed, `settleOf(id).circulating`. */
  circulatingLeft: BooksUnits
  /** What each whole token is paid on redemption, in WETH wei, fixed at settlement: all the settlement credited holders, sweeps included, over the tokens circulating then. Null where nothing circulated. */
  payoutPerTokenWei: BooksUnits | null
  /** The settlement's trading NAV (`navTotalWei`, sweeps included) over the cost basis, before the close fee and the traders' cut. The LP pot, the locked liquidity's own principal, is apart. */
  returnBps: number | null
  /** The same NAV after the close fee and the traders' cut, over the cost basis, the LP pot apart: the trading return a holder kept. */
  afterFeesBps?: number | null
}

/** On a token response, a Book token: its Book. */
export type BookFlag = {
  factory: BooksAddress
  abiSet: BookAbiSet
  label: string
  bookId: string
  vault: BooksAddress
  phase: BookPhase
  step: BookStep
  flags: {
    pastWindow: boolean
    graduatable: boolean
    feedStale: boolean
  }
  quote: BooksAddress
  /** While the Book waits, raises or has graduated: what it raised and the tax now. */
  raise: {
    raisedQuote: BooksUnits
    taxBpsNow: number
  } | null
  unlockAt: number | null
  settledAt: number | null
  /** While it trades, the holders' pot over circulating; once settled, what a token redeems for. */
  backingPerTokenWei: BooksUnits | null
  displayName: string
  nftMarket: {
    nft: BooksAddress
    tokensPerNft: BooksUnits
  } | null
}

/** One order the vault granted. Its terms are public on chain. */
export type BookGrantRow = {
  spender: BooksAddress
  orderHash: BooksHex
  kind: BookOrderKind
  tokenIn: BooksAddress
  tokenOut: BooksAddress
  amountPerFill: BooksUnits
  totalFills: number
  filled: number
  floorPerFill: BooksUnits
  triggerPerFill: BooksUnits | null
  capPerFill: BooksUnits | null
  schedule: {
    everySec: number
    fillWindowSec: number
    startAt: number
    expiry: number
  }
  maxFeeBps: number
  ocoGroup: BooksHex | null
  /** The vault still answers for the grant: not cancelled or revoked, its spender listed and Mancer's signer not revoked, its Book trading, and not expired, filled or ended in Mancer's order book. */
  live: boolean
  /** Why a grant that is not live ended, null while live: `cancelled` by a trader, `stopped` with every vault order (`revokeOrders`), `filled`, `expired`, or `ended` for any other end. */
  end: "cancelled" | "stopped" | "filled" | "expired" | "ended" | null
  /** Mancer's order book holds it open. */
  admitted: boolean
  /** Why Mancer's executor does not fill a live grant, null where nothing holds it. Nothing ever fills an `unsigned` or `passed-over` grant: a trader can cancel it. `since` is when the hold began. */
  hold: {
    code: "token-refused" | "fills-off" | "unsigned" | "passed-over"
    reason: string
    since: number
  } | null
  granted: {
    block: number
    time: number
    tx: BooksHex
  }
}

/** One step of a Book's life. */
export type BookHistoryEvent = {
  kind: BookHistoryKind
  block: number
  time: number
  tx: BooksHex
  logIndex: number
  /** Who sent it, where the event names them. */
  actor: BooksAddress | null
  /** The step's figures, amounts as raw units: sibling events of its transaction merged in (the pad's and the factory's bond are one step), and words and 0 or 1 flags where the step names them. */
  detail: {
    [key: string]: string | number | null
  }
}

/** A kind of step in a Book's life. */
export type BookHistoryKind = "opened" | "armed" | "cancelled" | "graduated" | "bonded" | "order-granted" | "order-cancelled" | "orders-revoked" | "allowance-revoked" | "settled" | "unsold" | "swept" | "redeemed" | "cut-claimed" | "close-fee" | "fees-harvested" | "nft-market-opened" | "nft-image-set"

/** A Book's history, newest first. */
export type BookHistoryResponse = {
  events: BookHistoryEvent[]
  nextBefore: number | null
  tokens: BookTokenMetaMap
}

/** A holder of a Book token that is one of the Book's own contracts. */
export type BookHolderRole = "vault" | "nft-market" | "staking" | "settler" | "pad" | "pool" | "pool-manager" | "dead"

/** One tracked holding of the vault. */
export type BookHoldingShare = {
  token: BooksAddress
  /** What it sells for at settlement by the last valuation, in WETH wei; null where nothing priced it. */
  valueWei: BooksUnits | null
  /** Its share of what the priced holdings are worth. */
  shareBps: number | null
  isWeth: boolean
  /** The Book's own token. */
  isBook: boolean
}

/** The vault's tracked holdings, the most valuable first. */
export type BookHoldings = {
  /** How many tokens the vault tracks, at most 16 over its life. A settled Book's count leaves out what the settlement emptied. */
  count: number
  tokens: BookHoldingShare[]
}

/** The `detail` of a 503 `book-indexing`: `indexedBlock`, and `bookId` where the chain names a Book the index does not hold yet. A read that names `minBlock` names `indexedBlock` alone. */
export type BookIndexingDetail = {
  /** The Book's id, where the chain names it. */
  bookId?: string
  /** The block the index has read through; null where it has read none. */
  indexedBlock: number | null
}

/** How the raise runs: `buys-only` (no sales on the curve), `guaranteed` (its window closes the curve) or `open-ended` (only the mark closes it). */
export type BookLaunchMode = "buys-only" | "guaranteed" | "open-ended"

/** The phase in the words of Mancer's launch routes. */
export type BookLaunchPhase = "waiting" | "active" | "migrating" | "migrated" | "aborted"

/** A held token the run leaves unsold, and why. */
export type BookLeftToken = {
  token: BooksAddress
  amount: BooksUnits
  valueWei: BooksUnits | null
  code: string
}

/** What this run leaves unsold, and who else may settle with it sold. */
export type BookLiquidationLeft = {
  tokens: BookLeftToken[]
  /** The tokens the request's stock access alone leaves: empty for a request an API key authorizes, which is open for issued stocks. */
  byAccess: BooksAddress[]
  valueWei: BooksUnits | null
  /** Their share of the vault's value. */
  shareOfNavBps: number | null
  /** The traders and the creator, and when anyone may. */
  othersWhoMaySettle: {
    traders: BooksAddress[]
    creator: BooksAddress
    anyoneFrom: number
  }
}

/** One token of a settlement: each tracked token, the vault's untracked WETH, and the lock's released base-pair leg where the vault does not track the base pair. */
export type BookLiquidationLeg = {
  token: BooksAddress
  symbol: string | null
  kind: "weth" | "book" | "empty" | "sale" | "unsellable"
  /** What the settlement takes of it: the vault's balance, with the lock's released leg on the base pair; 0 where the balance did not read. */
  amount: BooksUnits
  quotedOutWei: BooksUnits | null
  minOutWei: BooksUnits
  adapter: BooksAddress
  pool: BooksAddress | null
  /** Why it cannot sell, or how its value was read. */
  reason: string | null
}

/** A settlement quotes request. */
export type BookLiquidationQuotesRequest = {
  /** The wallet that will send the transaction: a trader or the creator from the unlock, or after the 2-day grace any wallet that is not a contract. */
  wallet?: Address
  /** The sales' band, 50 to 150 (100 by default). */
  slippageBps?: number
}

/** The signed sales, the settlement call that carries them, and the settlement its simulation fixed. */
export type BookLiquidationQuotesResponse = {
  head: BooksHead
  deployment: BookDeploymentRef
  bookId: string
  vault: BooksAddress
  quotes: BookSignedQuote[]
  /** Each held token no quote sells, and why. A later sweep can sell it. */
  unquoted: {
    token: BooksAddress
    amount: BooksUnits
    code: string
  }[]
  /** `settler.liquidate(bookId, quotes)`, to send from the `wallet` the request named. */
  call: {
    to: BooksAddress
    data: BooksHex
    value: "0"
  }
  /** The vault's `syncTracked` call, to send first where it is not null. */
  preSync: {
    to: BooksAddress
    data: BooksHex
  } | null
  /** The settlement as its simulation fixed it at the head. `owedLpFeesWei` and `circulatingParts` are the Book's last reading. */
  estimate: BookSettlementEstimate
  /** A sale cut to what the impact cap allows, and what it leaves. */
  tranches: {
    token: BooksAddress
    sold: BooksUnits
    left: BooksUnits
  }[]
  /** What this run leaves unsold. */
  left: BookLiquidationLeft | null
  simulation: {
    block: number
    gas: number | null
  }
  slippageBps: number
  tokens: BookTokenMetaMap
  /** With `steps=1` alone. */
  ready?: ReadyStepsField
}

/** A frozen Book's settlement as it would run now. */
export type BookLiquidationResponse = {
  head: BooksHead
  deployment: BookDeploymentRef
  bookId: string
  phase: BookPhase
  /** Whether `caller` may settle now, and from when. */
  eligible: {
    caller: BooksAddress | null
    role: "trader" | "creator" | "other" | null
    now: boolean
    from: number
    /** The caller must send its own transaction: a wallet with no seat after the grace. */
    mustBeEoa: boolean
    callerKind: BookTakerKind | null
  }
  legs: BookLiquidationLeg[]
  /** The vault's `syncTracked` call to send first, with an API key; null without one. */
  preSync: {
    to: BooksAddress
    data: BooksHex
  } | null
  /** A tracked token's balance, the Book's own token aside, differs from what the vault tracks of it, as a filled order leaves it: a sync is due. */
  syncDue: boolean
  /** The route that signs the sales. */
  quotesAt: string
  estimate: BookSettlementEstimate
  slippageBps: number
  tokens: BookTokenMetaMap
}

/** One of the locked market's two positions: the full-range pair, or the unsold tokens' one-sided ask. */
export type BookLockPositionState = {
  kind: "pair" | "ask"
  /** The v3 position; null on v4. */
  positionId: string | null
  tickLower: number
  tickUpper: number
  liquidity: BooksUnits
  /** The Book tokens it holds now. */
  bookAmountWei: BooksUnits
  /** The base pair it holds now. */
  quoteAmount: BooksUnits
}

/** The Book's locked market. */
export type BookLockState = {
  lockId: string
  venue: BookVenue
  /** The locker that holds it. */
  locker: BooksAddress
  /** The v3 pool, or the PoolManager on v4. */
  pool: BooksAddress
  /** The v4 pool id; null on v3. */
  poolId: BooksHex | null
  hook: BooksAddress | null
  positions: BookLockPositionState[]
  bookAmountWei: BooksUnits
  quoteAmount: BooksUnits
  /** Fees owed in Book tokens. */
  owedBookWei: BooksUnits
  /** Fees owed in the base pair. */
  owedQuote: BooksUnits
  unlockAt: number
  /** Settlement released it. */
  released: boolean
}

/** A wallet's own vote on a Book. */
export type BookMyVote = {
  side: BookVoteSide
  /** Null where the vote carries no thesis, or Mancer took it down. */
  thesis: string | null
  /** Unix seconds of its last change. */
  at: number
}

/** The approval a market call waits on: the Book token to the market's vault, or the vault approved for one NFT or every one. */
export type BookNftApproval = {
  kind: "erc20"
  token: BooksAddress
  spender: BooksAddress
  amount: BooksUnits
} | {
  kind: "erc721"
  nft: BooksAddress
  operator: BooksAddress
  ids: string[]
} | {
  kind: "erc721-all"
  nft: BooksAddress
  operator: BooksAddress
}

/** On a wallet's rows, a Book's NFT market collection: its Book. */
export type BookNftFlag = {
  /** The Book token. */
  token: BooksAddress
  factory: BooksAddress
  bookId: string
  tokensPerNft: BooksUnits
  displayName: string
  symbol: string
}

/** The Book a market route answers for. */
export type BookNftMarketBook = {
  token: BooksAddress
  deployment: BookDeploymentRef
  bookId: string
  phase: BookPhase
  displayName: string
  symbol: string
}

/** What the Book's NFT market allows now, by its state. Who may act is for the caller to compare. */
export type BookNftMarketCapabilities = {
  /** No market yet, and the Book is not cancelled. */
  openNftMarket: boolean
  /** A market that passed its checks, the Book armed, not settled and not cancelled, and the feed fresh. */
  wrap: boolean
  /** A market that passed its checks, and the feed fresh. */
  unwrap: boolean
  /** A market that passed its checks, and the feed fresh. */
  sellNft: boolean
  /** An NFT in the inventory, the Book not settled and not cancelled, and the feed fresh. */
  buyNft: boolean
}

/** A Book's NFT market, its inventory oldest first, and what can be done now. */
export type BookNftMarketResponse = {
  head: BooksHead
  book: BookNftMarketBook
  market: NftMarketState
  inventory: {
    count: number
    ids: string[]
    truncated: boolean
  }
  capabilities: BookNftMarketCapabilities
  tokens: BookTokenMetaMap
}

/** A Book's NFT market on the board, where one passed its checks. */
export type BookNftMarketSummary = {
  tokensPerNft: BooksUnits
  /** The NFTs wallets hold. */
  outside: number
  /** The tokens the market's vault holds behind every outstanding NFT, stuck ones included (`escrowed()`), as a share of circulating. */
  escrowShareBps: number | null
}

/** One move through a market, one row a transaction and action. */
export type BookNftMove = {
  action: "wrap" | "unwrap" | "sell" | "buy"
  /** Who paid for a wrap or a purchase, owned the NFTs of an unwrap, or sold. */
  account: BooksAddress
  /** A wrap's recipient; null for the other moves. */
  recipient: BooksAddress | null
  count: number
  /** The NFTs moved, lowest first; null for an unwrap. */
  ids: string[] | null
  feeWei: BooksUnits
  block: number
  time: number
  tx: BooksHex
}

/** A market's moves, newest first. */
export type BookNftMovesResponse = {
  moves: BookNftMove[]
  nextBefore: number | null
}

/** One market call as the chain would take it from the wallet at the head. */
export type BookNftQuoteResponse = {
  head: BooksHead
  action: NftMarketAction
  wallet: BooksAddress
  walletKind: BookTakerKind
  count: number
  ids: string[] | null
  /** The Book tokens the call moves. */
  tokens: BooksUnits
  fee: {
    /** The exact fee at the head. */
    wei: BooksUnits
    /** What to send: the fee and its buffer where the wallet takes ETH back, the exact fee where it does not. */
    valueWei: BooksUnits
    bufferBps: number
    usd: number
    /** The wallet takes the change back. */
    refundable: boolean
  }
  /** What the call waits on, as the chain reads it at the head. */
  checks: {
    feedFresh: boolean
    walletTokens: BooksUnits | null
    allowance: BooksUnits | null
    owned: boolean | null
    nftApproved: boolean | null
    inInventory: boolean | null
    operator: boolean | null
    maker: boolean | null
  }
  /** An unwrap of a settled Book: what the freed tokens redeem for, less the unwrap's fee. */
  afterSettlement: {
    tokensFreed: BooksUnits
    payoutWei: BooksUnits
    unwrapFeeWei: BooksUnits
    netWei: BooksSignedUnits
  } | null
  approval: BookNftApproval | null
  /** The call, every recipient the wallet, with an API key; null without one. */
  tx: {
    to: BooksAddress
    data: BooksHex
    value: BooksUnits
    chainId: 4663
  } | null
  /** Where the exact fee is sent: a feed step before the call lands can refuse it. */
  note: string | null
  /** With `steps=1` alone. */
  ready?: ReadyStepsField
}

/** The bounds a vault order's fields must fit. */
export type BookOrderBounds = {
  /** The kinds of vault order Mancer signs: none while Mancer's executor fills no vault orders. */
  kinds: BookOrderKind[]
  totalFills: {
    min: number
    max: number
  }
  everySec: {
    min: number
    max: number
  }
  fillWindowSec: {
    min: number
  }
  /** The latest start. */
  startAtLatest: number
  /** The latest expiry: before the Book's unlock. */
  expiryLatest: number
  spanMaxSec: number
  stopBandBps: {
    min: number
    max: number
    default: number
  }
  trigger: {
    minUnderPlanBps: number
    maxUnderReferenceBps: number
    needsCashSide: boolean
  }
  grantDeadlineSec: {
    solo: number
    several: {
      min: number
      max: number
      default: number
    }
  }
  liveGrants: {
    max: number
    now: number
  }
  /** One order's whole total, in basis points of the vault's value. */
  totalCapBps: number
  /** Every live order's remaining total, in basis points of the vault's value. */
  liveTotalCapBps: number
}

/** A vault order grant request. A field it does not name, or a field of another kind, is refused. */
export type BookOrderGrantRequest = {
  /** The wallet that will send the transaction, which your servers vouch for (`wallet-required` without it): a trader of the Book. */
  wallet?: Address
  kind: BookOrderKind
  tokenIn: Address
  tokenOut: Address
  /** The raw units of `tokenIn` each fill sells: above zero, and at most a uint128. */
  amountPerFill: string
  /** Required for a recurring order (`twap`): 2 to 1,000. */
  totalFills?: number
  /** Required for a recurring order (`twap`): 60 seconds to a day. */
  everySec?: number
  /** A recurring order: 60 seconds up to the interval. */
  fillWindowSec?: number
  /** Required for a `limit`: what one fill delivers at the least, net of the fee, in raw units above zero. */
  minOutPerFill?: string
  /** Required for a `stop`: the trigger, on one fill's gross output, in raw units above zero. */
  triggerOutPerFill?: string
  /** A stop: the floor's band beneath the trigger, 100 to 1,000 (300 by default). */
  stopBandBps?: number
  /** Chain seconds, from a minute before the head to an hour after it. */
  startAt?: number
  /** Chain seconds, never past the Book's unlock less a minute. */
  expiry?: number
  /** The grant's deadline in seconds, the shortest the policy allows: 600 with one trader, and 900 with several. It may name only that, and any other is 400 `bad-body`. */
  deadlineSec?: number
  /** Every check and the simulation, and no signature. */
  preview?: true
}

/** The order Mancer built, its signed grant and intent, and the readings it was signed under. */
export type BookOrderGrantResponse = {
  kind: BookOrderKind
  preview: boolean
  order: BookOrderV3
  grant: BookOrderGrantSignature | null
  intent: BookOrderIntent | null
  digest: BooksHex | null
  replaces: BookOrderReplaces | null
  market: BookOrderMarket
  reference: BookOrderReference
  budget: {
    grantBps: number
    hourUsedBps: number
    dayUsedBps: number
    hourCapBps: number
    dayCapBps: number
  }
  simulation: {
    proposeGas: number | null
    grantGas: number | null
    block: number
  }
  policy: {
    solo: boolean
    deadlineSec: number
    access: BookSigningAccess
    notionalWei: BooksUnits
    feeBps: number
  }
  signer: BooksAddress | null
  deployment: BookDeploymentRef
  bookId: string
  vault: BooksAddress
  tokens: BookTokenMetaMap
  head: BooksHead
}

/** The grant Mancer signed. */
export type BookOrderGrantSignature = {
  spender: BooksAddress
  orderHash: BooksHex
  deadline: string
  salt: string
  signature: BooksHex
}

/** The `OrderIntent` `proposeOrder` and `confirmOrder` take, at the vault's `orderNonce()`. */
export type BookOrderIntent = {
  spender: BooksAddress
  order: BookOrderV3
  nonce: string
  deadline: string
  quoteSalt: string
  mancerSig: BooksHex
}

/** A vault order: `twap` (recurring), `limit` or `stop`. */
export type BookOrderKind = "twap" | "limit" | "stop"

/** One fill against the market at the head. */
export type BookOrderMarket = {
  outPerFillAtHead: BooksUnits
  grossOutPerFillAtHead: BooksUnits
  floorGapBps: number
  triggerGapBps: number | null
  impactBps: number
}

/** Why the pending order would not be granted now. */
export type BookOrderPreviewCode = "limit-under-market" | "stop-over-market" | "stop-would-fire" | "stop-too-deep" | "stop-band-too-narrow" | "fill-impact-too-high" | "price-moved" | "orders-exceed-holding" | "no-reference" | "no-route"

/** The vault's pending order exactly as `pendingOrder()` reads it. */
export type BookOrderPreviewRequest = {
  /** The wallet that will send the transaction, which your servers vouch for (`wallet-required` without it): a trader of the Book. */
  wallet?: Address
  order: BookOrderV3
}

/** The vault's pending order beside the market now. */
export type BookOrderPreviewResponse = {
  kind: BookOrderKind
  /** The body is the vault's pending order. */
  pending: boolean
  /** No refusal: the order passes a grant's checks of its tokens, route, price and the vault's holding at the head. The budget, reversals, live-grant cap and a stop's bounds are checked at the grant alone. */
  valid: boolean
  refusals: {
    code: BookOrderPreviewCode | "token-refused:not-erc20" | "token-refused:book-token" | "token-refused:not-verified" | "token-refused:stock-not-receivable" | "token-refused:sell-blocked" | "token-refused:insider-liquidity" | "token-refused:launch-curve" | "token-refused:not-a-target"
    detail?: {
      [key: string]: unknown
    }
  }[]
  market: BookOrderMarket | null
  reference: BookOrderReference
  tokens: BookTokenMetaMap
  head: BooksHead
}

/** How Mancer's executor holds each fill against the reference prices. */
export type BookOrderReference = {
  kind: "twap" | "limit"
  window: "30m"
  outPerFill: BooksUnits | null
  holdUnderBps: number
} | {
  kind: "stop"
  window: "30m"
  outPerFill: BooksUnits | null
  holdUnderBps: number
  trigger: {
    window: "5m"
    minMinutes: number
    outPerFill: BooksUnits | null
  }
  broad: {
    minPools: number
    minMinutes: number
    holdUnderBps: number
  }
  /** A stop: one pool alone set the 30-minute reference of the token whose fall it waits for, so it fills only once that price is within the band, and in a fast fall it may not fill. */
  onePool: boolean
}

/** The pending order a proposal of this one replaces, and who had confirmed it. */
export type BookOrderReplaces = {
  digest: BooksHex
  orderHash: BooksHex
  kind: BookOrderKind
  confirmedBy: BooksAddress[]
}

/** MancerOrders v3's `Order`: amounts as decimal strings, counts, times and the fee cap as JSON numbers, and `epoch` and `ocoGroup` as 32 bytes of hex. */
export type BookOrderV3 = {
  maker: BooksAddress
  tokenIn: BooksAddress
  tokenOut: BooksAddress
  amountPerFill: BooksUnits
  totalFills: number
  everySec: number
  fillWindowSec: number
  startAt: number
  expiry: number
  minOutPerFill: BooksUnits
  triggerOutPerFill: BooksUnits
  maxOutPerFill: BooksUnits
  maxFeeBps: number
  epoch: BooksHex
  nonce: string
  ocoGroup: BooksHex
}

/** The vault's pending trade. */
export type BookPendingIntent = {
  /** The vault's `pendingDigest()`. */
  digest: BooksHex
  adapter: BooksAddress
  /** The adapter the trade runs through. */
  adapterKind: "uniswap" | "mancer" | "unknown"
  tokenIn: BooksAddress
  tokenOut: BooksAddress
  amountIn: BooksUnits
  minOut: BooksUnits
  nonce: string
  deadline: number
  route: BooksHex | null
  quoteSalt: string | null
  mancerSig: BooksHex | null
  plan: BookDecodedPlan | null
  uniswapPath: {
    token: BooksAddress
    fee: number
  }[] | null
  /** Each trader, and whether it confirmed. */
  confirmations: {
    trader: BooksAddress
    confirmed: boolean
  }[]
  /** Who signed the quote, whether that is the factory's signer now, and whether it was used or expired. */
  quote: {
    signer: BooksAddress | null
    signerIsCurrent: boolean
    used: boolean
    expired: boolean
  } | null
  /** The pending trade read against its own route. */
  checks: {
    routeMatchesIntent: boolean
    recipientIsVault: boolean
    floorCoversMinOut: boolean
    feeWithinCap: boolean
  } | null
}

/** The vault's pending order grant. */
export type BookPendingOrder = {
  digest: BooksHex
  spender: BooksAddress
  order: BookOrderV3
  nonce: string
  deadline: number
  confirmations: {
    trader: BooksAddress
    confirmed: boolean
  }[]
}

/** A Book's phase at the head's second, never a device's clock. `aborted` is a cancelled Book. */
export type BookPhase = "waiting" | "raising" | "graduated" | "trading" | "frozen" | "settled" | "aborted"

/** Why the policy refuses a token. */
export type BookPolicyCode = "not-erc20" | "book-token" | "not-verified" | "geo-restricted" | "stock-not-receivable" | "no-reference" | "sell-blocked" | "insider-liquidity" | "launch-curve" | "unread" | "not-a-target"

/** What Mancer will sign for this vault. */
export type BookPolicyResponse = {
  head: BooksHead
  access: BookSigningAccess
  verdicts: BookPolicyVerdict[]
  budget: BookSignBudget
  orders: BookOrderBounds
  tokens: BookTokenMetaMap
}

/** One side of a token's verdict. */
export type BookPolicySide = {
  verdict: "signable" | "refused"
  code: BookPolicyCode | null
}

/** One token as the policy reads it. */
export type BookPolicyVerdict = {
  token: BooksAddress
  isStock: boolean
  /** As a trade's output. */
  buy: BookPolicySide
  /** As a trade's input, at the 30-minute reference alone: a settlement's sale and a sweep read six hours where the 30 minutes are thin. */
  sell: BookPolicySide
  /** The most of the vault's value it may hold of the token; null where no cap applies. */
  holdingCapBps: number | null
}

/** What a Book's creator set of it. None of it is on chain, and the targets bind what Mancer signs. */
export type BookProfile = {
  /** The logo's path on the API, a new path for every change; null where none was set. */
  logo: string | null
  /** Plain text: 1 to 500 characters and 10 lines, no link, line breaks as `\n`. */
  description: string | null
  /** Each a full https link: a website on its own host, an X profile (`https://x.com/<handle>`), a Telegram link (`https://t.me/<name>`). */
  links: {
    website: string | null
    x: string | null
    telegram: string | null
  }
  /** Up to 16 tokens the Book means to buy, in the creator's order. Where any are named, Mancer signs the vault's purchases into these, its base pair, WETH and USDG alone. */
  targets: BooksAddress[]
  /** Unix seconds of its last change; null where nothing was ever set. */
  updatedAt: number | null
}

/** A Book's base pair: WETH, or a token the raise contract lists, with its US dollar price at the head. */
export type BookQuoteRef = {
  token: BooksAddress
  symbol: string | null
  decimals: number
  isWeth: boolean
  /** The price now, US dollars with 8 decimals: a feed's answer, or the fixed price a listing holds. Null while the raise contract cannot read its feed (`StalePrice`). */
  usd8: BooksUnits | null
  /** Where the price comes from: `eth-usd-feed` for WETH, `usd-feed` for a listed token whose listing names a USD feed, and `fixed` for the fixed USD price a listing holds where it names none. */
  source: "eth-usd-feed" | "usd-feed" | "fixed"
}

/** A route in the shape `/v1/quote` serves one. */
export type BookQuoteRoute = {
  kind: string
  [key: string]: unknown
}

/** A raise trade as a direct call to the raise contract from the taker's own wallet. */
export type BookRaiseQuoteResponse = {
  head: BooksHead
  deployment: BookDeploymentRef
  bookId: string
  side: "buy" | "sell"
  /** `eth` or `quote` (the base pair). */
  payWith: "eth" | "quote"
  quote: BookQuoteRef
  amountIn: BooksUnits
  /** The tax of the head's minute. */
  taxBps: number
  /** The tax, in the base pair. */
  taxQuote: BooksUnits
  /** The base pair that moves on the curve: a buy's after the tax, a sale's before it. */
  curveQuote: BooksUnits
  /** A buy's tokens, or a sale's base pair (or ETH) after the tax. */
  amountOut: BooksUnits
  /** The floor the call enforces. */
  minOut: BooksUnits
  /** The base pair's raw units per whole token after the trade. */
  pricePerTokenAfterQuote: BooksUnits
  /** How far the trade moves the curve's price. */
  moveBps: number
  mcapUsd8After: BooksUnits | null
  /** The buy reaches the mark at a moment the mark may close the curve: it fills in full and graduates the Book. */
  closesCurve: boolean
  nextTaxStep: {
    at: number
    bps: number
  } | null
  /** A sale's cap: the lesser of what the wallet bought on the curve and what it holds. */
  cap: {
    boughtOnCurve: BooksUnits
    held: BooksUnits
    sellable: BooksUnits
  } | null
  takerKind: BookTakerKind
  /** The call, with an API key; null without one. */
  tx: {
    to: BooksAddress
    data: BooksHex
    value: BooksUnits
    chainId: 4663
  } | null
  /** The exact allowance the call needs first, with an API key; null without one, or where it needs none. */
  approval: {
    token: BooksAddress
    spender: BooksAddress
    amount: BooksUnits
  } | null
  /** With `steps=1` alone. */
  ready?: ReadyStepsField
}

/** The raise at the head's second. */
export type BookRaiseState = {
  /** The base pair the raise holds, in its raw units. */
  raisedQuote: BooksUnits
  /** The raise in WETH at the raise contract's prices; null where a price did not read. */
  raisedEthWei: BooksUnits | null
  /** The curve's market cap, US dollars with 8 decimals. */
  mcapUsd8: BooksUnits | null
  /** The mark: the market cap that closes the curve, US dollars with 8 decimals. */
  gradMcapUsd8: BooksUnits
  /** The market cap's progress to the mark. */
  progressBps: number
  buyCount: number
  /** The raise tax at the head's second. */
  taxBpsNow: number
  /** The opening market cap, as the terms set it. */
  startMcapUsd8: BooksUnits | null
  /** The opening raise tax, as the terms set it. */
  startTaxBps: number | null
  /** The curve's virtual base-pair reserve, in the base pair's raw units. */
  vEth: BooksUnits
  /** The curve's virtual Book reserve. */
  vToken: BooksUnits
  /** The base pair the raise holds. */
  realEth: BooksUnits
  /** The supply minted to the raise at the arm. */
  loadedSupply: BooksUnits
  armed: boolean
  graduated: boolean
  bonded: boolean
  aborted: boolean
  /** When the tax next falls, and to what; null before the arm and once it is at 1%. */
  nextTaxStep: {
    at: number
    bps: number
  } | null
  /** When the tax reaches 1%. */
  taxFloorAt: number | null
  /** The base pair, gross of the tax now, that lifts the market cap to the mark; null before the arm, once there or graduated, and where the base pair's price did not read. */
  quoteToGraduate: BooksUnits | null
  /** The base pair's raw units per whole token at the curve's price. */
  pricePerTokenQuote: BooksUnits
  /** The ETH/USD feed the raise reads. */
  feed: {
    ethUsd8: BooksUnits
    updatedAt: number
    stale: boolean
  }
  /** The base pair's own US dollar price, where it comes from (`eth-usd-feed`, `usd-feed` or `fixed`), and whether its feed is stale. */
  quoteMark: {
    usd8: BooksUnits | null
    source: "eth-usd-feed" | "usd-feed" | "fixed"
    stale: boolean
  }
  /** The raise's clock, as the raise contract's `timingOf` answers it. */
  timing: {
    antiSnipeEndsAt: number
    minBondAt: number
    deadline: number
    forcedBond: boolean
  }
  /** Not buys only, and the curve open. */
  sellsEnabled: boolean
  /** Where the tax goes, in basis points of it: 7,500 to the vault, 833 to the creator, 833 to StonkBrokers' treasury, the rest (`remainderTo`) to the pad's StockBooster on a WETH Book, else the treasury. */
  taxSplitBps: {
    vault: number
    creator: number
    protocol: number
    remainder: number
    remainderTo: "stock-booster" | "treasury"
  }
}

/** A raise's figures while a Book waits, raises or has graduated. */
export type BookRaiseSummary = {
  /** The base pair the raise holds, in its raw units. */
  raisedQuote: BooksUnits
  /** The raise in WETH at the raise contract's prices; null where a price did not read. */
  raisedEthWei: BooksUnits | null
  /** The curve's market cap, US dollars with 8 decimals. */
  mcapUsd8: BooksUnits | null
  /** The mark: the market cap that closes the curve, US dollars with 8 decimals. */
  gradMcapUsd8: BooksUnits
  /** The market cap's progress to the mark. */
  progressBps: number
  buyCount: number
  /** The raise tax at the head's second. */
  taxBpsNow: number
  /** The opening market cap, as the terms set it. */
  startMcapUsd8: BooksUnits | null
  /** The opening raise tax, as the terms set it. */
  startTaxBps: number | null
}

/** Why a Book is not ranked. */
export type BookRankWhy = "raise-under-floor" | "name-flagged" | "no-trader-acted"

/** What a transaction's sales realized. A purchase carries none. */
export type BookRealized = {
  eth: number | null
  usd: number | null
}

/** What the settlement contract holds for this Book: the holders' unredeemed pot and the traders' unclaimed cut. */
export type BookReserved = {
  holderPotWei: BooksUnits
  cutsOwedWei: BooksUnits
  totalWei: BooksUnits
}

/** What a settlement now would fix: the close fee first, then the traders' cut of what is left over the cost basis. */
export type BookSettlementEstimate = {
  /** The vault's value in WETH. */
  navWei: BooksUnits
  /** What the locked market would return to holders, inside `holderPotWei`. */
  lpPotWei: BooksUnits | null
  owedLpFeesWei: BooksUnits
  closeFeeWei: BooksUnits | null
  closeFeeMancerWei: BooksUnits | null
  closeFeeProtocolWei: BooksUnits | null
  costBasisWei: BooksUnits
  /** The value less the close fee, over the cost basis. */
  profitWei: BooksUnits
  /** The traders' cut. */
  creatorCutWei: BooksUnits
  holderPotWei: BooksUnits
  circulating: BooksUnits | null
  circulatingParts: BookCirculatingParts
  /** What a whole token would redeem for. */
  payoutPerTokenWei: BooksUnits | null
  /** Always false: a Book's value always reads whole. Kept for clients built before it. */
  partial: boolean
  asOf: BooksHead
}

/** What the settlement fixed, and what is left. */
export type BookSettlementFinal = {
  navTotalWei: BooksUnits
  /** What the locked market returned to the holders' pot. */
  lpPotWei: BooksUnits
  /** A Book of another base pair: the market's base pair still to sell. */
  lpQuotePending: BooksUnits
  closeFeeWei: BooksUnits | null
  closeFeeMancerWei: BooksUnits | null
  closeFeeProtocolWei: BooksUnits | null
  /** The holders' pot not yet redeemed. */
  holderPotLeftWei: BooksUnits
  /** The tokens not yet redeemed. */
  circulatingLeft: BooksUnits
  circulatingParts: BookCirculatingParts
  unredeemable: BookUnredeemable | null
  creatorCutTotalWei: BooksUnits
  creatorCutClaimedWei: BooksUnits
  reserved: BookReserved
  /** Each token settlement left unsold, with its amount then. A later sweep may have sold it since. */
  unliquidated: {
    token: BooksAddress
    amount: BooksUnits
  }[]
  /** A held token waits for a sweep: the pot can still grow. */
  stillSelling: boolean
}

/** The Book's settlement. */
export type BookSettlementState = {
  liquidated: boolean
  /** The grace after the unlock before anyone may settle: 2 days. */
  graceSecs: number
  openToAllAt: number | null
  /** What a settlement now would fix. */
  estimate: BookSettlementEstimate | null
  /** What the settlement fixed. */
  final: BookSettlementFinal | null
}

/** The vault's signed trades and grants of the last rolling hour and day, in basis points of its value, beside the caps. */
export type BookSignBudget = {
  hourUsedBps: number
  dayUsedBps: number
  hourCapBps: number
  dayCapBps: number
}

/** One signed sale, as `liquidate(bookId, quotes)` takes it. */
export type BookSignedQuote = {
  adapter: BooksAddress
  tokenIn: BooksAddress
  tokenOut: BooksAddress
  amountIn: BooksUnits
  minOut: BooksUnits
  route: BooksHex
  deadline: string
  salt: string
  signature: BooksHex
}

/** The request's stock access: `open` for a request an API key authorizes. */
export type BookSigningAccess = "open" | "restricted"

/** The staking contract's figures for the Book, its base-pair legs named `Quote`. */
export type BookStakeState = {
  mode: "stake" | "burn"
  totalStaked: BooksUnits
  /** When the fees stop paying out: the unlock. */
  periodFinish: number
  /** The staking contract's last payout, in chain seconds. */
  lastUpdate?: number
  pendingQuote: BooksUnits
  pendingBook: BooksUnits
  drippedQuote: BooksUnits
  drippedBook: BooksUnits
  burnedQuote: BooksUnits
  burnedBook: BooksUnits
}

/** The Book's next step, for whoever the contracts allow. */
export type BookStep = "arm" | "buy" | "graduate" | "bond" | "trade" | "liquidate" | "redeem" | "none"

/** A Book's flags at the head's second, beside its step. */
export type BookStepFlags = {
  /** An open-ended raise past its window: still raising, at the falling tax. */
  pastWindow: boolean
  /** The market cap reached the mark while the curve is open, and the curve may close: anyone may graduate the Book. */
  graduatable: boolean
  /** The market cap reached the mark before the curve may close, an hour after the tax reaches 1%. */
  markWaitsForBondGap: boolean
  /** The ETH/USD feed is more than 48 hours old, answers zero or less, or is stamped after the block. A WETH Book's raise stops, and a Book of another base pair cannot note its tax or bond. */
  feedStale: boolean
}

/** One Book on the board, and the head of its page. */
export type BookSummary = {
  /** The creator's profile carries Mancer's verified mark now. The Book's X (`profile.links.x`) is that creator's own. */
  creatorVerified?: boolean
  /** The Book token, which names the Book. */
  token: BooksAddress
  deployment: BookDeploymentRef
  /** The Book's id on its deployment. Name a Book by its token. */
  bookId: string
  /** The Book's vault. */
  vault: BooksAddress
  /** The display name where the deployment names one, else the chain's name; the same as `displayName`. */
  name: string
  displayName: string
  symbol: string
  /** Every Book token has 18 decimals. */
  decimals: 18
  /** `impersonator` where the Book's symbol is a verified token's symbol, or its name or symbol holds a protected name as a whole word (Mancer, StonkBrokers, TOKENIZE): such a Book is never ranked. */
  nameFlag: "impersonator" | null
  /** The Book's base pair. */
  quote: BookQuoteRef
  venue: BookVenueState
  /** The wallet that opened the Book. */
  creator: BooksAddress
  /** The Book's traders, one to eight. */
  traders: {
    address: BooksAddress
    /** The creator's own seat, or seen confirming, cancelling or revoking on chain. */
    acted: boolean
    /** The trader's wallet carries Mancer's verified mark now. */
    verified: boolean
    /** The trader's Ethos reading, at most 30 minutes old; null where none is held. */
    ethos: BookTraderEthos | null
  }[]
  /** `flagged` where the creator or a trader who acted has an Ethos score under 800; else `trusted` where one carries the verified mark or an Ethos score of 1,600 or more; else `plain`. */
  trust: BookTrust
  /** The verified accounts' votes on the Book. */
  votes: BookVoteCounts
  /** What its creator set of it. */
  profile: BookProfile
  traderCount: number
  phase: BookPhase
  step: BookStep
  launchPhase: BookLaunchPhase
  flags: BookStepFlags
  launchMode: BookLaunchMode | null
  /** Where the locked market's fees go: to stakers, or burned. */
  lpFeeMode: "stake" | "burn"
  /** The term, from the bond. */
  durationSecs: number
  times: {
    openedAt: number
    armedAt: number | null
    /** When the opening tax reaches its 1% floor. */
    antiSnipeEndsAt: number | null
    /** The earliest second the mark closes the curve: an hour after the tax reaches 1%. */
    minBondAt: number | null
    /** The window's end, or a buys-only Book's bond clock. It closes the curve where `forcedBond`. */
    deadline: number | null
    /** The window's end closes the curve. */
    forcedBond: boolean | null
    bondedAt: number | null
    /** The term's end. */
    unlockAt: number | null
    /** When anyone may settle: the unlock and the 2-day grace. */
    openToAllAt: number | null
    settledAt: number | null
    /** When its creator cancelled it. */
    cancelledAt: number | null
  }
  /** To the deadline while raising (null once an open-ended raise is past it), to the unlock while trading. */
  timeLeftSecs: number | null
  /** The raise while the Book waits, raises or has graduated; null after. */
  raise: BookRaiseSummary | null
  /** The Book token's market: before the bond, the curve's price and market cap, and no pool; after it, the locked market (the v3 pool, or the PoolManager and the pool id on v4). Priced in the base pair. */
  market: {
    pool: BooksAddress | null
    poolId: BooksHex | null
    /** The base pair's raw units per whole token. */
    pricePerTokenQuote: BooksUnits | null
    priceUsd: number | null
    marketCapUsd: number | null
  }
  /** What a settlement now would fix, while the Book trades or is frozen. */
  value: BookValue | null
  /** The Book's value in WETH: its raise before the bond; then its vault and the ETH its locked LP returns holders; once settled, what the settlement took in. Null if cancelled or unread. */
  bookValueWei: BooksUnits | null
  /** What its settlement fixed, once settled. */
  final: BookFinal | null
  rank: {
    /** Raised at least 0.1 ETH, a name not flagged, and a trader who acted. */
    ranked: boolean
    why: BookRankWhy | null
    /** What was sent to the vault from outside. */
    transfersInWei: BooksUnits
    /** What the board ranks by: while the Book trades or is frozen, its return net of what was sent to the vault from outside; once settled, its settlement's `returnBps`. */
    tradingReturnBps: number | null
  }
  /** The tracked holdings. A settled Book's leave out what the settlement emptied. */
  holdings: BookHoldings
  /** A settled Book alone: every token its vault tracked, its own token among them. */
  trackedTokens?: BooksAddress[]
  /** Its Book NFT market, where one passed its checks. */
  nftMarket: BookNftMarketSummary | null
}

/** A wallet by its code: none is `eoa`, an EIP-7702 delegation `delegated-eoa`, anything else `contract`. */
export type BookTakerKind = "eoa" | "delegated-eoa" | "contract"

/** A launch's terms, with the close fee and the traders' share. */
export type BookTerms = {
  startMcapUsd8: BooksUnits
  gradMcapUsd8: BooksUnits
  startTaxBps: number
  taxDecayPerMinBps: number
  /** The raise window, or a buys-only Book's bond clock. */
  windowSecs: number
  buysOnly: boolean | null
  bondAfterSecs: number | null
  guaranteedBond: boolean | null
  /** How long the opening tax takes to reach 1%. */
  antiSnipeSecs: number | null
  /** The hour after that before the mark may close the curve. */
  bondGapSecs: number | null
  /** The base pair. */
  quote: BooksAddress
  venue: BookVenue
  hook: BooksAddress | null
  /** The close fee on a Book's closing value: 200. */
  closeFeeBps: number | null
  /** Mancer's share of the close fee: 5,000 of 10,000. */
  closeFeeMancerShareBps: number | null
  /** The traders' share of the profit left after the close fee: 2,000. */
  traderProfitShareBps: number
}

/** A page of a Book's theses. */
export type BookThesesResponse = {
  /** What the session's profile is to the Book, by `role`'s rule: where it is set, the session's vote counts in neither number. Null without a session. */
  viewerRole?: "creator" | "trader" | null
  votes: BookVoteCounts
  theses: BookThesis[]
  /** The next page's `cursor`; null on the last page. */
  nextCursor: string | null
  /** The session's own vote; null without a session. */
  mine: BookMyVote | null
  /** The short identity of each listed voter who shows something. */
  users: {
    [key: string]: BooksShortIdentity
  }
}

/** One wallet's thesis on a Book. */
export type BookThesis = {
  /** What the voter's profile is to the Book: `trader` for a trader who acted on chain, else `creator`; null where it is not the Book's own. */
  role?: "creator" | "trader" | null
  voter: BooksAddress
  side: BookVoteSide
  /** Plain text, line breaks as `\n`. */
  text: string
  /** The voter is the Book's own: its creator, or a trader who acted. Its vote counts in no number. */
  trader: boolean
  /** The voter's account carries Mancer's verified mark now. */
  verified: boolean
  /** Unix seconds of its last change. */
  at: number
}

/** A token an answer names, with what the market knows of it. */
export type BookTokenMeta = {
  symbol: string | null
  name: string | null
  decimals: number | null
  /** An issued stock. */
  isStock: boolean
  /** On Mancer's verified list. */
  verified: boolean
  priceUsd: number | null
}

/** Every token an answer names, by address. */
export type BookTokenMetaMap = {
  [key: string]: BookTokenMeta
}

/** One Book the wallet created or traded on chain. */
export type BookTraderBook = {
  token: BooksAddress
  name: string
  symbol: string
  /** `creator`, `trader` (acted, not the creator), or `creator-trader`. */
  role: "creator" | "trader" | "creator-trader"
  phase: BookPhase
  /** Trading or frozen: the vault's value less its cost basis, over the cost basis, at the Book's last reading. Null otherwise. */
  returnBps: number | null
  /** Settled: the trading return a holder kept, the settlement's `afterFeesBps` (its NAV after the close fee and the traders' cut, over the cost basis). Null otherwise. */
  holderReturnBps: number | null
  /** Settled: the vault's NAV less its cost basis, over the cost basis, as the settler's `Liquidated` told it, gross of the close fee and the cut, before any later sweep. Null otherwise. */
  vaultReturnBps: number | null
  /** The Book is settled. */
  final: boolean
  /** Unix seconds of the figure. */
  asOf: number | null
}

/** The wallet's Books, created or traded on chain. */
export type BookTraderBooksRecord = {
  count: number
  created: number
  traded: number
  settled: number
  live: number
  /** The settled Books' mean holder return; null where none settled. */
  averageHolderReturnBps: number | null
  /** The settled Books' best holder return. */
  bestHolderReturnBps: number | null
  /** The settled Books' mean vault return. */
  averageVaultReturnBps: number | null
  /** The settled Books' best vault return. */
  bestVaultReturnBps: number | null
  /** Every one, newest first. */
  books: BookTraderBook[]
}

/** A trader's Ethos (ethos.network) reading. */
export type BookTraderEthos = {
  /** The credibility score, 0 to 2,800. */
  score: number
  level: BookEthosLevel
  reviews: {
    positive: number
    neutral: number
    negative: number
  }
  /** The vouches it received. */
  vouches: number
  /** Its Ethos profile's page; null where it has no Ethos user. */
  url: string | null
}

/** `ready`, `computing` (ask again after `Retry-After`), or `unavailable`. */
export type BookTraderFiguresStatus = "ready" | "computing" | "unavailable"

/** One item of a trader's history: a trade of its own, or a vault trade it proposed. */
export type BookTraderHistoryItem = BookTraderSwapItem | BookTraderVaultItem

/** A trader's own trades and the executed vault trades it proposed, newest first. */
export type BookTraderHistoryResponse = {
  address: BooksAddress
  status: BookTraderFiguresStatus
  computedAt: number | null
  /** At or below this block, an own trade with no figure may have sold. */
  salesCutBlock: number | null
  /** Some vault trades carry no figure this time. */
  partial: boolean
  items: BookTraderHistoryItem[]
  /** The next page's `before`; null on the last page. */
  nextBefore: string | null
  tokens: BookTokenMetaMap
}

/** A wallet's record as a Books trader. */
export type BookTraderRecordResponse = {
  address: BooksAddress
  books: BookTraderBooksRecord
  status: BookTraderFiguresStatus
  /** Null unless `status` is `ready`. */
  trading: BookTraderTradingRecord | null
  /** Unix seconds; null unless `status` is `ready`. */
  computedAt: number | null
}

/** One of the top traders. */
export type BookTraderRow = {
  address: BooksAddress
  books: number
  live: number
  settled: number
  /** The best settled Book's return. */
  bestReturnBps: number | null
  /** The best trading return (`rank.tradingReturnBps`) of its live Books, at their last readings. */
  liveBestReturnBps: number | null
  /** This trader's share of the traders' cut over settled Books. */
  cutEarnedWei: BooksUnits
  /** The newest Book of the trader. */
  latestBook: BooksAddress
}

/** One of the wallet's own trades. */
export type BookTraderSwapItem = {
  kind: "swap"
  txHash: BooksHex
  blockNumber: number
  timestamp: number
  token: BooksAddress
  tokenSymbol: string | null
  cash: BooksAddress
  cashSymbol: string | null
  side: "buy" | "sell"
  amountToken: number | null
  amountCash: number | null
  priceUsd: number
  volumeUsd: number
  venue: string
  realized: BookRealized | null
}

/** The wallet's own trading. WETH and USDG are cash, and liquidity moves are no trades. */
export type BookTraderTradingRecord = {
  realizedUsd: number
  /** Null where ETH's prices did not read. */
  realizedEth: number | null
  /** The tokens sold at a gain over the tokens sold; null where the record is thin or nothing was sold. */
  winRateBps: number | null
  tokensWon: number
  tokensSold: number
  trades: number
  tokensTraded: number
  /** Unix seconds of its first trade. */
  firstTradeAt: number | null
  /** Fewer than 20 trades: no rate is shown. */
  thin: boolean
  /** Some moves were priced at an estimate. */
  estimated: boolean
  /** The record is not whole. */
  truncated: boolean
}

/** One vault trade the wallet proposed, executed. */
export type BookTraderVaultItem = {
  kind: "vault-trade"
  book: {
    token: BooksAddress
    name: string
    symbol: string
  }
  digest: BooksHex
  txHash: BooksHex
  blockNumber: number
  timestamp: number
  tokenIn: BooksAddress
  tokenOut: BooksAddress
  amountIn: BooksUnits
  amountOut: BooksUnits
  realized: BookRealized | null
}

/** A vault's trades, newest first. */
export type BookTradesResponse = {
  trades: BookVaultTrade[]
  nextBefore: number | null
  tokens: BookTokenMetaMap
}

/** A Book's trust, read of its creator and the traders who acted. */
export type BookTrust = "trusted" | "plain" | "flagged"

/** What never redeems once a Book settled: the tokens behind NFTs stuck in the market's vault and tokens sent to it, and the pot they keep. */
export type BookUnredeemable = {
  tokens: BooksUnits
  potShareWei: BooksUnits
}

/** What a settlement now would fix, while a Book trades or is frozen: the close fee first, then the traders' cut. */
export type BookValue = {
  /** The vault's value in WETH wei. */
  navWei: BooksUnits
  /** What the locked market would return to holders now, in WETH: it takes no close fee and no cut, and is inside `holderPotWei`. */
  lpPotWei: BooksUnits | null
  /** The locked market's base-pair fees not yet harvested, in WETH. */
  owedLpFeesWei: BooksUnits
  closeFeeWei: BooksUnits | null
  closeFeeMancerWei: BooksUnits | null
  /** StonkBrokers' half of the close fee. */
  closeFeeProtocolWei: BooksUnits | null
  /** The holders' pot, the locked market's return included. */
  holderPotWei: BooksUnits
  circulating: BooksUnits | null
  /** The holders' pot over circulating: WETH wei per whole token. */
  backingPerTokenWei: BooksUnits | null
  /** The vault's gain over its cost basis in basis points, (value less cost basis) over cost basis, gross of the close fee and the traders' cut. */
  returnBps: number | null
  /** The trading pot's return after the close fee and the traders' cut: the holders' pot less the LP pot, over the cost basis. The LP pot is the locked liquidity's own principal. */
  afterFeesBps: number | null
  /** The market price over the backing. */
  priceToBackingBps: number | null
  /** Always false: a Book's value always reads whole. Kept for clients built before it. */
  partial: boolean
  /** A holding is valued at a reference price, not a route, or at a sale priced for another amount and scaled. */
  approx: boolean
  asOf: BooksHead
}

/** How a holding is valued: `weth`, `burned-at-settlement` (the Book's own token), `mancer-plan` (a route Mancer planned), `reference` (a reference price), or `none`. */
export type BookValueSource = "weth" | "burned-at-settlement" | "mancer-plan" | "reference" | "none"

/** One token the vault tracks. */
export type BookVaultHolding = {
  token: BooksAddress
  symbol: string | null
  decimals: number | null
  isWeth: boolean
  isBook: boolean
  /** The vault's tracked balance. */
  tracked: BooksUnits | null
  /** What the vault holds. */
  balance: BooksUnits | null
  /** What it sells for, in WETH wei. */
  valueWei: BooksUnits | null
  valueSource: BookValueSource
  /** A settlement can sell it now. */
  sellable: boolean
  /** Always null on a Book's page: each token's verdict is the policy route's. */
  policy: string | null
  /** Why this token's value did not read, where it did not: its read failed, or it has no plan to WETH. */
  readFailed: string | null
}

/** The `TradeIntent` `proposeTrade` takes, at the vault's `tradeNonce()`. */
export type BookVaultIntent = {
  adapter: BooksAddress
  tokenIn: BooksAddress
  tokenOut: BooksAddress
  amountIn: BooksUnits
  minOut: BooksUnits
  route: BooksHex
  nonce: string
  deadline: string
  quoteSalt: string
  mancerSig: BooksHex
}

/** The vault's positions and trades in WETH wei. */
export type BookVaultPnl = {
  realizedWei: BooksSignedUnits
  /** Null where the Book has no valuation of its holdings. */
  unrealizedWei: BooksSignedUnits | null
  positions: BookVaultPosition[]
  trades: BookVaultTradePnl[]
  /** A figure did not read whole; a later read may carry it. */
  partial: boolean
  /** The valuation the unrealized figure reads. */
  asOf: {
    block: number
    timestamp: number
  } | null
}

/** A vault's PnL. */
export type BookVaultPnlResponse = {
  pnl: BookVaultPnl
  tokens: BookTokenMetaMap
}

/** One of the vault's positions. */
export type BookVaultPosition = {
  token: BooksAddress
  boughtUnits: BooksUnits
  spentWei: BooksUnits
  soldUnits: BooksUnits
  receivedWei: BooksUnits
  /** What its sales received less the cost of what they sold. */
  realizedWei: BooksSignedUnits
  /** What the vault holds of it, at the Book's last reading. */
  heldUnits: BooksUnits | null
  valueWei: BooksUnits | null
  /** Its value less the cost of what is held, at the Book's last reading. */
  unrealizedWei: BooksSignedUnits | null
}

/** The route decoded, with what it delivers. */
export type BookVaultQuotePlan = {
  tokenIn: BooksAddress
  tokenOut: BooksAddress
  amountIn: BooksUnits
  /** The route's floor. */
  minAmountOut: BooksUnits
  /** Who the route pays: the vault. */
  recipient: BooksAddress
  deadline: number
  /** Mancer's swap fee inside the route. */
  feeBps: number
  feeMode: "input" | "output" | "mid"
  /** The route's legs. */
  legs: {
    tokenIn: BooksAddress
    tokenOut: BooksAddress
    amountIn: BooksUnits
  }[]
  /** The route's output, gross of Mancer's fee. */
  expectedOut: BooksUnits
  priceImpactBps: number
  feeAsset: BooksAddress
  /** Every middle token is spent whole. */
  middlesSwept: boolean
  route: BookQuoteRoute
}

/** A vault quote request. A field it does not name is refused. */
export type BookVaultQuoteRequest = {
  /** The wallet that will send the transaction, which your servers vouch for (`wallet-required` without it): a trader of the Book for a trade, and a wallet that may settle it for a sweep. */
  wallet?: Address
  /** `trade` while the Book trades, or `sweep` once it settled. */
  purpose: "trade" | "sweep"
  /** An ERC-20 the vault tracks (a trade) or holds (a sweep). */
  tokenIn: Address
  /** Required for a trade. A sweep sells for WETH. */
  tokenOut?: Address
  /** Raw units above zero. A trade's amount, at most what the vault tracks. A sweep's, at most what it holds, all of it by default. */
  amountIn?: string
  /** The floor's band under what the route delivered: 10 to 30 with one trader, 30 to 100 with several, 50 to 150 for a sweep. */
  slippageBps?: number
  /** The quote's life in seconds, its purpose's shortest: 300 with one trader or for a sweep, and 900 with several traders. It may name only that, and any other is 400 `bad-body`. */
  deadlineSec?: number
  /** Optional; the Book's vault. */
  vault?: Address
  /** Every check and the simulation, and no signature. */
  preview?: true
  /** With `preview`, the vault's `pendingDigest()`, 32 bytes of hex: a preview of the pending trade. */
  pendingDigest?: string
}

/** A signed vault quote: the `MancerQuote` at the top level, and its intent, plan, simulation and policy beside it. */
export type BookVaultQuoteResponse = {
  purpose: "trade" | "sweep"
  preview: boolean
  adapter: BooksAddress
  tokenIn: BooksAddress
  tokenOut: BooksAddress
  amountIn: BooksUnits
  minOut: BooksUnits
  route: BooksHex
  deadline: string
  salt: string
  /** Mancer's signature; null on a preview, and `0x` on a sweep of WETH or of the Book token, which is unsigned. */
  signature: BooksHex | null
  /** The quote's EIP-712 digest, equal to the vault's `hashQuote`; null on a preview and on a sweep of WETH or of the Book token. */
  digest: BooksHex | null
  /** The trade's intent; null on a preview and for a sweep. */
  intent: BookVaultIntent | null
  /** The route decoded; null for a sweep of WETH or the Book token. */
  plan: BookVaultQuotePlan | null
  /** The vault's own call simulated at the head, and its gas: for a trade, what the vault gained; for a sweep, the WETH it added to the holders' pot. Null on a sweep of WETH or of the Book token. */
  simulation: {
    amountOut: BooksUnits
    proposeGas: number | null
    executeGas: number | null
    block: number
  } | null
  policy: {
    bandBps: number
    deadlineSec: number
    impactBps: number
    /** How far the route's rate sits under the reference prices, after the route's own pool fees up to the policy's allowance; null for a sweep of WETH or of the Book token. */
    divergenceBps: number | null
    solo: boolean
    access: BookSigningAccess
    budget: BookSignBudget
    /** What the budget counts for this trade, in WETH; null for a sweep. */
    notionalWei: BooksUnits | null
  }
  /** The pending trade a proposal of this quote replaces, and who had confirmed it. */
  replaces: {
    digest: BooksHex
    confirmedBy: BooksAddress[]
  } | null
  /** A sweep's close fee on the WETH it adds to the pot; null for a trade. */
  closeFeeDeltaWei: BooksUnits | null
  closeFeeDeltaMancerWei: BooksUnits | null
  closeFeeDeltaProtocolWei: BooksUnits | null
  /** The address that signed; null on a preview and on a sweep of WETH or of the Book token. */
  signer: BooksAddress | null
  deployment: BookDeploymentRef
  /** The Book's id on its factory. */
  bookId: string
  /** The vault the quote is signed for: the one the Book's factory names. Read it on your own node before you sign. */
  vault: BooksAddress
  head: BooksHead
  tokens: BookTokenMetaMap
}

/** The Book's vault. */
export type BookVaultState = {
  address: BooksAddress
  /** The vault's `tradeNonce()`. */
  tradeNonce: string
  /** How many tokens it tracks. */
  trackedCount: number
  /** The most it may track: 16. */
  maxTracked: number
  holdings: BookVaultHolding[]
  /** Tokens it holds and does not track, which only a sweep sells. */
  untracked: {
    token: BooksAddress
    symbol: string | null
    balance: BooksUnits
  }[]
  /** The pending trade, where one waits. */
  pending: BookPendingIntent | null
  /** The pending order and every order granted. */
  orders: {
    orderNonce: string
    pending: BookPendingOrder | null
    grants: BookGrantRow[]
  } | null
  /** Always null on a Book's page: the vault's signed budget is the policy route's (`GET /v1/books/{token}/policy`). */
  budget: {
    hourUsedBps: number
    dayUsedBps: number
  } | null
}

/** One vault trade, one row a proposal. */
export type BookVaultTrade = {
  digest: BooksHex
  status: "executed" | "pending" | "replaced" | "expired"
  proposed: {
    block: number
    time: number
    tx: BooksHex
    /** The trader who proposed it. */
    by: BooksAddress | null
  }
  confirmations: {
    trader: BooksAddress
    block: number
    tx: BooksHex
  }[]
  executed: {
    block: number
    time: number
    tx: BooksHex
    amountOut: BooksUnits
  } | null
  adapter: BooksAddress
  adapterKind: "uniswap" | "mancer" | "unknown"
  tokenIn: BooksAddress
  tokenOut: BooksAddress
  amountIn: BooksUnits
  minOut: BooksUnits
  /** The route by its legs. */
  route: {
    kind: "one-hop-1pct" | "uniswap-path" | "mancer-plan"
    legs: {
      tokenIn: BooksAddress
      tokenOut: BooksAddress
    }[]
  }
}

/** One executed vault trade, as the PnL counts it. */
export type BookVaultTradePnl = {
  digest: BooksHex
  tx: BooksHex
  /** `exact` (a WETH leg), `estimated` (priced in US dollars over that day's ETH price) or `unpriced`. */
  priced: "exact" | "estimated" | "unpriced"
  valueWei: BooksUnits | null
  /** What a sale realized, in WETH wei; null on a purchase, a trade of cash, a trade nothing priced, and a sale of a token the vault held none of. */
  realizedWei: BooksSignedUnits | null
}

/** Where a Book's market is locked: Uniswap v3, or Uniswap v4. */
export type BookVenue = "uniswap-v3" | "uniswap-v4"

/** The venue a Book named at its open, and where it bonded. */
export type BookVenueState = {
  requested: BookVenue
  /** Null until bonded. */
  bonded: BookVenue | null
  /** A v4 lock that fell back to v3. */
  fellBack: boolean
  /** The v4 hook the Book named; null for none. */
  hook: BooksAddress | null
}

/** A Book's votes: the wallets on each side that carry Mancer's verified mark now, the Book's own creator and acted traders left out. */
export type BookVoteCounts = {
  up: number
  down: number
}

/** A wallet's side on a Book. */
export type BookVoteSide = "up" | "down"

/** What the wallet can do next on a Book: the first that applies, in the order arm, graduate or bond, confirm, liquidate, unstake-then-redeem, redeem, unwrap-then-redeem, claim-cut, claim-fees. */
export type BookWalletNext = "arm" | "graduate" | "bond" | "liquidate" | "unstake-then-redeem" | "redeem" | "unwrap-then-redeem" | "claim-cut" | "claim-fees" | "confirm"

/** The Book NFTs the wallet holds of the Book's market. */
export type BookWalletNfts = {
  collection: BooksAddress
  count: number
  /** At most 100, lowest first. */
  ids: string[]
  truncated: boolean
  /** The Book tokens behind them. */
  tokens: BooksUnits
  /** A settled Book: what those tokens redeem for once unwrapped, and the unwraps' fee now. */
  redeemAfterUnwrap: {
    tokens: BooksUnits
    payoutWei: BooksUnits
    unwrapFeeWei: BooksUnits | null
  } | null
}

/** A wallet's Books. */
export type BookWalletResponse = {
  head: BooksHead
  wallet: BooksAddress
  /** A part of the answer did not read: a row names what it lacks in `unread`. */
  partial: boolean
  /** The block the answer's figures have read through; null where one did not say. */
  indexedBlock?: number | null
  /** What the wallet holds did not read, and the Books it only holds are left out. Present only where it did not. */
  ledgerUnread?: true
  books: BookWalletRow[]
  tokens: BookTokenMetaMap
}

/** One Book the wallet touches. */
export type BookWalletRow = {
  /** The board lists the Book: it is armed and names a target beyond WETH, USDG and its base pair. */
  listed?: boolean
  /** The Book token, which names the Book. */
  token: BooksAddress
  deployment: BookDeploymentRef
  /** The Book's id on its deployment. Name a Book by its token. */
  bookId: string
  displayName: string
  symbol: string
  phase: BookPhase
  step: BookStep
  flags: BookStepFlags
  /** The Book's base pair. */
  quote: BookQuoteRef
  /** The raise while the Book waits, raises or has graduated; null after. */
  raise: BookRaiseSummary | null
  /** `impersonator` where the Book's symbol is a verified token's symbol, or its name or symbol holds a protected name as a whole word (Mancer, StonkBrokers, TOKENIZE): such a Book is never ranked. */
  nameFlag: "impersonator" | null
  /** The Book's logo path; null where none was set. */
  logo: string | null
  /** The wallet's roles on the Book. */
  roles: {
    /** The wallet acted in its seat on chain (confirmed a trade or an order, or settled the Book), or is the creator in its own seat. */
    traderActed?: boolean
    creator: boolean
    trader: boolean
    operatorNftId: string | null
    operatorNft: {
      address: BooksAddress
      tokenId: string
    } | null
    /** The wallet made the Book's NFT market, and may change its image. */
    marketMaker: boolean
  }
  /** The Book tokens it holds. */
  held: BooksUnits
  /** The Book tokens it staked. */
  staked: BooksUnits
  /** Its staking fees: the base pair's and the Book token's. */
  earned: {
    quote: BooksUnits
    bookWei: BooksUnits
  }
  /** What the curve will buy back from it. */
  boughtOnCurve: BooksUnits | null
  /** Its held and staked tokens at a token's worth, in WETH wei: what each would redeem for if the Book settled now, or once settled `final.payoutPerTokenWei`. Null before the bond, if cancelled or unread. */
  atBackingWei: BooksUnits | null
  /** What its tokens are worth at the market price. */
  atPriceWei: BooksUnits | null
  /** A settled Book: the tokens it holds and what they redeem for. */
  redeemable: {
    amount: BooksUnits
    payoutWei: BooksUnits
  } | null
  /** The traders' cut it is owed. */
  cutOwedWei: BooksUnits
  /** A vault trade or order that waits on this trader's confirmation. */
  pendingOnYou: {
    kind: "trade" | "order"
    digest: BooksHex
  } | null
  /** Its Book NFTs; null where it holds none. */
  nfts: BookWalletNfts | null
  next: BookWalletNext | null
  /** The figures of this row that did not read, never to be read as none. Present only where one did not. */
  unread?: BookWalletUnread[]
}

/** A row's figure that did not read. */
export type BookWalletUnread = "held" | "staked" | "earned" | "cutOwed" | "boughtOnCurve" | "redeemable" | "operatorNft" | "pendingOnYou"

/** Activity across every Book, newest first, a page cut at a block's end. */
export type BooksActivityResponse = {
  head: BooksHead
  items: BookActivityItem[]
  /** The market swaps did not read, and are left out. */
  partial: boolean
  /** The next page's `before`; null on the last page. */
  nextBefore: number | null
  tokens: BookTokenMetaMap
}

/** A lowercase 20-byte hex address. */
export type BooksAddress = string

/** A page of the board. */
export type BooksBoardResponse = {
  head: BooksHead
  /** The lowest block the index has read every deployment through; null where no deployment passed Mancer's checks. */
  indexedBlock: number | null
  /** Each phase's count over the search, before the phase filter. */
  counts: {
    waiting: number
    raising: number
    graduated: number
    trading: number
    frozen: number
    settled: number
    aborted: number
  }
  books: BookSummary[]
  /** The next page's offset; null on the last page. */
  nextOffset: number | null
  /** Every token the page names: its Books, their holdings and their targets. */
  tokens: BookTokenMetaMap
}

/** Every deployment of the Books contracts Mancer serves. */
export type BooksDeploymentsResponse = {
  deployments: BookDeploymentView[]
}

/** The chain head a figure was read at. */
export type BooksHead = {
  block: number
  /** Chain seconds. */
  timestamp: number
}

/** `0x`-prefixed hex. */
export type BooksHex = string

/** A wallet as a list shows it. Every field but the address is null where the wallet shows nothing of it. */
export type BooksShortIdentity = {
  address: BooksAddress
  username: string | null
  displayName: string | null
  /** The picture's path on the API. */
  avatar: string | null
  /** The verified mark, and what earned it. */
  verified: {
    basis: "x-followers" | "mancer"
  } | null
  x: {
    username: string
  } | null
}

/** An integer of raw units as a decimal string, negative where a fee or a loss is more than what it is set against. */
export type BooksSignedUnits = string

/** The figures of a set of Books. */
export type BooksStats = {
  books: {
    total: number
    byPhase: {
      waiting: number
      raising: number
      graduated: number
      trading: number
      frozen: number
      settled: number
      aborted: number
    }
  }
  /** The bonded Books' raises in WETH, and the curve's buys and sales. */
  raise: {
    raisedEthWei: BooksUnits
    buys: number
    sells: number
  }
  /** The vaults' executed trades and granted orders. */
  vaults: {
    trades: number
    ordersGranted: number
  }
  /** The close fee accrued across every Book, claimed by each recipient, and owed. */
  closeFee: {
    bps: number
    accruedWei: BooksUnits
    mancerWei: BooksUnits
    protocolWei: BooksUnits
    claimedWei: {
      mancer: BooksUnits
      protocol: BooksUnits
    }
    owedWei: {
      mancer: BooksUnits
      protocol: BooksUnits
    }
  }
  /** The Book NFT markets that passed their checks: the NFTs moved through them, and their fees. */
  nftMarket: {
    markets: number
    nftsMoved: number
    wrapped: number
    unwrapped: number
    sold: number
    bought: number
    feesWei: BooksUnits
    mancerWei: BooksUnits
    protocolWei: BooksUnits
    flushedWei: {
      mancer: BooksUnits
      protocol: BooksUnits
    }
    owedWei: {
      mancer: BooksUnits
      protocol: BooksUnits
    }
  }
}

/** One deployment's figures. */
export type BooksStatsDeployment = {
  books: {
    total: number
    byPhase: {
      waiting: number
      raising: number
      graduated: number
      trading: number
      frozen: number
      settled: number
      aborted: number
    }
  }
  /** The bonded Books' raises in WETH, and the curve's buys and sales. */
  raise: {
    raisedEthWei: BooksUnits
    buys: number
    sells: number
  }
  /** The vaults' executed trades and granted orders. */
  vaults: {
    trades: number
    ordersGranted: number
  }
  /** The close fee accrued across every Book, claimed by each recipient, and owed. */
  closeFee: {
    bps: number
    accruedWei: BooksUnits
    mancerWei: BooksUnits
    protocolWei: BooksUnits
    claimedWei: {
      mancer: BooksUnits
      protocol: BooksUnits
    }
    owedWei: {
      mancer: BooksUnits
      protocol: BooksUnits
    }
  }
  /** The Book NFT markets that passed their checks: the NFTs moved through them, and their fees. */
  nftMarket: {
    markets: number
    nftsMoved: number
    wrapped: number
    unwrapped: number
    sold: number
    bought: number
    feesWei: BooksUnits
    mancerWei: BooksUnits
    protocolWei: BooksUnits
    flushedWei: {
      mancer: BooksUnits
      protocol: BooksUnits
    }
    owedWei: {
      mancer: BooksUnits
      protocol: BooksUnits
    }
  }
  factory: BooksAddress
  label: string
  /** What the settlement contract holds now: every settled Book's pot, unclaimed cuts and unclaimed close fees together. */
  settlerReservedWethWei: BooksUnits | null
}

/** Books in numbers, in total and by each deployment that has a listed Book. */
export type BooksStatsResponse = {
  head: BooksHead
  /** The lowest block the index has read every deployment through. */
  indexedBlock: number | null
  total: BooksStats
  deployments: BooksStatsDeployment[]
}

/** The top traders over the ranked Books. */
export type BooksTradersResponse = {
  traders: BookTraderRow[]
}

/** A non-negative integer of raw units, as a decimal string. */
export type BooksUnits = string

/** Why the collection's picture is not served. */
export type NftArtReason = "held" | "host-not-allowed" | "not-an-image" | "too-large" | "copies-verified-art" | "off" | "unverified"

/** A market call. */
export type NftMarketAction = "open" | "wrap" | "unwrap" | "sell" | "buy-oldest" | "buy-specific" | "set-image"

/** A Book with no market yet. */
export type NftMarketNone = {
  exists: false
  /** Who may open it: the creator, and the operator NFT's holder once it moved after settlement. */
  operators: BooksAddress[]
  /** False once the Book is cancelled. */
  canOpen: boolean
}

/** A Book's NFT market. */
export type NftMarketOpen = {
  exists: true
  /** It passed Mancer's checks. An unverified market's routes answer 503 `nft-market-unverified`. */
  verified: boolean
  vault: BooksAddress
  nft: BooksAddress
  name: string
  symbol: string
  nameFlag: "impersonator" | null
  /** The only address that may change the image. */
  maker: BooksAddress
  /** The collection's picture on Mancer's own route, never the maker's URL. */
  art: {
    path: string | null
    reason: NftArtReason | null
  }
  tokensPerNft: BooksUnits
  /** Its opening; null for some seconds after it. */
  created: {
    block: number
    time: number
    tx: BooksHex
  } | null
  /** NFTs not burned and not for sale (`backed`), held by wallets (`outside`), for sale (`inventory`), and stuck in the vault (`stuck`). */
  nfts: {
    backed: number
    outside: number
    inventory: number
    stuck: number
  }
  /** Ids for sale, oldest first, at most 100 here. */
  inventory: {
    oldest: string[]
    truncated: boolean
  }
  escrow: {
    tokens: BooksUnits
    shareOfCirculatingBps: number | null
  }
  /** Tokens that never redeem: behind stuck NFTs, and sent to the vault. */
  lockedForGood: {
    stuckNfts: number
    donatedTokens: BooksUnits
    tokens: BooksUnits
  }
  /** The fee for one NFT moved: $1 in ETH. */
  fee: {
    perNftWei: BooksUnits | null
    usd: 1
    bufferBps: number
    /** The feed is more than 48 hours old, answers zero or less, or is stamped after the block: every move reverts. */
    paused: boolean
    feed: {
      updatedAt: number
      ageSecs: number
      stale: boolean
    }
  }
  /** This market's own fees: paid, each half, flushed, and owed. */
  fees: {
    paidWei: BooksUnits
    mancerWei: BooksUnits
    protocolWei: BooksUnits
    flushedWei: {
      mancer: BooksUnits
      protocol: BooksUnits
    }
    owedWei: {
      mancer: BooksUnits
      protocol: BooksUnits
    }
  }
  /** One NFT's tokens at the backing while the Book trades or is frozen, and what they would redeem for now once it settled. */
  perNft: {
    backingWei: BooksUnits | null
    redeemWei: BooksUnits | null
    feeExceedsValue: boolean | null
  }
  moves: {
    wrapped: number
    unwrapped: number
    sold: number
    bought: number
  }
  /** Why a read failed, where one did: its figures are partial. */
  readFailed: string | null
}

/** The market: none yet, or open. */
export type NftMarketState = NftMarketNone | NftMarketOpen

/** Every Books refusal and outage, in the one envelope every error answer is (`Error`). */
export type BooksError = {
  /** A sentence naming what was wrong. */
  error: string
  /** A stable code. The Books errors guide lists every one with its status. */
  code: "bad-query" | "bad-address" | "not-a-book" | "book-indexing" | "books-index-unavailable" | "books-state-unavailable" | "books-deployment-unverified" | "not-raising" | "book-cancelled" | "window-closed" | "window-closing" | "sells-disabled" | "sell-exceeds-curve" | "sell-exceeds-balance" | "feed-stale" | "zero-trade" | "slippage-exceeded" | "not-frozen" | "nft-market-unverified" | "no-nft-market" | "nft-market-exists" | "not-book-operator" | "not-market-maker" | "nft-market-paused" | "book-not-armed" | "book-settled" | "zero-count" | "batch-too-large" | "not-owner" | "not-in-inventory" | "inventory-short" | "insufficient-tokens" | "bad-tokens-per-nft" | "bad-image-url" | "bad-name" | "bad-symbol" | "bad-body" | "unknown-field" | "key-server-only" | "key-not-signing" | "wallet-required" | "not-a-trader" | "not-eligible-yet" | "not-an-eoa" | "wrong-phase" | "books-signing-off" | "books-signer-unavailable" | "books-signer-stopped" | "books-signer-has-code" | "books-signer-not-current" | "books-chain-stale" | "books-rate-limited" | "budget-exhausted" | "reversal-cooldown" | "reverses-live-order" | "amount-exceeds-tracked" | "vault-tracks-16" | "weth-spot" | "deadline-past-unlock" | "token-refused" | "stock-not-receivable" | "no-reference" | "no-route" | "route-pool-refused" | "middle-refused" | "route-touches-book-token" | "middle-not-swept" | "unknown-leg" | "route-mismatch" | "price-moved" | "impact-too-high" | "pool-take-too-high" | "vault-simulation-failed" | "books-sign-log-unavailable" | "pending-mismatch" | "order-fills-unavailable" | "logo-not-found"
  /** Whether the same request, sent again unchanged after `Retry-After`, may succeed. */
  retryable: boolean
  /** The `Retry-After` header's seconds, where the answer carries one. */
  retryAfterSeconds?: number
  /** What the refusal names, by code. */
  detail?: {
    [key: string]: unknown
  }
}

export type AccountEventsPage = {
  account: Address
  events: AccountEvent[]
  /** The cursor to read on from: the last event's `seq`, or `since` where the page is empty. */
  next: string
  /** More events past `next` now. */
  more: boolean
  /** The account's newest event's `seq`, or 0 where it has none. */
  head: string
  /** The newest `seq` dropped from the account's log by its retention, or 0. */
  floor: string
  /** `since` is under `floor`: events between the two were dropped. */
  truncated: boolean
}

/** One event of an account's log, the same on the route and on the stream. `kind` says what `data` holds; skip a kind you do not know. [Account events](/api/guides/account-events) lists each kind. */
export type AccountEvent = {
  /** The event's place in the log, a decimal string. Pass it as `since` to read past it. */
  seq: string
  kind: "order.placed" | "order.filled" | "order.completed" | "order.cancelled" | "order.expired" | "order.reopened" | "order.refused" | "notice.new" | "notice.counted" | "book.next" | "book.pending" | "book.redeemable" | "book.cut-owed" | "account.deletion-requested" | "account.deletion-cancelled"
  account: Address
  /** The account's wallet the event is about: the order's maker, the notice's recipient, the Book's party, or the account's own. */
  wallet: Address
  /** The event's subject: an order's hash, a notice's id, a Book's token, or the account. */
  key: string
  /** When the fact was written. */
  at: string
  data: AccountOrderEventData | AccountOrderFillData | AccountNoticeEventData | AccountBookEventData | AccountDeletionEventData
}

/** `account.deletion-requested` and `account.deletion-cancelled`: a linked wallet's request to delete the account. */
export type AccountDeletionEventData = {
  requestedBy: Address
  /** Unix seconds the wallet asked. */
  requestedAt: number
  /** Unix seconds the account is erased, had the request stood. */
  deletesAt: number
  /** `account.deletion-cancelled` alone: the wallet that cancelled it. */
  cancelledBy?: Address
  /** `account.deletion-cancelled` alone: the primary wallet, the wallet that asked, or that wallet's unlink. */
  reason?: "primary" | "requester" | "unlinked"
}

/** `order.placed`, `order.completed`, `order.cancelled`, `order.expired`, `order.reopened` and `order.refused`. */
export type AccountOrderEventData = {
  order: Hash
  /** The order book contract. */
  contract: Address
  /** The order's status after the fact. */
  status: "open" | "filled" | "cancelled" | "expired"
  /** The status before it, on every event but `order.placed` and `order.refused`. */
  previous?: string
  tokenIn?: Address
  tokenOut?: Address
  /** Raw units of `tokenIn` a fill sells. */
  amountPerFill?: string
  totalFills?: number
  fillsDone: number
  /** `order.refused` alone: the executor's reason, as `GET /v1/orders/{hash}` names it (`maker-funds`, `no-route`, `sell-blocked` and the rest). */
  code?: string
  /** `order.refused` alone: the reason in a sentence. */
  message?: string
}

/** `order.filled`: one fill. */
export type AccountOrderFillData = {
  order: Hash
  contract: Address
  /** The fill's place among the order's fills. */
  fillIndex: number
  /** Raw units of `tokenIn` the fill sold. */
  amountIn: string
  /** Raw units of `tokenOut` it delivered. */
  amountOut: string
  feeBps?: number
  txHash: Hash
  block: number
  /** The block's unix time. */
  at: number
  tokenIn?: Address
  tokenOut?: Address
  totalFills?: number
}

/** `notice.new` and `notice.counted`: the notice as the inbox holds it. */
export type AccountNoticeEventData = {
  /** The notice's id in the account's inbox. */
  id: string
  kind: "follow" | "trade" | "webhook" | "account-deletion"
  /** Who followed, or whose trades these are; for a webhook notice, the account's own wallet; for a deletion's, the wallet that asked or cancelled. */
  actor: Address
  /** Unix seconds: the follow's time, or the newest trade's block time. */
  at: number
  /** A trade notice's count of trades (1 for a follow). */
  trades: number
  /** The newest trade's transaction. */
  txHash?: string | null
  /** The newest trade, as the wallet's own trades list it (`GET /v1/wallets/{address}/swaps`). */
  trade?: {
    [key: string]: unknown
  } | null
  /** A webhook notice's hook, in place of `trade`: a hook made or paused. */
  webhook?: WebhookNotice
  /** An account deletion's notice, in place of `trade`: the request made or cancelled. */
  deletion?: DeletionNotice
}

/** `book.next`, `book.pending`, `book.redeemable` and `book.cut-owed`: the Book, its phase at the block it was read at, and the kind's own fields. */
export type AccountBookEventData = {
  token: Address
  bookId: string
  deployment: string
  symbol: string
  /** The Book's phase at `block`, as `GET /v1/books/{token}` names it. */
  phase: string
  step: string
  /** The block the Book was read at. */
  block: string
  /** `book.next` alone: what the wallet does next, or null where nothing waits on it now. */
  next?: "arm" | "graduate" | "bond" | "confirm" | "liquidate" | "unstake-then-redeem" | "redeem" | "unwrap-then-redeem" | "claim-cut" | "claim-fees" | null
  /** `book.next` alone: the step before. */
  previous?: string | null
  /** `book.pending` alone: a vault trade or a vault order waits on this trader. */
  kind?: "trade" | "order"
  /** `book.pending` alone: the proposal's digest, which the confirmation names. */
  digest?: string
  /** `book.pending` of a trade alone: what the proposal trades. */
  trade?: {
    tokenIn?: Address
    tokenOut?: Address
    amountIn?: string
    minOut?: string
    deadline?: string
  }
  /** `book.redeemable` alone: the wallet's tokens. */
  amount?: string
  /** `book.redeemable` alone: what they redeem for, in wei. */
  payoutWei?: string
  /** `book.cut-owed` alone: the cut owed the trader now, in wei. */
  cutOwedWei?: string
}

export type StreamTicket = {
  /** Send it as `ticket` in the join's payload, before `expiresAt`. Never put it in a URL. */
  ticket: string
  /** `account:<address>`, the account's primary wallet's. */
  topic: string
  /** The ticket's end: a minute on, or the session's end where that comes first. */
  expiresAt: string
  /** When the session ends, and the channel with it. */
  sessionExpiresAt: string
  /** The socket to join on. */
  socket: string
  /** The account's newest event's `seq` now. */
  head: string
}

/** One of the account's webhooks. No answer carries its secret after the one that made it. */
export type Webhook = {
  id: string
  url: string
  /** The kinds it delivers: kinds of the log, families such as `order.*`, or `*`. */
  events: string[]
  active: boolean
  /** Why and when it was paused. `revoked`, `key`, `unlinked` and `merged`: the credential it stood on ended, or a merge brought it in, and a session alone resumes it. */
  paused: {
    reason: "owner" | "failing" | "revoked" | "key" | "unlinked" | "merged"
    at: string
  } | null
  /** The last event of the account's log it delivered or passed over. */
  lastSeq: string
  lastDeliveredAt: string | null
  /** The run of failures it is in, where it is in one. */
  failing: {
    since: string
    /** The tries of the event it waits on. */
    attempts: number
    /** The next try of the event it waits on, or null while the hook is paused. */
    nextAttemptAt: string | null
    /** The receiver's last HTTP status, or null where none came. */
    lastStatus: number | null
    /** Why the last try failed, with an excerpt of the answer's body. */
    lastError: string | null
  } | null
  /** Until when the secret before its last rotation still signs. */
  previousSecretUntil: string | null
  createdBy: WebhookCredential
  createdAt: string
  /** Mancer holds its deliveries for a fault of its own, never counted against the hook. Its events wait, and go out in order once mended. */
  held: boolean
  /** Why it is held: its secret, or the secret before its rotation, cannot be opened, or the server signs nothing. Null while it is not held. */
  heldReason: "secret" | "previous-secret" | "no-server-key" | null
}

/** The credential a hook stands on: the one that made it, or the session that resumed it after that one ended. */
export type WebhookCredential = {
  /** The credential's wallet. */
  wallet: string | null
  /** A key's name, or null for a session. */
  key: string | null
  /** When the session was issued, or null for a key. */
  sessionIssuedAt: string | null
}

/** A webhook paused because a credential ended: its id and its URL's host, never its path. */
export type PausedWebhook = {
  id: string
  host: string
}

export type WebhookCreated = {
  webhook: Webhook
  /** `whsec_…`, the hook's signing secret. Keep it on your server; no other answer carries it. */
  secret: string | null
  /** True on an `Idempotency-Key` replay, which never carries the secret. */
  secretWithheld?: boolean
}

export type WebhookList = {
  account: Address
  webhooks: Webhook[]
  max: 5
  /** Every kind of the account's log. */
  kinds: string[]
  /** False while Mancer has deliveries switched off; they resume where they stopped. */
  on: boolean
}

export type WebhookTry = {
  webhook: string
  /** The receiver answered a 2xx within ten seconds. */
  delivered: boolean
  /** The receiver's HTTP status, or null where none came. */
  status: number | null
  /** Why it failed: the status with an excerpt of the body, a refused redirect, a host that is not public, or no answer. */
  error: string | null
  ms: number
}

export type WebhookDelivery = {
  /** The event's place in the account's log. */
  seq: string
  kind: string
  /** `failed`: the hook was paused on it after a day of failures. `skipped`: it waited on a retry and the hook stopped taking its kind. */
  state: "delivered" | "retrying" | "failed" | "skipped"
  /** Every try, redeliveries among them. */
  attempts: number
  /** The last try's HTTP status. */
  status: number | null
  /** The last failure's reason, kept after a later try lands. */
  lastError: string | null
  firstAttemptAt: string
  lastAttemptAt: string
  deliveredAt: string | null
  /** The next try of a delivery that waits on a retry, while its hook is active; null otherwise. */
  nextAttemptAt: string | null
  redeliveries: number
}

/** A token's votes and how many theses stand on it. */
export type TokenVoteSummary = {
  votes: BookVoteCounts
  /** The theses standing on the token, one a profile. */
  theses: number
}

/** A Book's counts and the session's vote, as they stand after the write. */
export type BookVoteResponse = {
  votes: BookVoteCounts
  /** The vote of the profile the session votes as; null where it has none. */
  mine: BookMyVote | null
}

export type BookProfileResponse = {
  profile: BookProfile
}

/** A Book saved before its open, pending deployment or deployed. */
export type BookDraft = {
  id: string
  factory: BooksAddress
  /** The wallet that saved the record. */
  creator: BooksAddress
  name: string
  symbol: string
  description: string | null
  links: {
    website: string | null
    x: string | null
    telegram: string | null
  }
  targets: BooksAddress[]
  /** Whether a logo is held for the record. */
  logo: boolean
  /** The open's transaction, once `PATCH /v1/books/drafts/{id}` names it. */
  txHash: string | null
  /** `sent` once the open's transaction is named, `deployed` once the Book it opened took the record. */
  state: "pending" | "sent" | "deployed"
  /** The Book's token, once deployed. */
  token: BooksAddress | null
  /** Unix seconds. */
  createdAt: number
}

export type BookDraftResponse = {
  draft: BookDraft
}

export type BookDraftsResponse = {
  drafts: BookDraft[]
}

/** One of the top creators, over the Books the board lists that were not cancelled. */
export type BookCreatorRow = {
  address: BooksAddress
  /** The creator carries Mancer's verified mark. */
  verified: boolean
  books: number
  /** Raising */
  live: number
  settled: number
  /** Each Book's `bookValueWei` summed: a raise's funds, a live vault's value, what a settled Book paid out. */
  valueWei: BooksUnits
  /** The best settled Book's return after the close fee and the traders' cut; null where none settled. */
  bestReturnBps: number | null
  /** The creator's newest such Book. */
  latestBook: BooksAddress
}

export type BooksCreatorsResponse = {
  creators: BookCreatorRow[]
}

export type BookThesisReportResponse = {
  report: {
    id: number
    status: "open" | "reviewing" | "actioned" | "dismissed"
    /** Unix seconds. */
    createdAt: number
  }
  /** True where the wallet's open report of the same thesis is answered, and nothing new was written. */
  duplicate: boolean
}

/** One wallet of an account. */
export type AccountWallet = {
  address: Address
  /** The account's own wallet, the one that first signed in. */
  primary: boolean
  /** Shown on the account's profile. A hidden wallet answers every public read as a wallet no account holds. */
  public: boolean
  /** The owner's private label. */
  label: string | null
  /** Unix seconds. */
  linkedAt: number
}

/** What a merge needs the owner to choose before it can land. */
export type WalletLinkChoices = {
  /** Both accounts' usernames: name one as `keepUsername`. */
  usernames?: string[]
  /** Both accounts' X handles: name one as `keepX`. */
  x?: string[]
  /** The merge moves what the joining account shows, so it lands only with `public` true. */
  public?: {
    required: true
    because: ("follows" | "blocks" | "username" | "x" | "wallets")[]
  }
  webhooks?: MergedWebhooks
}

/** The joining account's webhooks: those that come in paused, for a session to resume, and those past the five, which go with it. */
export type MergedWebhooks = {
  paused: PausedWebhook[]
  left: PausedWebhook[]
}

export type WalletLinkResponse = {
  /** The account's primary wallet. */
  account: Address
  /** The session's wallet. */
  wallet: Address
  /** Every wallet of the account, the primary first. */
  wallets: AccountWallet[]
  /** The most wallets an account holds. */
  max: 10
  linked: {
    address: Address
    /** The wallet brought an account of its own. */
    merged: boolean
    /** The wallets that joined: the one linked, or every wallet of the account it brought. */
    wallets: Address[]
    /** A merge's usernames: the one kept and the one released; null for a plain link. */
    username: {
      kept: string | null
      released: string | null
    } | null
    /** A merge's X accounts: the handle kept and the one unlinked; null for a plain link. */
    x: {
      kept: string | null
      unlinked: string | null
    } | null
    /** A merge's follows, trade alerts and blocks past the account's caps, which it did not bring; null for a plain link. */
    leftOut: {
      follows: number
      alerts: number
      blocks: number
    } | null
    /** A merge's webhooks; null for a plain link. */
    webhooks?: MergedWebhooks | null
  }
}

/** How many wallets follow this one, and how many it follows. */
export type FollowCounts = {
  followers: number
  following: number
}

/** The session's word on one wallet. Whether the wallet blocked the session is said nowhere. */
export type ViewerFollow = {
  /** The session's account follows the wallet. */
  following: boolean
  /** The wallet follows the session's account, or one of its wallets. */
  followsYou: boolean
  /** The follow carries the wallet's trade alerts. */
  alerts: boolean
  /** The session's account blocked the wallet. */
  blocked: boolean
}

/** A wallet's counts and the session's word on it, as they stand after the write. */
export type FollowState = {
  /** The wallet the path named. */
  address: Address
  follows: FollowCounts
  viewer: ViewerFollow
}

/** What a wallet's profile shows. Every field is null where it shows nothing, and every picture is a path on this API. */
export type PublicProfile = {
  username: string | null
  displayName: string | null
  bio: string | null
  /** An http or https link. */
  website: string | null
  /** The picture's path, with its version as `v`. */
  avatar: string | null
  /** The banner's path, with its version as `v`. */
  banner: string | null
  /** The linked X account. `name` and `avatar` are null until the wallet's owner links it through Mancer's X login. */
  x: {
    username: string
    name: string | null
    /** The account's page on x.com. */
    url: string
    followers: number
    /** The X picture's path on this API. */
    avatar: string | null
    /** Unix seconds X was last read. */
    checkedAt: number
  } | null
  /** The verified mark, what earned it and since when; null without one. */
  verified: {
    /** `x-followers`: an X account of 500 followers or more, linked through Mancer. `mancer`: granted by Mancer. */
    basis: "x-followers" | "mancer"
    /** Unix seconds. */
    since: number
  } | null
  /** The first second of the month the account was made, on a profile that shows something; null otherwise. */
  joinedAt: number | null
  /** The owner shows the wallet's holdings. */
  showPortfolio: boolean
}

/** A wallet's profile, its counts, and the session's word on it. */
export type UserProfileResponse = {
  /** The wallet the path named, or the one its username names. */
  address: Address
  profile: PublicProfile
  /** The answer may still change on its own while the wallet's OpenSea profile is still to be read. Ask again in a few seconds. */
  pending: boolean
  follows: FollowCounts
  /** The session's word on the wallet; null without a session. */
  viewer: ViewerFollow | null
  /** The wallets the profile shows: the account's own wallet first, then its public linked wallets. */
  wallets: Address[]
}

/** A released username still held for its last owner: who held it, and the name it goes by now. */
export type UserRenamed = {
  renamed: {
    /** The holder's username now; null where it has none. */
    username: string | null
    address: Address
  }
}

/** A wallet a search found, and what it matched. */
export type UserSearchRow = BooksShortIdentity & {
  match: "username" | "x" | "address"
}

export type UserLookupResponse = {
  /** Every address asked, lowercase, to its short identity. */
  users: {
    [key: string]: BooksShortIdentity
  }
  /** The addresses whose identity may still change on their own: ask again in a few seconds. */
  pending: Address[]
}

export type FollowListResponse = {
  /** The wallet the path named. */
  address: Address
  kind: "followers" | "following"
  /** The whole list's length. */
  count: number
  /** Newest follow first. */
  users: (BooksShortIdentity & {
    /** The session's word on this wallet; null without a session. */
    viewer: ViewerFollow | null
  })[]
  /** The next page's `cursor`; null on the last page. */
  nextCursor: string | null
}

/** The account's own view of its profile: what it shows, what it stores, and what it may change and when. */
export type OwnerProfile = {
  /** The account's own wallet. */
  address: Address
  profile: PublicProfile
  username: {
    current: string | null
    /** Unix seconds. */
    claimedAt: number | null
    /** When the name may next change; null for now. */
    nextChangeAt: number | null
    /** Until when a change is a typo fix that frees the old name at once and keeps the clock. */
    fixUntil: number | null
    /** The wait between two changes: seven days. */
    changeWaitSec: number
    /** A released name held for this account, and until when; null with none. */
    held: {
      username: string
      until: number
    } | null
  }
  /** Each field as stored, a name the display rules hide included. */
  fields: {
    displayName: string | null
    bio: string | null
    website: string | null
    /** The profile has a picture of its own. */
    avatar: boolean
    /** The profile has a banner of its own. */
    banner: boolean
  }
  x: {
    /** X linking is on. */
    available: boolean
    /** `POST /auth/x/refresh` is on. */
    refreshAvailable: boolean
    linked: {
      username: string
      name: string | null
      followers: number
      linkedAt: number
      /** Unix seconds X was last read. */
      checkedAt: number
      /** When Mancer reads it again on its own; null where it does not. */
      nextCheckAt: number | null
      /** When `POST /auth/x/refresh` may next read it; null for now. */
      checkAgainAt: number | null
      /** The owner linked it through Mancer's X login. False for the X account the wallet's OpenSea profile named, which earns no mark. */
      confirmed: boolean
    } | null
  }
  refresh: {
    /** `POST /v1/me/profile/refresh` is on. */
    available: boolean
    /** When it may next run; null for now. */
    nextAt: number | null
  }
  settings: {
    /** `auto`: the profile's own picture, else X's. `x`: X's alone. `none`: no picture. */
    avatarSource: "auto" | "x" | "none"
    showPortfolio: boolean
  }
  verification: {
    verified: boolean
    basis: "x-followers" | "mancer" | null
    /** The X followers that earn the mark: 500. */
    followersNeeded: number
    /** When a mark whose X account fell under the bar lapses; null otherwise. */
    lapsesAt: number | null
  }
  /** The fields Mancer hid on this profile. */
  hiddenByMancer: ("displayName" | "bio" | "website" | "avatar" | "banner" | "xAvatar")[]
  /** The account's profile writes are open. */
  open: boolean
  /** Why the writes are open, or what would open them: `stake` (a staked Chain Mancer) or `closed`. `unread`: the stake could not be read just now. */
  opening: "everyone" | "beta" | "staked" | "stake" | "unread" | "closed"
  /** Whether a username claim is open, and by which, or what it needs. See `PUT /v1/me/username`. */
  usernameClaim: "everyone" | "x" | "staked" | "needs-x-or-stake" | "opened-elsewhere" | "unread"
  /** A linked wallet's request to delete the account, while one stands; null otherwise. */
  deletion?: AccountDeletionPending | null
}

/** A linked wallet's request to delete the account. The account is erased at `deletesAt` unless the primary wallet cancels it, the wallet that asked cancels it, or that wallet is unlinked first. */
export type AccountDeletionPending = {
  /** The linked wallet that asked. */
  requestedBy: Address
  /** Unix seconds it asked. On the request's own answers. */
  requestedAt?: number
  /** Unix seconds the account is erased: seven days after the request. */
  deletesAt: number
}

/** The account's own view, and what the refresh changed. */
export type OwnerProfileRefreshed = OwnerProfile & {
  refreshed: {
    /** The fields OpenSea's profile replaced. */
    fields: ("displayName" | "bio" | "website" | "avatar" | "banner")[]
    /** The X account OpenSea named: linked, held by another wallet, unknown to X, made in the last 90 days, passed over for the wallet's own link, or still to be read. */
    x: "linked" | "taken" | "unknown" | "young" | "had-link" | "pending" | null
  }
}

export type UsernameClaimed = {
  username: string
  /** Unix seconds. */
  claimedAt: number
  /** When the name may next change; null for now. */
  nextChangeAt: number | null
  /** Until when a change is a typo fix. */
  fixUntil: number | null
  released: UsernameReleasedName
}

/** The name the account let go: held for it until `heldUntil`, or freed at once (`heldUntil` null) inside the typo-fix window. Null where none was. */
export type UsernameReleasedName = {
  username: string
  heldUntil: number | null
} | null

export type UsernameAvailability = {
  /** The name as a claim reads it: trimmed, `@` dropped, lowercase. */
  username: string
  available: boolean
  /** Why it is not available: each is its `username-` code's rule, `yours` the account's own name, `not-open` writes closed. */
  reason?: "format" | "length" | "reserved" | "taken" | "held" | "prefix" | "staff-word" | "lookalike" | "symbol" | "x-handle" | "cooldown" | "yours" | "not-open" | "opened-elsewhere" | "needs-x-or-stake" | "unread"
  /** When a held name frees, the account's wait ends, or an opener frees. */
  availableAt?: number
  /** The word a name may not contain. */
  word?: string
}

export type AccountWalletsResponse = {
  /** The account's own wallet. */
  account: Address
  /** The session's wallet. */
  wallet: Address
  /** Every wallet of the account, the account's own first. */
  wallets: AccountWallet[]
  /** The most wallets an account holds. */
  max: 10
  /** An unlink: the wallet let go. */
  unlinked?: Address
  /** An unlink: the session's own wallet was the one let go, so this session acts for nothing more. */
  sessionEnded?: boolean
  /** An unlink: the webhooks the wallet's sessions and keys made, paused. */
  pausedWebhooks?: PausedWebhook[]
  /** An unlink: the wallet's request to delete the account ended with it. */
  deletionCancelled?: boolean
}

export type XLinkStart = {
  /** X's page where the person approves the link, opened in a browser. */
  authorizeUrl: string
  /** Unix seconds the link's start runs out: ten minutes on. */
  expiresAt: number
  /** With `return: app`: where X sends the browser back with the ticket, `mancer://x-link`. */
  returnTo?: string
  /** With `return: device`: the code the bot sends to `POST /auth/x/confirm`. Keep it secret: it is the link's only proof. */
  deviceCode?: string
  /** With `return: device`: the seconds to wait between asks. */
  interval?: number
}

export type XLinkPending = {
  status: "pending"
  /** `x`: nobody has approved at X yet. `confirmation`: the person approved at X and has not confirmed on Mancer's page. */
  awaiting: "x" | "confirmation"
  /** Unix seconds this step runs out. */
  expiresAt: number
  /** The seconds to wait before asking again. */
  interval: number
}

/** A wallet the account blocked, as a list shows it, with when. */
export type BlockedWallet = BooksShortIdentity & {
  /** Unix seconds the block was made. */
  blockedAt: number
}

export type BlocksPage = {
  /** How many wallets the account blocks in all. */
  count: number
  /** The page's wallets, newest block first. */
  users: BlockedWallet[]
  /** The cursor of the next page, opaque. Null on the last page. */
  nextCursor: string | null
}

export type FeedPage = {
  /** The page's trades, newest first, each as the wallet's own trades list it; `trader` is the wallet followed. A transaction two followed wallets each traded in is listed once. */
  swaps: WalletTrade[]
  /** The short identity of each listed trader who shows a name, a picture, a mark or an X handle, by lowercase address. */
  users: {
    [key: string]: BooksShortIdentity
  }
  /** How many wallets the account follows. */
  following: number
  /** The cursor of the next older page, opaque. Null once the feed ends. */
  nextBefore: string | null
}

/** One notification: a follow (`follow`), a trade alert (`trade`), a webhook made or paused (`webhook`), or a linked wallet's request to delete the account made or cancelled (`account-deletion`). */
export type Notice = {
  /** The notice's id, a decimal string: higher is newer. */
  id: string
  kind: "follow" | "trade" | "webhook" | "account-deletion"
  /** Unix seconds: the follow's time, or the newest trade's block time. */
  at: number
  /** Who followed, or whose trades these are. */
  actor: Address
  unread: boolean
  /** A trade notice's count of trades: a wallet's trades within ten minutes are one notice while it is unread. Absent on a follow. */
  trades?: number
  /** A trade notice's newest trade, as the wallet's own trades list it. Absent on a follow. */
  trade?: WalletTrade
  /** A webhook notice's hook. Its actor is the account's own wallet. */
  webhook?: WebhookNotice
  /** An account deletion's notice: the request. Its actor is the wallet that asked or cancelled. */
  deletion?: DeletionNotice
}

export type DeletionNotice = {
  state: "requested" | "cancelled"
  /** The linked wallet that asked. */
  requestedBy: Address
  /** Unix seconds the account goes, had the request stood. */
  deletesAt: number
  /** A cancel's wallet. */
  cancelledBy: Address | null
  /** A cancel's cause: the primary wallet, the wallet that asked, or that wallet's unlink. */
  reason: "primary" | "requester" | "unlinked" | null
}

export type WebhookNotice = {
  /** The hook's id. */
  id: string
  /** The host of the hook's URL, never its path. */
  host: string
  /** `created`: the hook was made. `failing`: it was paused after a day of failed deliveries. */
  reason: "failing" | "created"
  lastError: string | null
  /** The event it was paused on, which it sends first once resumed. */
  seq: string | null
  /** A made hook's credential. */
  by?: WebhookCredential
}

export type NoticesPage = {
  /** The page's notices, newest first. */
  notifications: Notice[]
  /** The short identity of each notice's actor, by lowercase address. */
  users: {
    [key: string]: BooksShortIdentity
  }
  /** The session's word on each actor, by lowercase address, so a follower can be followed back. */
  viewer: {
    [key: string]: ViewerFollow
  }
  /** How many notices are unread, counted to 100: read 100 as 100 or more. */
  unread: number
  /** The id the next older page reads before. Null on the last page. */
  nextBefore: string | null
}

/** Why a person is named, as data to word. */
export type SuggestedReason = {
  kind: "transfers"
  /** Sends from the account's wallets to this one. */
  sent: number
  /** Sends from this wallet to the account's. */
  received: number
  /** The tokens sent, the most worth first. */
  tokens: {
    address: Address
    symbol: string | null
  }[]
  /** Unix seconds of the newest send. */
  lastAt: number
} | {
  kind: "follows-you"
  /** Unix seconds it followed. */
  at: number
} | {
  kind: "followed-by"
  count: number
  /** Up to three of them, the newest first; `users` names each. */
  via: Address[]
} | {
  kind: "book"
  book: {
    token: Address
    symbol: string
    name: string
  }
  theirRole: "creator" | "trader" | "holder"
  yourRole: "creator" | "trader" | "holder"
}

export type SuggestedPerson = {
  /** The profile the person's page shows, and the one a follow from the list follows. */
  address: Address
  identity: BooksShortIdentity
  /** The reasons, strongest first. */
  reasons: SuggestedReason[]
}

export type SuggestedPeopleResponse = {
  /** The people, strongest first. */
  people: SuggestedPerson[]
  /** The short identity of each wallet a `followed-by` reason names, by lowercase address. */
  users: {
    [key: string]: BooksShortIdentity
  }
  /** What each source came to: read whole, in part, not at all, skipped for load (`busy`), or with nothing to read (`none`). */
  sources: {
    transfers: "read" | "partial" | "unread" | "busy" | "none"
    follows: "read" | "partial" | "unread" | "busy" | "none"
    books: "read" | "partial" | "unread" | "busy" | "none"
  }
  /** Unix seconds the transfers and the Books were read. They are kept ten minutes, or 30 seconds where they could not be read; the follows are read at every request. */
  at: number
}

/** One of the account's invite codes. */
export type AppAccessInvite = {
  /** The code, shown XXXX-XXXX. */
  code: string
  /** Unix seconds. */
  mintedAt: number
  /** The account that used the code, as its profile shows it; null while the code is unused. */
  redeemedBy: {
    address: Address
    username: string | null
    displayName: string | null
  } | null
  /** Unix seconds; null while the code is unused. */
  redeemedAt: number | null
}

/** The account's access to the phone app. */
export type AppAccessResponse = {
  /** Whether the phone app is invite-only now. While false, every signed-in account may use it. */
  required: boolean
  /** Whether the account is in. Access once granted stays. */
  granted: boolean
  /** How the account came in: its stake, an invite code, or Mancer's hand; null while it is not in. */
  via: "stake" | "invite" | "admin" | null
  /** Unix seconds it came in; null while it is not in. */
  since: number | null
  /** The invite code it came in by, shown XXXX-XXXX; null for any other way in. */
  code: string | null
  /** The account's own codes to give out, oldest first. A stake mints five, once. */
  invites: AppAccessInvite[]
  /** This answer's read of the account's stake: `unread` where a wallet did not answer in time; null where none was read (the account is in, or the app is open). */
  stake: "yes" | "no" | "unread" | null
}

/** One transaction's trade, read from what left the wallet and what reached it; a route's middle steps never show. */
export type WalletTrade = {
  /** The transaction's hash: a row a transaction. */
  id: Hash
  txHash: Hash
  /** The log index of the trade's largest swap. */
  logIndex: number
  blockNumber: string
  /** Unix seconds. */
  timestamp: number
  /** The token traded. For liquidity, the largest swap's token. */
  token: Address
  tokenSymbol: string | null
  /** The other side: the dollar over ether over any other token, and between two tokens the one given up. For liquidity, the largest swap's other side. Native ether is the zero address. */
  cash: Address
  cashSymbol: string | null
  /** The pool of the trade's largest swap, or its id for a pool-manager venue. */
  pool: string
  /** `mancer` where the transaction called Mancer's router or its orders; else the venue of the largest swap. */
  venue: string
  /** `buy` or `sell` of `token`; `add`, `remove` or `move` where the wallet put liquidity in, took it out or moved it. */
  side: "buy" | "sell" | "add" | "remove" | "move"
  /** How much of `token` moved, in whole tokens. */
  amountToken: number
  /** How much of `cash` moved, in whole tokens. */
  amountCash: number
  /** `volumeUsd` over `amountToken`; 0 for liquidity. */
  priceUsd: number
  /** What the cash side was worth in dollars, else the token side; for liquidity, what moved in all. */
  volumeUsd: number
  /** The wallet. */
  trader: Address
  /** Present where the transaction added, removed or moved the wallet's liquidity and was no trade. Absent for a trade. */
  purpose?: "liquidity-add" | "liquidity-remove" | "liquidity-move"
  /** Present with `purpose`: what the wallet put in or took out, the most worth first. */
  moved?: {
    token: Address
    symbol: string | null
    /** Whole tokens. */
    amount: number
    usd: number
  }[]
}

/** One move of a piece into or out of the wallet. */
export type WalletNftMove = {
  /** `minted` where the wallet made the mint, `airdropped` where another wallet's transaction gave it, `received` where neither was read; `bought` and `sold` where the move's transaction sold the piece. */
  type: "received" | "sent" | "minted" | "airdropped" | "burned" | "bought" | "sold"
  /** Unix seconds. */
  at: number
  tx: Hash
  block: number
  collection: {
    address: Address
    /** The contract's own `name()`, else OpenSea's name. */
    name: string | null
    /** OpenSea verified the collection; null where OpenSea has no word on it. */
    verified: boolean | null
    /** The API's path for the collection's picture. */
    image: string | null
  }
  tokenId: string
  /** The piece's name from its metadata. */
  name: string | null
  /** The API's path for the piece's picture. */
  image: string | null
  /** How many of the piece moved: 1 for an ERC-721. */
  quantity: string
  /** Who sent or took the piece, sold or bought it, or sent an airdrop's transaction. Null for a mint, a burn and a move whose other side was not read. */
  counterparty: Address | null
  /** What a sale paid for the move's pieces, in `currency`. */
  price: number | null
  /** `price` in dollars, at ether's price now where the sale was in ether. */
  priceUsd: number | null
  /** The sale's currency by its symbol. */
  currency: string | null
}

/** An order's price for one item. */
export type NftPrice = {
  /** In `currency`, whole units. */
  price: number
  /** In dollars, at ether's price where it is in ether; null where it cannot be valued. */
  priceUsd: number | null
  /** The currency's symbol: ETH, WETH, USDG, or the token's own. */
  currency: string | null
}

/** An NFT collection, its contract's own words and holders beside OpenSea's identity and market. */
export type NftCollection = {
  address: Address
  standard: "erc721" | "erc1155"
  /** The contract's own `name()`, else OpenSea's name. */
  name: string | null
  /** The contract's own `symbol()`. */
  symbol: string | null
  /** OpenSea's slug for the collection. */
  slug: string | null
  /** OpenSea verified the collection; null where OpenSea has no word on it. */
  verified: boolean | null
  /** OpenSea's safelist status, as OpenSea names it. */
  safelist: string | null
  description: string | null
  /** The API's path for the collection's picture. */
  image: string | null
  /** The API's path for the collection's banner. */
  banner: string | null
  links: {
    website: string | null
    x: string | null
    discord: string | null
    telegram: string | null
    instagram: string | null
    wiki: string | null
    opensea: string | null
  }
  category: string | null
  nsfw: boolean | null
  /** OpenSea disabled the collection. */
  disabled: boolean | null
  /** Null where neither a floor, OpenSea's stats nor the holder count could be read. */
  stats: {
    /** The floor in ether. */
    floor: number | null
    floorUsd: number | null
    /** `listings`: the cheapest live listing of the collection's whole market. `opensea`: OpenSea's own stats. */
    floorFrom: "listings" | "opensea" | null
    /** OpenSea's all-time volume, in ether. */
    volume: number | null
    /** OpenSea's all-time sales. */
    sales: number | null
    /** Wallets holding a piece now, counted from the collection's transfers. */
    owners: number
    /** Pieces that exist now, held by anyone but the dead address. */
    supply: number
    /** OpenSea's volume and sales over the last day, week and month. */
    intervals: {
      day: NftInterval
      week: NftInterval
      month: NftInterval
    }
    /** Unix seconds OpenSea's stats were read. */
    at: number | null
  } | null
  /** The collection's best live offer for one item; null where there is none, or the collection's whole market is not read. */
  bestOffer: NftPrice | null
  /** Which fields came from OpenSea. */
  source: {
    identity: "opensea" | null
    stats: "opensea" | null
  }
}

export type NftInterval = {
  volume: number | null
  sales: number | null
}

/** One NFT, its own metadata beside its holders, rank, market and history. */
export type Nft = {
  collection: {
    address: Address
    name: string | null
    /** OpenSea's slug for the collection. */
    slug: string | null
    /** OpenSea verified the collection; null where OpenSea has no word on it. */
    verified: boolean | null
    /** The API's path for the collection's picture. */
    image: string | null
  }
  tokenId: string
  standard: "erc721" | "erc1155"
  name: string | null
  description: string | null
  /** The API's path for the piece's picture. */
  image: string | null
  traits: {
    type: string
    value: string
    displayType: string | null
  }[]
  /** Up to 20 holders, the largest first. */
  owners: {
    address: Address
    /** How many of the piece it holds. */
    quantity: string
  }[]
  /** Its rank by OpenRarity's method, 1 the rarest; null where its collection is not ranked. */
  rarity: {
    rank: number
    /** How many pieces were ranked. */
    of: number
    strategy: "openrarity"
  } | null
  market: {
    /** The collection's floor in ether. */
    floor: number | null
    /** The cheapest live listing of the piece. */
    bestListing: {
      price: number
      priceUsd: number | null
      currency: string | null
      /** Unix seconds. */
      expiresAt: number | null
      /** The piece's page on OpenSea. */
      url: string
    } | null
    /** The best live offer that covers the piece: its own, a trait offer whose every trait it carries, or its collection's. */
    bestOffer: NftPrice | null
    lastSale: {
      price: number
      priceUsd: number | null
      currency: string | null
      /** Unix seconds. */
      at: number
      tx: Hash
    } | null
  }
  /** The piece's last 50 moves, newest first. */
  history: {
    /** `airdrop` is a mint by another wallet's transaction, which the recipient paid nothing in; its `from` is that transaction's sender. */
    type: "mint" | "airdrop" | "transfer" | "sale" | "burn"
    /** Unix seconds. */
    at: number
    tx: Hash
    /** Null for a mint. */
    from: Address | null
    /** Null for a burn to the zero address. */
    to: Address | null
    quantity: string
    /** What a sale paid for the move's pieces, in `currency`. */
    price: number | null
    currency: string | null
  }[]
  links: {
    opensea: string
    explorer: string
  }
  /** The piece's metadata was not read in time: ask again. */
  pending: boolean
}

/** A wallet's trades and transfers of one token, each transaction netted for the wallet, at average cost. */
export type TokenPositionPnl = {
  /** What the wallet bought in transactions that swapped the token: whole tokens, dollars paid, transactions. */
  bought: {
    amount: number
    usd: number
    txs: number
  }
  sold: {
    amount: number
    usd: number
    txs: number
  }
  /** What reached it in transactions that swapped none of the token: transfers, airdrops, allocations, liquidity taken out. */
  received: {
    amount: number
    txs: number
  }
  sent: {
    amount: number
    txs: number
  }
  /** What the tokens it holds cost. A token that reached it with no trade costs that day's close. */
  costBasisUsd: number
  /** The average cost of one whole token held; null where it holds none. */
  avgCostUsd: number | null
  /** What its sales made over what the tokens sold had cost. */
  realizedUsd: number
  /** What it holds is worth at the token's price less its cost; null where the price values nothing. */
  unrealizedUsd: number | null
  /** Realized and unrealized together; null where unrealized is. */
  totalUsd: number | null
  /** A move before the token's first close was costed at that first close. */
  estimated: boolean
  /** Unix seconds of its first move of the token. */
  firstAt: number | null
  /** Unix seconds of its last move of the token. */
  lastAt: number | null
}

/** One wallet's position in one token. */
export type TokenTraderPosition = {
  token: Address
  wallet: Address
  /** What the wallet holds, unscaled. */
  balance: Uint
  /** `balance` at `priceUsd`; null where there is no price. */
  valueUsd: number | null
  /** The token's price; null where it has none, or one too thin to value a holding. */
  priceUsd: number | null
  /** What the wallet is where it holds others' tokens or none of its own; null for a trader's wallet. */
  label: {
    kind: "burn" | "token" | "pool" | "custody" | "contract"
    /** The name Mancer's transaction page gives it, where it gives one. */
    name?: string
  } | null
  pnl: TokenPositionPnl | null
  /** Why `pnl` is null: a contract `label` names, more than 2,000 moves of the token, or a dollar token, which costs and is worth a dollar. */
  pnlWhy: "contract" | "moves" | "dollar" | null
  /** Unix seconds the balance and moves were read; the figures that move with the price are priced as asked. */
  readAt: number
  source: "indexer"
}

/** One window's trading. Each swap of the token in one pool counts once, so a trade routed through two of its pools counts twice. */
export type TokenWindowsTrading = {
  /** Buys and sells together. */
  txns: number
  buys: number
  sells: number
  volumeUsd: number
  buyVolumeUsd: number
  sellVolumeUsd: number
  /** Distinct wallets whose balance of the token a swap moved; null where `wallets` is `none`. */
  makers: number | null
  /** Of those, the wallets that came out of a swap holding more of the token. */
  buyers: number | null
  /** And the wallets that came out of a swap holding less. A wallet that did both counts in each. */
  sellers: number | null
}

export type TokenWindowsResponse = {
  token: Address
  /** Unix seconds of the read: every window ends there. */
  asOf: number
  windows: {
    /** The last 5 minutes. */
    m5: TokenWindowsTrading
    /** The last hour. */
    h1: TokenWindowsTrading
    /** The last 6 hours. */
    h6: TokenWindowsTrading
    /** The last 24 hours. */
    h24: TokenWindowsTrading
  }
  /** `none` for wrapped ether, whose trades paid in native ether move no token balance, so its wallets are not counted. */
  wallets: "ledger" | "none"
  source: "indexer"
}

/** One holder of the token. */
export type TokenHoldersPnlRow = {
  holder: Address
  /** What it holds, unscaled. */
  balance: Uint
  /** Its share of the total supply, from 0 to 1; null where the supply is unknown. */
  share: number | null
  /** `balance` at `priceUsd`; null where there is no price. */
  valueUsd: number | null
  /** What the holder is where it holds others' tokens or none of its own; null for a trader's wallet. */
  label: {
    /** `book` is one of a Book's own contracts, `market` one of an NFT market's. */
    kind: "burn" | "token" | "book" | "market" | "pool" | "custody" | "contract"
    /** The Book's or the market's role for its contract, or the name Mancer's transaction page gives a custody contract or router, where it gives one. */
    name?: string
  } | null
  pnl: TokenPositionPnl | null
  /** Why `pnl` is null: a holder `label` names, more than 2,000 moves of the token, past the answer's 6,000 priced moves (read it alone at the trader route), or a dollar token. */
  pnlWhy: "contract" | "moves" | "budget" | "dollar" | null
}

export type TokenHoldersPnlResponse = {
  token: Address
  /** How many addresses hold the token. */
  holders: number
  /** The price every figure is valued at; null where the token has none, or one too thin to value a holding. */
  priceUsd: number | null
  /** The kind of the token's price, as the token's detail names it. */
  priceConfidence: string | null
  /** The total supply, unscaled; null where it is unknown. */
  totalSupply: string | null
  decimals: number
  /** The ten largest holders' share of the total supply, pools and contracts among them; null where the supply is unknown. */
  top10Share: number | null
  /** The largest holders, largest first. */
  top: TokenHoldersPnlRow[]
  /** Unix seconds the holders and their moves were read; the figures that move with the price are priced as asked. */
  readAt: number
  source: "indexer"
  /** The short identity of each listed wallet with no `label` that shows a name, a picture, a mark or an X handle, by lowercase address. Null where the names did not arrive in time. */
  users: {
    [key: string]: BooksShortIdentity
  } | null
}

/** One wallet's trades of the token in the window. Amounts are whole tokens and dollars, each trade at its transaction's own price. */
export type TokenTradersRow = {
  wallet: Address
  bought: {
    amount: number
    usd: number
    txs: number
  }
  sold: {
    amount: number
    usd: number
    txs: number
  }
  /** Its sales of tokens it bought in the window, over what those cost at its average purchase price there. */
  realizedUsd: number
  /** What it still holds of the window's purchases at `priceUsd`, over what that cost; null where there is no price. */
  unrealizedUsd: number | null
  /** Realized and unrealized together; null where unrealized is. */
  pnlUsd: number | null
  /** The tokens it bought in the window and did not sell there. */
  heldFromWindow: number
  /** Of those, what it no longer holds: moved out by a transfer, not sold. Null where its balance was not read. */
  movedOut: number | null
  /** What it sold in the window beyond what it bought there: tokens held from before, at their sale price. They make no PnL here; null where it sold no more than it bought. */
  soldFromBefore: {
    amount: number
    usd: number
  } | null
  /** What it holds of the token now, unscaled; null where the balances were not read. */
  balance: string | null
  /** `balance` at `priceUsd`; null where either is null. */
  valueUsd: number | null
  /** Unix seconds of its first trade in the window. */
  firstAt: number
  /** Unix seconds of its last trade in the window. */
  lastAt: number
}

/** The ranking, or `available: false` with `why` for a token whose traders this route does not rank. */
export type TokenTradersResponse = {
  token: Address
  available: true
  window: "1d" | "7d"
  sort: "pnl" | "bought" | "sold"
  /** The price unrealized PnL is reckoned at; null where the token has none, or one too thin to value a holding. */
  priceUsd: number | null
  /** The kind of the token's price, as the token's detail names it. */
  priceConfidence: string | null
  decimals: number
  /** Up to 100 wallets, in the order `sort` names. */
  traders: TokenTradersRow[]
  /** Unix seconds the window was read; the window ends there. */
  readAt: number
  source: "indexer"
  /** The short identity of each listed wallet that shows a name, a picture, a mark or an X handle, by lowercase address. Null where the names did not arrive in time. */
  users: {
    [key: string]: BooksShortIdentity
  } | null
} | {
  token: Address
  available: false
  /** Wrapped ether is traded in native ether too, which moves no token balance; a dollar token costs and is worth a dollar. */
  why: "wrapped-ether" | "dollar"
  source: "indexer"
  users: null
}

export type VenueFactoriesResponse = {
  /** Each pool factory's venue id, by the factory's lowercase address. */
  factories: {
    [key: string]: string
  }
  /** How many factories `factories` holds. */
  count: number
}

/** One trade a named wallet made in the token. */
export type TokenKolMark = {
  /** Unix seconds. */
  ts: number
  /** Of the token. */
  side: "buy" | "sell" | null
  priceUsd: number
  volumeUsd: number
  txHash: Hash
  /** The named wallet that made the swap. */
  address: Address
  handle: string
  avatarUrl: string | null
  /** The wallet's group in Mancer's list, `kol` unless named otherwise. */
  tier: string
}

/** The launchpad that launched a token. */
export type LaunchpadMark = {
  id: "mosh" | "pons" | "clanker" | "long" | "torch" | "stonklauncher"
  name: string
  /** The launchpad's own site. */
  url: string
  /** The token's page on the launchpad's site; null where none is known. */
  tokenUrl: string | null
}

export type TokenSetupsResponse = {
  /** Every filter the scan ran, defaults filled in, under the query parameter's name. */
  criteria: {
    setup: "fib-pullback" | "breakout-retest" | "ma-reclaim"
    timeframe: 900 | 3600 | 14400 | 43200 | 86400
    lookbackBars: number
    minVolume24hUsd: number
    minRallyPct: number
    retracementMin: number
    retracementMax: number
    tolerancePct: number
    maPeriod: number
    verifiedOnly: boolean
    fibStage: "in-zone" | "base" | "higher-lows" | "breakout" | "bounce"
    maxBarsSinceTouch: number
    baseBars: number
    baseMaxRangePct: number
    pivotBars: number
    higherLowCount: number
    minHigherLowPct: number
    breakoutLookback: number
    breakoutBufferPct: number
    volumeLookback: number
    minRelativeVolume: number
    fibConfluence: boolean
    confluenceTolerancePct: number
    /** Lowercase, or empty. */
    tokenAddress: string
    bounceBasis: "wick" | "close"
    bounceLevelPct: number
    bounceTolerancePct: number
    minBouncePct: number
    bounceConfirmBars: number
  }
  /** Unix seconds the candles the scan tested were read. */
  asOf: number
  universe: {
    /** `token` where `tokenAddress` named one. */
    scope?: "ranked" | "token"
    /** The most tokens the scan reads: 2,000, or 1 for one token. */
    limit: number
    rankLimit: number
    /** Tokens the scan read. */
    considered: number
    /** Tokens with clean history the setup was tested on; equal to `eligible`. */
    evaluated: number
    eligible: number
    /** Tokens left out, by why: no usable metadata, too little volume, a stale price, short history, invalid candles, a candle with no trade, or no match. */
    excluded: {
      [key: string]: number
    }
    /** More tokens traded in the last day than the 2,000 the scan reads. */
    limited: boolean
  }
  /** The matches, nearest their reference first, then the most volume. */
  matches: TokenSetupMatch[]
  /** Present with `tokenAddress`: what the scan found of that token. */
  inspection?: {
    address: Address
    symbol?: string
    name?: string
    status: "matched" | "excluded" | "not-indexed"
    exclusion?: "metadata" | "volume" | "stale" | "history" | "invalid-candles" | "inactive" | "no-match"
    volume24hUsd: number | null
    /** Completed candles in the lookback window. */
    availableBars: number
    requiredBars: number
  }
}

/** A token whose completed candles show the setup. It describes past prices and makes no forecast. */
export type TokenSetupMatch = {
  address: Address
  symbol: string
  /** The token's name; a Book token's display name where its deployment gives one. */
  name: string
  decimals: number
  /** 2 = verified by Mancer, 1 = issued stock, 0 = the unreviewed tail. */
  tier: 0 | 1 | 2
  isStock: boolean
  setup: "fib-pullback" | "breakout-retest" | "ma-reclaim"
  timeframe: 900 | 3600 | 14400 | 43200 | 86400
  /** The latest completed close. */
  priceUsd: number
  /** Dollars. */
  volume24h: number
  /** `priceUsd` times the circulating supply; null where the supply is unknown. */
  marketCapUsd: number | null
  /** The highest daily high the token's chart printed. */
  athPriceUsd: number | null
  athMarketCapUsd: number | null
  /** How far the latest close stands from the setup's reference, in percent; lower is nearer. */
  distancePct: number
  /** Unix seconds the latest completed candle ended. */
  asOf: number
  /** Unix seconds the match was made. */
  matchedAt: number
  reasons: {
    label: string
    value: string
  }[]
  /** The prices the setup is measured from. */
  anchors: {
    label: string
    /** The candle's start, unix seconds. */
    t: number
    price: number
  }[]
  zone: {
    low: number
    high: number
    label: string
  }
  /** With `fibConfluence`: the second band. */
  extraZones?: {
    low: number
    high: number
    label: string
  }[]
  /** The setup's measures by name, each a finite number. */
  metrics: {
    [key: string]: number
  }
  /** The confirmed events of a staged or confluent match. */
  evidence?: {
    kind: string
    label: string
    /** The candle's start, unix seconds. */
    t: number
    price: number
    /** Unix seconds its confirming candle closed. */
    confirmedAt: number
  }[]
  /** The lookback window's completed candles, oldest first. */
  candles: Candle[]
  /** The launchpad that launched the token; null for any other token. Absent where it could not be read. */
  launchpad?: LaunchpadMark | null
  /** A Book token: its Book. Absent on every other token. */
  book?: BookFlag
}

/** Every operation of the reference by its operationId: its method, its path, and what it takes and answers. */
export interface Operations {
  /** Block a wallet */
  blockWallet: {
    method: "PUT"
    path: "/v1/me/blocks/{id}"
    pathParams: {
      /** An address, or a username with or without its `@`. */
      id: string
    }
    query: never
    body: never
    response: FollowState
  }
  /** Cancel a request to delete the account */
  cancelAccountDeletion: {
    method: "DELETE"
    path: "/v1/me/account/deletion"
    pathParams: never
    query: never
    body: never
    response: {
      cancelled: true
      deletion: AccountDeletionPending
    }
  }
  /** Cancel orders by signature */
  cancelOrders: {
    method: "POST"
    path: "/v1/orders/cancellations"
    pathParams: never
    query: never
    body: {
      hashes: Hash[]
      /** Unix seconds. Must be within ±10 minutes of the server clock. */
      issuedAt: number
      /** The maker's EIP-191 signature over the message above. */
      signature: string
    }
    response: {
      results: {
        hash: Hash
        status: OrderStatus
      }[]
    }
  }
  /** Change an API key */
  changeApiKey: {
    method: "PATCH"
    path: "/v1/me/api-keys/{name}"
    pathParams: never
    query: never
    body: {
      scopes?: KeyScope[]
      active?: boolean
    }
    response: (ApiKey & {
      pausedWebhooks: PausedWebhook[]
    })
  }
  /** Check the account's stake again */
  checkAppAccess: {
    method: "POST"
    path: "/v1/me/app-access/check"
    pathParams: never
    query: never
    body: never
    response: AppAccessResponse
  }
  /** Check a username */
  checkUsername: {
    method: "GET"
    path: "/v1/usernames/{name}"
    pathParams: {
      /** The name, with or without its `@`. */
      name: string
    }
    query: never
    body: never
    response: UsernameAvailability
  }
  /** Claim a username */
  claimUsername: {
    method: "PUT"
    path: "/v1/me/username"
    pathParams: never
    query: never
    body: {
      /** With or without its `@`, any case: it is stored lowercase. */
      username: string
    }
    response: UsernameClaimed
  }
  /** Finish an X link */
  confirmXLink: {
    method: "POST"
    path: "/auth/x/confirm"
    pathParams: never
    query: never
    body: unknown | unknown
    response: OwnerProfile | XLinkPending
  }
  /** Count unread notifications */
  countUnreadNotifications: {
    method: "GET"
    path: "/v1/me/notifications/unread"
    pathParams: never
    query: never
    body: never
    response: {
      unread: number
    }
  }
  /** Save a Book before its open */
  createBookDraft: {
    method: "POST"
    path: "/v1/books/drafts"
    pathParams: never
    query: never
    body: {
      factory: Address
      name: string
      symbol: string
      description?: string
      links?: {
        [key: string]: string
      }
      targets: Address[]
      [key: string]: unknown
    }
    response: {
      /** The record, with its 32-hex `id`. */
      draft: {
        [key: string]: unknown
      }
    }
  }
  /** Get a wallet link message */
  createWalletLinkMessage: {
    method: "POST"
    path: "/v1/me/wallets/link/nonce"
    pathParams: never
    query: never
    body: {
      address: Address
    }
    response: {
      nonce: string
      message: string
      issuedAt: number
      expiresAt: number
    }
  }
  /** Create a webhook */
  createWebhook: {
    method: "POST"
    path: "/v1/me/webhooks"
    pathParams: never
    query: never
    body: {
      /** An https URL on port 443 with no credentials or fragment, whose host is a public name that resolves to public addresses alone, within two seconds. */
      url: string
      /** The kinds to deliver: a kind of the log (`order.filled`), a family (`order.*`, `notice.*`, `book.*`), or `*` for every kind, later ones included. */
      events: string[]
    }
    response: WebhookCreated
  }
  /** Delete the account */
  deleteAccount: {
    method: "DELETE"
    path: "/v1/me/account"
    pathParams: never
    query: never
    body: {
      confirm: true
    }
    response: {
      /** False where there was no account to erase. */
      deleted: boolean
    } | {
      deleted: false
      deletion: AccountDeletionPending
    }
  }
  /** Delete an API key */
  deleteApiKey: {
    method: "DELETE"
    path: "/v1/me/api-keys/{name}"
    pathParams: never
    query: never
    body: never
    response: {
      deleted: true
      name: string
      id: string
      /** The webhooks the key made, paused. */
      pausedWebhooks: PausedWebhook[]
    }
  }
  /** Delete a saved Book */
  deleteBookDraft: {
    method: "DELETE"
    path: "/v1/books/drafts/{id}"
    pathParams: {
      /** The record's `id`. */
      id: string
    }
    query: never
    body: never
    response: {
      deleted: true
    }
  }
  /** Remove a Book's logo */
  deleteBookLogo: {
    method: "DELETE"
    path: "/v1/books/{token}/profile/logo"
    pathParams: {
      /** The Book's token, which names the Book. */
      token: Address
    }
    query: never
    body: never
    response: BookProfileResponse
  }
  /** Remove your vote */
  deleteBookVote: {
    method: "DELETE"
    path: "/v1/books/{token}/vote"
    pathParams: {
      /** The Book's token, which names the Book. */
      token: Address
    }
    query: never
    body: never
    response: BookVoteResponse
  }
  /** Remove the profile's picture */
  deleteOwnAvatar: {
    method: "DELETE"
    path: "/v1/me/profile/avatar"
    pathParams: never
    query: never
    body: never
    response: OwnerProfile
  }
  /** Remove the profile's banner */
  deleteOwnBanner: {
    method: "DELETE"
    path: "/v1/me/profile/banner"
    pathParams: never
    query: never
    body: never
    response: OwnerProfile
  }
  /** Delete the account's profile */
  deleteOwnProfile: {
    method: "DELETE"
    path: "/v1/me/profile"
    pathParams: never
    query: never
    body: never
    response: OwnerProfile
  }
  /** Remove your token vote */
  deleteTokenVote: {
    method: "DELETE"
    path: "/v1/tokens/{address}/vote"
    pathParams: {
      address: Address
    }
    query: never
    body: never
    response: BookVoteResponse
  }
  /** Delete a webhook */
  deleteWebhook: {
    method: "DELETE"
    path: "/v1/me/webhooks/{id}"
    pathParams: {
      /** The hook's id. */
      id: string
    }
    query: never
    body: never
    response: {
      deleted: true
      id: string
    }
  }
  /** Browse tokens */
  discoverTokens: {
    method: "GET"
    path: "/v1/tokens/discover"
    pathParams: never
    query: {
      sort?: "top" | "liquidity" | "depth" | "new" | "symbol" | "tier" | "change" | "volume"
      /** `books` lists the Book tokens. */
      filter?: "all" | "verified" | "stocks" | "books"
      dir?: "asc" | "desc"
      limit?: number
      offset?: number
      /** Only tokens with at least this much measured executable depth. */
      minDepthUsd?: number
      q?: string
    }
    body: never
    response: {
      total: number
      source: "indexer"
      tokens: Token[]
    }
  }
  /** Show, hide or label a wallet */
  editAccountWallet: {
    method: "PATCH"
    path: "/v1/me/wallets/{address}"
    pathParams: {
      /** A wallet of the account. */
      address: Address
    }
    query: never
    body: {
      /** Show the wallet on the profile. Showing one needs the account's writes open; hiding one does not. */
      public?: boolean
      /** 1 to 32 characters, seen by the owner alone; null or empty clears it. */
      label?: string | null
    }
    response: AccountWalletsResponse
  }
  /** Edit the account's profile */
  editOwnProfile: {
    method: "PATCH"
    path: "/v1/me/profile"
    pathParams: never
    query: never
    body: {
      /** 1 to 50 characters, with no link, no address, and no word such as `mancer`, `admin`, `official` or `support`. */
      displayName?: string | null
      /** 1 to 500 characters, 10 lines at the most. */
      bio?: string | null
      /** One http or https link of 2,048 characters at the most, never a social network's: link X instead. A bare host reads as https. */
      website?: string | null
      /** Where the picture comes from: `auto` (the default) is the profile's own, else X's. */
      avatarSource?: "auto" | "x" | "none" | null
      /** Show the wallet's holdings on its profile. */
      showPortfolio?: boolean
    }
    response: OwnerProfile
  }
  /** Follow a wallet */
  followWallet: {
    method: "PUT"
    path: "/v1/me/following/{id}"
    pathParams: {
      /** An address, or a username with or without its `@`. */
      id: string
    }
    query: never
    body: never
    response: FollowState
  }
  /** Read the account's events */
  getAccountEvents: {
    method: "GET"
    path: "/v1/me/events"
    pathParams: never
    query: {
      /** A place in the log, 0 or more, as a decimal string of up to 18 digits. The page lists the events after it. */
      since?: string
      /** How many events a page holds, 1 to 500. */
      limit?: number
    }
    body: never
    response: AccountEventsPage
  }
  /** Get the account's app access */
  getAppAccess: {
    method: "GET"
    path: "/v1/me/app-access"
    pathParams: never
    query: never
    body: never
    response: AppAccessResponse
  }
  /** Get the session's account */
  getAuthMe: {
    method: "GET"
    path: "/auth/me"
    pathParams: never
    query: never
    body: never
    response: {
      /** The wallet that signed in. */
      address: Address
      /** The account it signed in to, or null where it could not be read. */
      account: string | null
      wallets?: {
        [key: string]: unknown
      }[] | null
      createdAt?: number | null
      books?: boolean
      /** A linked wallet's request to delete the account, while one stands; null otherwise. */
      deletion?: AccountDeletionPending | null
      [key: string]: unknown
    }
  }
  /** Get a sign-in message */
  getAuthNonce: {
    method: "GET"
    path: "/auth/nonce"
    pathParams: never
    query: {
      /** The wallet that will sign. */
      address: Address
    }
    body: never
    response: {
      /** 32 hex characters. */
      nonce: string
      /** The exact text to sign with `personal_sign` (EIP-191): ten lines naming mancer.xyz, the wallet's checksummed address, Chain ID 4663, the nonce and an Issued At. */
      message: string
    }
  }
  /** Get a Book */
  getBook: {
    method: "GET"
    path: "/v1/books/{token}"
    pathParams: {
      /** The Book's token, which names the Book. */
      token: Address
    }
    query: {
      /** A receipt's block: the answer waits up to 2.5 seconds for the Book to be read through it, and names how far it got in `indexedBlock`. A block past the head counts as the head. */
      minBlock?: number
    }
    body: never
    response: BookDetailResponse
  }
  /** List a Book's curve trades */
  getBookBuys: {
    method: "GET"
    path: "/v1/books/{token}/buys"
    pathParams: {
      /** The Book's token, which names the Book. */
      token: Address
    }
    query: {
      limit?: number
      /** A block number: the page lists items from blocks before it. Pass a page's `nextBefore`. */
      before?: number
    }
    body: never
    response: BookBuysResponse
  }
  /** Build the open of a saved Book */
  getBookDraftOpenSteps: {
    method: "POST"
    path: "/v1/books/drafts/{id}/steps"
    pathParams: {
      id: string
    }
    query: never
    body: DraftOpenStepsRequest
    response: DraftOpenStepsResponse
  }
  /** List a Book's history */
  getBookHistory: {
    method: "GET"
    path: "/v1/books/{token}/history"
    pathParams: {
      /** The Book's token, which names the Book. */
      token: Address
    }
    query: {
      limit?: number
      /** A block number: the page lists items from blocks before it. Pass a page's `nextBefore`. */
      before?: number
    }
    body: never
    response: BookHistoryResponse
  }
  /** Preview a Book's settlement */
  getBookLiquidation: {
    method: "GET"
    path: "/v1/books/{token}/liquidation"
    pathParams: {
      /** The Book's token, which names the Book. */
      token: Address
    }
    query: {
      /** The wallet that would settle. */
      caller?: Address
      /** The floor of this estimate's legs alone: the signed sales carry their own. */
      slippageBps?: number
    }
    body: never
    response: BookLiquidationResponse
  }
  /** Get a Book's logo */
  getBookLogo: {
    method: "GET"
    path: "/v1/books/{token}/logo"
    pathParams: {
      /** The Book's token, which names the Book. */
      token: Address
    }
    query: {
      /** The logo's version, as `profile.logo` names it. */
      v?: string
    }
    body: never
    response: unknown
  }
  /** Get a Book's NFT market */
  getBookNftMarket: {
    method: "GET"
    path: "/v1/books/{token}/nft-market"
    pathParams: {
      /** The Book's token, which names the Book. */
      token: Address
    }
    query: {
      /** How many of the inventory's ids to list. */
      inventory?: number
    }
    body: never
    response: BookNftMarketResponse
  }
  /** List a Book NFT market's moves */
  getBookNftMoves: {
    method: "GET"
    path: "/v1/books/{token}/nft-market/moves"
    pathParams: {
      /** The Book's token, which names the Book. */
      token: Address
    }
    query: {
      limit?: number
      /** A block number: the page lists items from blocks before it. Pass a page's `nextBefore`. */
      before?: number
    }
    body: never
    response: BookNftMovesResponse
  }
  /** Quote a Book NFT market call */
  getBookNftQuote: {
    method: "GET"
    path: "/v1/books/{token}/nft-market/quote"
    pathParams: {
      /** The Book's token, which names the Book. */
      token: Address
    }
    query: {
      action: "open" | "wrap" | "unwrap" | "sell" | "buy-oldest" | "buy-specific" | "set-image"
      /** The address that sends the call. */
      wallet: Address
      /** `wrap` and `buy-oldest`: how many NFTs. A call moves 1 to 20: 409 `zero-count` or `batch-too-large` otherwise. */
      count?: number
      /** `unwrap`, `sell` and `buy-specific`: a comma list of 1 to 20 NFT ids, each named once. */
      ids?: string
      /** `open`: the Book tokens each NFT holds, in raw units: 10^18 to 10^25, one token to 10,000,000. */
      tokensPerNft?: Uint
      /** `open`: 1 to 40 printable characters with plain spaces, and no quote mark, backslash or angle bracket. */
      name?: string
      /** `open`: 1 to 12 printable characters, no spaces. */
      symbol?: string
      /** `open` and `set-image`: an `https://` address with a host name, an `ipfs://` content id, or a PNG, JPEG, GIF or WebP `data:` URL of at most 8,192 characters; any other is at most 512 characters. */
      imageUrl?: string
      /** `1` adds `ready`: the answer's approvals and transactions as ready-to-sign steps, each simulated from the wallet at the head. Without it, the answer carries no `ready`. It also pays a `steps` bucket. */
      steps?: "1"
    }
    body: never
    response: BookNftQuoteResponse
  }
  /** Get a vault's PnL */
  getBookPnl: {
    method: "GET"
    path: "/v1/books/{token}/pnl"
    pathParams: {
      /** The Book's token, which names the Book. */
      token: Address
    }
    query: never
    body: never
    response: BookVaultPnlResponse
  }
  /** Get a vault's signing policy */
  getBookPolicy: {
    method: "GET"
    path: "/v1/books/{token}/policy"
    pathParams: {
      /** The Book's token, which names the Book. */
      token: Address
    }
    query: {
      /** The wallet that will send the transaction: a session's own (another answers 400 `wallet-mismatch`); an API key must name it (400 `wallet-required`). */
      wallet?: Address
      /** A comma list of 1 to 20 token addresses. */
      tokens: string
    }
    body: never
    response: BookPolicyResponse
  }
  /** Quote a raise trade */
  getBookRaiseQuote: {
    method: "GET"
    path: "/v1/books/{token}/raise-quote"
    pathParams: {
      /** The Book's token, which names the Book. */
      token: Address
    }
    query: {
      side?: "buy" | "sell"
      /** A buy's base pair in its raw units (wei of ETH when paying with `eth`); a sale's Book tokens in raw units. */
      amountIn: Uint
      /** What a buy pays with, or what a sale pays out: `eth` (a WETH Book alone, and its default) or `quote` (the base pair). */
      payWith?: "eth" | "quote"
      /** The wallet that sends the trade. */
      taker: Address
      /** The floor under the quote. */
      slippageBps?: number
      /** `1` adds `ready`: the answer's approvals and transactions as ready-to-sign steps, each simulated from the wallet at the head. Without it, the answer carries no `ready`. It also pays a `steps` bucket. */
      steps?: "1"
    }
    body: never
    response: BookRaiseQuoteResponse
  }
  /** List activity across Books */
  getBooksActivity: {
    method: "GET"
    path: "/v1/books/activity"
    pathParams: never
    query: {
      limit?: number
      /** A block number: the page lists items from blocks before it. Pass a page's `nextBefore`. */
      before?: number
    }
    body: never
    response: BooksActivityResponse
  }
  /** List Books deployments */
  getBooksDeployments: {
    method: "GET"
    path: "/v1/books/deployments"
    pathParams: never
    query: never
    body: never
    response: BooksDeploymentsResponse
  }
  /** Get Books totals */
  getBooksStats: {
    method: "GET"
    path: "/v1/books/stats"
    pathParams: never
    query: never
    body: never
    response: BooksStatsResponse
  }
  /** Build a Book's act */
  getBookSteps: {
    method: "POST"
    path: "/v1/books/{token}/steps"
    pathParams: {
      /** The Book's token, which names the Book. */
      token: Address
    }
    query: never
    body: BookStepsRequest
    response: BookStepsResponse
  }
  /** List top Books traders */
  getBooksTraders: {
    method: "GET"
    path: "/v1/books/traders"
    pathParams: never
    query: {
      limit?: number
    }
    body: never
    response: BooksTradersResponse
  }
  /** List a trader's history */
  getBookTraderHistory: {
    method: "GET"
    path: "/v1/books/traders/{address}/history"
    pathParams: {
      /** The wallet. */
      address: Address
    }
    query: {
      limit?: number
      /** A page's `nextBefore`, as it was given. */
      before?: string
    }
    body: never
    response: BookTraderHistoryResponse
  }
  /** Get a trader's record */
  getBookTraderRecord: {
    method: "GET"
    path: "/v1/books/traders/{address}"
    pathParams: {
      /** The wallet. */
      address: Address
    }
    query: never
    body: never
    response: BookTraderRecordResponse
  }
  /** List a vault's trades */
  getBookTrades: {
    method: "GET"
    path: "/v1/books/{token}/trades"
    pathParams: {
      /** The Book's token, which names the Book. */
      token: Address
    }
    query: {
      limit?: number
      /** A block number: the page lists items from blocks before it. Pass a page's `nextBefore`. */
      before?: number
    }
    body: never
    response: BookTradesResponse
  }
  /** Get the contracts to check against */
  getContracts: {
    method: "GET"
    path: "/v1/contracts"
    pathParams: never
    query: never
    body: never
    response: Contracts
  }
  /** Get fill economics */
  getExecutorEconomics: {
    method: "GET"
    path: "/v1/executor/economics"
    pathParams: never
    query: never
    body: never
    response: {
      /** Multiplier applied to estimated gas cost before comparing with fee income. */
      gasSafety: number
      /** Minimum fee income over gas, in USD, for a fill to be sent. */
      minProfitUsd: number
      /** Gas units of the executor's last simulated fill. Null until one has run. */
      gasUnits: number | null
      /** Gas price of the executor's last simulation, in wei. */
      gasPriceWei: number | null
    }
  }
  /** Read the Following feed */
  getFollowingFeed: {
    method: "GET"
    path: "/v1/me/feed"
    pathParams: never
    query: {
      /** How many trades a page holds. */
      limit?: number
      /** A page's `nextBefore`, as this route wrote it. Omit it for the newest page. */
      before?: string
    }
    body: never
    response: FeedPage
  }
  /** Get display-currency rates */
  getFx: {
    method: "GET"
    path: "/v1/fx"
    pathParams: never
    query: never
    body: never
    response: {
      base: "USD"
      /** Code to USD multiplier. USD is always present and always 1. */
      rates: {
        [key: string]: number
      }
      /** When the set was fetched, in milliseconds. */
      at: number
      /** The ECB publication date the rates belong to. */
      date: string | null
      /** True when a persisted set could not be refreshed. */
      stale: boolean
      currencies: {
        code?: string
        name?: string
        symbol?: string
        locale?: string
      }[]
    }
  }
  /** Get the caller's region */
  getGeo: {
    method: "GET"
    path: "/v1/geo"
    pathParams: never
    query: never
    body: never
    response: {
      /** ISO 3166-1 alpha-2 country code, or null when unknown. */
      country: string | null
      /** True when stock pairs are refused for this region (HTTP 451 on quotes and orders). */
      stocksRestricted: boolean
    }
  }
  /** Get deployment addresses */
  getHealth: {
    method: "GET"
    path: "/health"
    pathParams: never
    query: never
    body: never
    response: Health
  }
  /** Get rate limits */
  getLimits: {
    method: "GET"
    path: "/v1/limits"
    pathParams: never
    query: never
    body: never
    response: Limits
  }
  /** Get the token map */
  getMap: {
    method: "GET"
    path: "/v1/map"
    pathParams: never
    query: {
      /** How many tokens, in order of liquidity. */
      size?: number
    }
    body: never
    response: {
      nodes: {
        address: Address
        symbol: string
        decimals: number | null
        isStock: boolean
        liquidityUsd: number
        priceUsd: number | null
        holders: number
      }[]
      edges: {
        /** The lower of the two addresses. */
        a: Address
        b: Address
        depthUsd: number
        pools: number
        venues: string[]
      }[]
      /** Unix seconds. */
      asOf: number
      source: "indexer"
    }
  }
  /** Get US market hours */
  getMarketStatus: {
    method: "GET"
    path: "/v1/market"
    pathParams: never
    query: never
    body: never
    response: MarketStatus
  }
  /** Get an NFT */
  getNft: {
    method: "GET"
    path: "/v1/nfts/{collection}/{tokenId}"
    pathParams: {
      /** The collection's contract. */
      collection: Address
      /** The piece's id as a decimal integer, no leading zeros. */
      tokenId: string
    }
    query: never
    body: never
    response: Nft
  }
  /** Get an NFT collection */
  getNftCollection: {
    method: "GET"
    path: "/v1/nft-collections/{address}"
    pathParams: {
      /** The collection's contract. */
      address: Address
    }
    query: never
    body: never
    response: NftCollection
  }
  /** Get an NFT collection's banner */
  getNftCollectionBanner: {
    method: "GET"
    path: "/v1/nft-collections/{address}/banner"
    pathParams: {
      /** The collection's contract. */
      address: Address
    }
    query: {
      /** The banner's version, as the collection's `banner` path names it. */
      v?: string
    }
    body: never
    response: unknown
  }
  /** Get an NFT collection's picture */
  getNftCollectionImage: {
    method: "GET"
    path: "/v1/nft-collections/{address}/image"
    pathParams: {
      /** The collection's contract. */
      address: Address
    }
    query: {
      /** The picture's version, as the collection's `image` path names it. */
      v?: string
    }
    body: never
    response: unknown
  }
  /** Get an NFT's picture */
  getNftImage: {
    method: "GET"
    path: "/v1/nfts/{collection}/{tokenId}/image"
    pathParams: {
      /** The collection's contract. */
      collection: Address
      /** The piece's id as a decimal integer, no leading zeros. */
      tokenId: string
    }
    query: {
      /** The picture's version, as the piece's `image` path names it. */
      v?: string
    }
    body: never
    response: unknown
  }
  /** Get an order */
  getOrder: {
    method: "GET"
    path: "/v1/orders/{hash}"
    pathParams: {
      hash: Hash
    }
    query: never
    body: never
    response: OrderRecord
  }
  /** Build an order's on-chain cancel */
  getOrderCancelSteps: {
    method: "POST"
    path: "/v1/orders/{hash}/cancel-steps"
    pathParams: {
      hash: Hash
    }
    query: never
    body: {
      wallet?: Address
      /** The signed order, every field as signed: needed where the order's scope does not reach the caller (no session or key of the maker's). */
      order?: {
        [key: string]: unknown
      }
    }
    response: ReadySteps
  }
  /** Get the order fee for a pair */
  getOrderFee: {
    method: "GET"
    path: "/v1/order-fee"
    pathParams: never
    query: {
      tokenIn: Address
      tokenOut: Address
    }
    body: never
    response: {
      tokenIn: Address
      tokenOut: Address
      /** The order base fee. */
      baseFeeBps: number
      /** The pair's routing fee. */
      swapFeeBps: number
      /** The sum; the minimum `maxFeeBps` the book admits. */
      feeBps: number
      /** The pair category the schedule applied. */
      tier: "pegged" | "eth-stable" | "other" | "new-token"
    }
  }
  /** Build a maker's cancel-all */
  getOrdersCancelAllSteps: {
    method: "POST"
    path: "/v1/orders/cancel-all-steps"
    pathParams: never
    query: never
    body: {
      wallet?: Address
      /** A book Mancer answers for, the current one by default. */
      contract?: Address
      /** Required on a V3 book, and never zero. */
      salt?: string
    }
    response: ReadySteps
  }
  /** Get the setup an order needs */
  getOrderSetup: {
    method: "GET"
    path: "/v1/orders/setup"
    pathParams: never
    query: {
      tokenIn: Address
      tokenOut: Address
      /** The per-fill input in raw units. */
      amountIn: Uint
      /** The wallet that will sign the order. */
      maker: Address
      /** 1 for a limit or stop order, more for a recurring order. 1..10000. */
      totalFills: number
      /** With `steps=1`: `1` for an order that sells ether, which is signed on WETH (`tokenIn` WETH). The steps wrap what the maker's WETH falls short of. */
      nativeIn?: "1"
      /** `1` adds `ready`: the answer's approvals and transactions as ready-to-sign steps, each simulated from the wallet at the head. Without it, the answer carries no `ready`. It also pays a `steps` bucket. */
      steps?: "1"
    }
    body: never
    response: {
      authorizations: LaunchAuthorization[]
      /** With `steps=1`: the wrap where an ether sale's WETH falls short, the order book's exact approval for this order's pull plus the maker's other open orders on the token, and each launch setup, in order. */
      ready?: (ReadySteps & {
        need?: {
          book?: Address
          pull?: Uint
          openPulls?: Uint
          /** Whose open orders `openPulls` counts: all the maker's for its own session, those your key submitted for a key, none for another wallet's session (the approval then covers this order alone). */
          openPullsOf?: "maker" | "key" | "none"
          allowance?: Uint
          held?: Uint
        }
      }) | ReadyStepsField
    }
  }
  /** Get the account's own profile */
  getOwnProfile: {
    method: "GET"
    path: "/v1/me/profile"
    pathParams: never
    query: never
    body: never
    response: OwnerProfile
  }
  /** Get pool candles */
  getPoolCandles: {
    method: "GET"
    path: "/v1/pools/{pool}/candles"
    pathParams: {
      pool: string
    }
    query: {
      tf?: 60 | 300 | 900 | 3600 | 14400 | 86400
      limit?: number
      before?: number
    }
    body: never
    response: {
      pool: string
      tf: number
      source: "indexer-pool"
      candles: Candle[]
      hasMore?: boolean
      nextBefore?: number
    }
  }
  /** Get pool depth */
  getPoolDepth: {
    method: "GET"
    path: "/v1/pools/{uid}/depth"
    pathParams: {
      uid: string
    }
    query: never
    body: never
    response: {
      pool: string
      venue: string
      family: string
      token0: Address
      token1: Address
      /** The cash the pool pays out for a two-percent move. */
      depthUsd: number
      /** `state`: walked from the pool's own state. `probe`: a hooked pool, measured by quoting it. */
      depthSource: "state" | "probe"
      status: "ok" | "stale"
      priceUsd: number
      liquidityUsd?: number | null
      amount0?: number | null
      amount1?: number | null
      measuredAt: string
      source: "indexer"
    }
  }
  /** Get token prices */
  getPrices: {
    method: "GET"
    path: "/v1/prices"
    pathParams: never
    query: never
    body: never
    response: {
      count: number
      source: "indexer"
      prices: {
        [key: string]: {
          /** USD. */
          price: number
          priceConfidence?: string | null
          priceDepthUsd?: number | null
          /** Percent. */
          change24h?: number | null
          symbol: string
          name: string
          decimals: number
          isStock: boolean
          depthUsd?: number | null
          volume24h?: number | null
          marketCapUsd?: number | null
        }
      }
    }
  }
  /** Quote a swap */
  getQuote: {
    method: "GET"
    path: "/v1/quote"
    pathParams: never
    query: {
      /** Token to spend. Use canonical WETH when spending native ETH. */
      tokenIn: Address
      /** Token to receive. Use canonical WETH when receiving native ETH. */
      tokenOut: Address
      /** Input amount in raw units of `tokenIn`. */
      amountIn: Uint
      /** Requests the executable build. When no taker is supplied, this wallet also funds and signs. */
      recipient?: Address
      /** The wallet that funds and signs. Opts into the ordered `execution` envelope. Alias of `taker`. */
      address?: Address
      /** The wallet that funds and signs. Opts into the ordered `execution` envelope. Alias of `address`. */
      taker?: Address
      /** Maker-specific quote context without requesting calldata. In executable mode it must match the funding wallet. */
      maker?: Address
      /** `1` adds Mancer's meta-aggregator race. Cannot be combined with `excludeAccountBound=1`. */
      external?: "0" | "1"
      /** `1` excludes routes whose settlement depends on the taker's protocol identity. Use for forwarding contracts or router-only integrations. */
      excludeAccountBound?: "0" | "1"
      /** Executable mode only. Tolerance in basis points, clamped to 1..5000. Defaults to `recommendedSlippageBps`. */
      slippageBps?: number
      /** Executable mode only. The absolute net output floor the user accepted on the display quote, in raw units of `tokenOut`. A fresh expected output below it is refused with 409. */
      acceptedMinOut?: Uint
      /** Your own fee on this swap in basis points, paid to `integratorFeeRecipient` inside the transaction; every amount returned is net of it. Needs an API key whose ceiling allows the rate (403 otherwise). */
      integratorFeeBps?: number
      /** The address your fee is paid to. Required with `integratorFeeBps`. */
      integratorFeeRecipient?: Address
      /** `input` takes your fee from `amountIn`, exactly, before the swap. `output` (the default) takes it from what the swap delivers, as a share of the actual fill. A side in native ETH is paid as ETH. */
      integratorFeeSide?: "input" | "output"
      /** `1` spends native ETH; `tokenIn` must be canonical WETH. */
      nativeIn?: "0" | "1"
      /** `1` receives native ETH; `tokenOut` must be canonical WETH. */
      nativeOut?: "0" | "1"
      /** `1` keeps the executable build away from top-level hooked pools. */
      excludeHooked?: "0" | "1"
      /** `0` skips Mancer's final built-transaction simulation. Only for integrators that simulate themselves. Cannot be combined with `selection=net-output`. */
      verify?: "0" | "1"
      /** `net-output` ranks successfully assessed candidates by output net of estimated gas. Default `output` returns the first executable candidate. */
      selection?: "output" | "net-output"
      /** `1` adds `ready`: the answer's approvals and transactions as ready-to-sign steps, each simulated from the wallet at the head. Without it, the answer carries no `ready`. It also pays a `steps` bucket. */
      steps?: "1"
    }
    body: never
    response: QuoteResponse
  }
  /** Get routed trading stats */
  getRoutedStats: {
    method: "GET"
    path: "/v1/stats/routed"
    pathParams: never
    query: {
      days?: number
    }
    body: never
    response: RoutedStats
  }
  /** Stream market events */
  getStream: {
    method: "GET"
    path: "/v1/stream"
    pathParams: never
    query: {
      /** Comma-separated event kinds. The stream emits `price` and `candle`; other names deliver nothing. */
      kinds?: string
      /** Comma-separated subjects (token or pool ids). */
      keys?: string
      /** Resume after this sequence number. `Last-Event-ID` does the same. */
      since?: number
    }
    body: never
    response: unknown
  }
  /** Get the chain's last minute */
  getSwapPulse: {
    method: "GET"
    path: "/v1/swaps/pulse"
    pathParams: never
    query: never
    body: never
    response: {
      swaps: number
      transactions: number
      volumeUsd: number
      /** Unix seconds. */
      asOf: number
      source: "indexer"
    }
  }
  /** List the chain's latest swaps */
  getSwaps: {
    method: "GET"
    path: "/v1/swaps"
    pathParams: never
    query: {
      limit?: number
    }
    body: never
    response: {
      swaps: {
        /** txHash:logIndex, stable across polls. */
        id: string
        txHash: Hash
        logIndex: number
        blockNumber: string
        /** Unix seconds. */
        timestamp: number
        token: Address
        tokenSymbol: string | null
        /** The pool's other side; native ETH is the zero address. */
        cash: Address
        cashSymbol: string | null
        pool: string
        venue: string
        side: "buy" | "sell"
        amountToken: number | null
        amountCash: number | null
        priceUsd: number
        volumeUsd: number
        /** Who made the swap: its payer, whose money paid for it, as `/v1/transactions/{hash}` names each swap's `maker`; where the transaction is not read yet, its sender. Null only on a token's fee (`fee`). */
        trader: Address | null
        /** The transaction's sender. Absent on a token's fee. */
        sender?: Address
        /** Present where the swap is a token's own fee traded inside someone else's trade: nobody's swap, so `trader` is null. Its price and volume stay in the market's data. */
        fee?: true
        /** Where what the swap bought went, where that is a wallet other than its trader (a solver's customer, a recipient the buyer named). */
        deliveredTo?: Address
        /** Present where the trader is a solver's float that filled another's purchase with its own money. */
        solver?: true
        /** Present where the swap was a step of no trade of its owner's: liquidity added (a zap swaps part of a deposit), removed, or moved. Absent for a trade. */
        purpose?: "liquidity-add" | "liquidity-remove" | "liquidity-move"
      }[]
      source: "indexer"
    }
  }
  /** Get a token */
  getToken: {
    method: "GET"
    path: "/v1/tokens/{address}"
    pathParams: {
      address: Address
    }
    query: never
    body: never
    response: TokenDetail
  }
  /** Get token candles */
  getTokenCandles: {
    method: "GET"
    path: "/v1/tokens/{address}/candles"
    pathParams: {
      address: Address
    }
    query: {
      /** Bucket size in seconds. */
      tf?: 60 | 300 | 900 | 3600 | 14400 | 86400
      limit?: number
      /** Unix seconds; only buckets before this time, for paging back. */
      before?: number
    }
    body: never
    response: {
      token: Address
      tf: number
      source: "indexer-token"
      candles: Candle[]
      hasMore?: boolean
      /** Pass as `before` for the previous page. */
      nextBefore?: number
    }
  }
  /** List a token's top holders */
  getTokenHolders: {
    method: "GET"
    path: "/v1/tokens/{address}/holders"
    pathParams: {
      address: Address
    }
    query: {
      limit?: number
    }
    body: never
    response: {
      token: Address
      holders: number
      top: {
        holder: Address
        balance: string
        /** A Book's token: the holder is one of the Book's own contracts. Absent on every other holder. */
        bookRole?: BookHolderRole
      }[]
    }
  }
  /** List a token's holders with their PnL */
  getTokenHoldersPnl: {
    method: "GET"
    path: "/v1/tokens/{address}/holders/pnl"
    pathParams: {
      address: Address
    }
    query: {
      /** How many holders, largest first. A value out of range reads as its nearest bound. */
      limit?: number
    }
    body: never
    response: TokenHoldersPnlResponse
  }
  /** Get a token's logo */
  getTokenImage: {
    method: "GET"
    path: "/v1/tokens/{address}/image"
    pathParams: {
      address: Address
    }
    query: never
    body: never
    response: unknown
  }
  /** List named traders' trades in a token */
  getTokenKolMarks: {
    method: "GET"
    path: "/v1/tokens/{address}/kol-marks"
    pathParams: {
      /** The token. */
      address: Address
    }
    query: {
      /** How many days back to read. A value out of range reads as its nearest bound. */
      days?: number
      /** The most marks the page carries. A value out of range reads as its nearest bound. */
      limit?: number
    }
    body: never
    response: {
      count: number
      marks: TokenKolMark[]
      /** Unix seconds the page reaches back to: the start of `days` when it was read whole, the oldest mark's time when `limit` ended it. */
      since: number
      /** True where the read ran out of time before `days` was read whole: `since` is then later than the start of `days`. */
      truncated: boolean
      source: "indexer"
    }
  }
  /** Get token stats */
  getTokenStats: {
    method: "GET"
    path: "/v1/tokens/{address}/stats"
    pathParams: {
      address: Address
    }
    query: never
    body: never
    response: {
      token: Address
      source: "indexer-token"
      price?: number | null
      /** Percent. */
      change24h?: number | null
      volume24h: number
      trades24h: number
      pools24h?: number
      buys24h?: number
      sells24h?: number
      holders: number
      lastTrade?: number | null
    }
  }
  /** Get a token summary */
  getTokenSummary: {
    method: "GET"
    path: "/v1/tokens/{address}/summary"
    pathParams: {
      address: Address
    }
    query: never
    body: never
    response: {
      address: Address
      name: string | null
      symbol: string | null
      priceUsd: number | null
      /** Percent. */
      change24h: number | null
      marketCapUsd: number | null
      liquidityUsd: number | null
      volume24hUsd: number | null
      isStock: boolean
      /** A Book token: its Book. Absent on every other token. */
      book?: BookFlag
    }
  }
  /** List a token's swaps */
  getTokenSwaps: {
    method: "GET"
    path: "/v1/tokens/{address}/swaps"
    pathParams: {
      address: Address
    }
    query: {
      limit?: number
      /** A page's `nextBefore`, as this route wrote it for the same filters or none. The page holds the swaps older than that page, with none missed or repeated. Omit it for the newest page. */
      before?: string
      /** Only the swaps that bought the token (`buy`) or sold it (`sell`). */
      side?: "buy" | "sell"
      /** Only swaps of at least this many dollars, a plain decimal. 0 is no bound. */
      minUsd?: number
      /** Only swaps of at most this many dollars, a plain decimal. 0 is no bound, and one under `minUsd` is `bad-filter`. */
      maxUsd?: number
    }
    body: never
    response: {
      token: Address
      source: "indexer"
      swaps: TokenSwap[]
      /** The cursor of the next older page, opaque. Null once the page reaches the token's first priced swap. */
      nextBefore: string | null
      /** The short identity of each listed trader who shows a name, a picture, a mark or an X handle, by lowercase address. Null where the names did not arrive in time. */
      users?: {
        [key: string]: BooksShortIdentity
      } | null
      /** Present on a page asked with `side`, `minUsd` or `maxUsd`: the filter as read, a bound of 0 as null. */
      filter?: {
        side: "buy" | "sell" | null
        minUsd: number | null
        maxUsd: number | null
      }
      /** On a filtered page that ran out of its week of blocks before it was full, the unix second it searched back to; its `nextBefore` reads on from there. Null otherwise. */
      searchedTo?: number | null
    }
  }
  /** Get a trader's position in a token */
  getTokenTrader: {
    method: "GET"
    path: "/v1/tokens/{address}/traders/{wallet}"
    pathParams: {
      /** The token. */
      address: Address
      wallet: Address
    }
    query: never
    body: never
    response: TokenTraderPosition
  }
  /** List a token's top traders */
  getTokenTraders: {
    method: "GET"
    path: "/v1/tokens/{address}/traders"
    pathParams: {
      address: Address
    }
    query: {
      /** `1d` reads the last 24 hours, `7d` the last 7 days. */
      window?: "1d" | "7d"
      /** `pnl` ranks by `pnlUsd` (realized where it is null), `bought` and `sold` by the dollars bought or sold in the window. */
      sort?: "pnl" | "bought" | "sold"
    }
    body: never
    response: TokenTradersResponse
  }
  /** Get a token's vote counts */
  getTokenVotes: {
    method: "GET"
    path: "/v1/tokens/{address}/votes"
    pathParams: {
      address: Address
    }
    query: never
    body: never
    response: TokenVoteSummary
  }
  /** Get a token's trading windows */
  getTokenWindows: {
    method: "GET"
    path: "/v1/tokens/{address}/windows"
    pathParams: {
      address: Address
    }
    query: never
    body: never
    response: TokenWindowsResponse
  }
  /** Get a transaction's token flow */
  getTransaction: {
    method: "GET"
    path: "/v1/transactions/{hash}"
    pathParams: {
      hash: Hash
    }
    query: never
    body: never
    response: {
      hash: Hash
      /** Decimal block number. */
      block: string
      /** Unix seconds; null while the block is not indexed yet. */
      timestamp: number | null
      status: "success" | "reverted" | "unknown"
      from: Address
      to: Address | null
      valueRaw: Uint
      gasUsed: string | null
      /** Every address the flow touches. */
      nodes: {
        address: Address
        /** `origin` is the sender, `router` a Mancer contract or the Uniswap V4 PoolManager, `zero` the mint and burn address, `weth` the WETH contract. */
        kind: "origin" | "address" | "pool" | "router" | "zero" | "weth"
        label: string
        venue: string | null
        /** The pool's pair, or the pool count on the V4 PoolManager. */
        pair: string | null
        /** The step at which the flow first reaches the address from the sender; the sender is 0. */
        layer: number
      }[]
      /** Every movement, in log order. */
      edges: {
        id: string
        /** -1 for the transaction's own value, which is not a log. */
        logIndex: number
        kind: "native" | "transfer" | "mint" | "burn" | "wrap" | "unwrap" | "nft"
        from: Address
        to: Address
        /** Native ETH is the zero address. */
        token: Address
        amountRaw: Uint
        /** Scaled by the token's decimals; null when they are unknown, or for an NFT. */
        amount: number | null
        /** The movement's value at the token's current price; null where the token has no price. */
        usd: number | null
        tokenId: string | null
      }[]
      /** Every swap, on the pool that made it. */
      swaps: {
        logIndex: number
        venue: string
        family: string
        /** The pool address, or the V4 PoolManager for a V4 hop. */
        node: Address
        pool: Address
        poolId: string | null
        pair: string | null
        /** Empty where the pool is not known. */
        tokenIn: string
        tokenOut: string
        amountInRaw: string
        amountOutRaw: string
        amountIn: number | null
        amountOut: number | null
        /** The swap's value: its input at the current price, or its output when the input has none. */
        usd: number | null
        sender: Address
        recipient: Address | null
        /** Who made the swap: its payer, whose money paid for it, as the tapes name it; where that is not read yet, the transaction's maker. Null on a token's own fee (`fee`). */
        maker?: Address | null
        /** Present where the swap is a token's own fee traded inside someone else's trade: nobody's swap. */
        fee?: true
        /** Where what the swap bought went, where that is a wallet other than its maker. */
        deliveredTo?: Address
        /** Present where the maker is a solver's float that filled another's purchase out of its own money. */
        solver?: true
      }[]
      /** Every address that made one of its swaps, the maker of the most swaps first. Present where the transaction swapped. A token's fee counts for none. */
      makers?: Address[]
      /** Symbol, decimals and current price by address for every token in the flow. */
      tokens: {
        [key: string]: {
          address: Address
          symbol: string | null
          decimals: number | null
          /** The token's current price; null where it has none. ETH carries WETH's. */
          priceUsd: number | null
        }
      }
      /** The sender's net flows. */
      origin: {
        sent: TxNetFlows
        received: TxNetFlows
      }
      /** Whose tokens the transaction moved, and `why`: the account a bundler sent it for, its sender, an order's maker, the one trader, or the one payer. Null where none is clear. */
      owner?: {
        address: Address
        why: "sender" | "account" | "order-maker" | "trader" | "payer"
      } | null
      /** Every change of a pool's liquidity, in log order. Amounts are given for pairs and V3 pools; a V4 change names its liquidity alone, and what moved is in the transfers. */
      liquidity?: {
        logIndex: number
        action: "add" | "remove"
        venue: string
        family: string
        pool: Address
        poolId: string | null
        pair: string | null
        sender: Address
        owner: Address
        token0: string | null
        token1: string | null
        amount0: number | null
        amount1: number | null
        /** The liquidity's own change, raw and signed. */
        liquidity: string
        tickLower: number | null
        tickUpper: number | null
      }[]
      /** What the transaction did for its owner where it was no trade: liquidity added (the owner holds more of a position after), removed, or both. Null for a trade. */
      purpose?: ("liquidity-add" | "liquidity-remove" | "liquidity-move") | null
      /** Past 600 movements, the first 600 are returned. */
      truncated: boolean
      /** `node`: the block is not indexed yet, so only the head and the value are filled. */
      source: "indexer" | "node"
      /** The transaction on Etherscan. */
      explorerUrl: string
    }
  }
  /** Build a send */
  getTransferSteps: {
    method: "POST"
    path: "/v1/transfers/steps"
    pathParams: never
    query: never
    body: TransferStepsRequest
    response: TransferStepsResponse
  }
  /** Get a profile */
  getUser: {
    method: "GET"
    path: "/v1/users/{id}"
    pathParams: {
      /** An address, or a username with or without its `@`. */
      id: string
    }
    query: never
    body: never
    response: (UserProfileResponse | UserRenamed)
  }
  /** Get a profile's picture */
  getUserAvatar: {
    method: "GET"
    path: "/v1/users/{address}/avatar"
    pathParams: {
      address: Address
    }
    query: {
      /** The picture's version, as the `avatar` path names it. */
      v?: string
    }
    body: never
    response: unknown
  }
  /** Get a profile's banner */
  getUserBanner: {
    method: "GET"
    path: "/v1/users/{address}/banner"
    pathParams: {
      address: Address
    }
    query: {
      /** The banner's version, as the `banner` path names it. */
      v?: string
    }
    body: never
    response: unknown
  }
  /** Get a profile's X picture */
  getUserXAvatar: {
    method: "GET"
    path: "/v1/users/{address}/x-avatar"
    pathParams: {
      address: Address
    }
    query: {
      /** The picture's version, as the `x.avatar` path names it. */
      v?: string
    }
    body: never
    response: unknown
  }
  /** List the venues' pool factories */
  getVenueFactories: {
    method: "GET"
    path: "/v1/venues/factories"
    pathParams: never
    query: never
    body: never
    response: VenueFactoriesResponse
  }
  /** List a wallet's balances */
  getWalletBalances: {
    method: "GET"
    path: "/v1/wallets/{address}/balances"
    pathParams: {
      address: Address
    }
    query: {
      limit?: number
    }
    body: never
    response: {
      address: Address
      count: number
      balances: {
        token: Address
        /** 0 for ERC-20; the id for ERC-721 and ERC-1155. */
        tokenId: string
        /** Exact integer, unscaled. */
        balance: string
        /** `ledger`: the sum of the token's transfers. `chain`: read from the contract, for a token whose transfers were found not to describe its balances. */
        balanceSource?: "ledger" | "chain"
        /** Whether the token's transfers describe its balances (`conforming`, `nonconforming` or `mixed`), where that was checked. */
        verdict?: string
        lastBlock: number
        symbol?: string
        name?: string
        decimals?: number
        isStock?: boolean
        /** A Book token: its Book. Absent on every other token. */
        book?: BookFlag
        /** A Book NFT market's collection: its Book. Absent on every other collection. */
        bookNft?: BookNftFlag
      }[]
    }
  }
  /** List a wallet's Books */
  getWalletBooks: {
    method: "GET"
    path: "/v1/wallets/{address}/books"
    pathParams: {
      /** The wallet. */
      address: Address
    }
    query: {
      /** A receipt's block: the answer waits up to 2.5 seconds for the Book to be read through it, and names how far it got in `indexedBlock`. A block past the head counts as the head. */
      minBlock?: number
      /** With `minBlock`: the Books the receipt's step was on, a comma list of up to 8 token addresses, so the answer waits for those alone. Empty for a step on no Book. */
      books?: string
    }
    body: never
    response: BookWalletResponse
  }
  /** List a wallet's NFTs */
  getWalletCollectibles: {
    method: "GET"
    path: "/v1/wallets/{address}/collectibles"
    pathParams: {
      address: Address
    }
    query: {
      /** The most pieces the page carries. */
      limit?: number
      /** The most pieces of one collection the page carries, for a look across collections. By default every piece of each. */
      perCollection?: number
      /** The pieces to pass over in the answer's order, the previous page's `nextOffset`. */
      offset?: number
      /** One collection's pieces alone. The values and `collections` still cover the whole wallet. */
      collection?: Address
      /** A search: across collections, a collection's name, symbol, OpenSea name or address prefix; with `collection`, a piece's name or a token id starting with its digits (`#12` or `12`). */
      q?: string
      /** The collections' order: most pieces first, most worth at offers first (the unpriced last), by name, or the default order with each collection's pieces rarest first. */
      sort?: "count" | "value" | "name" | "rarity"
      /** `1` for the collections OpenSea verified alone. */
      verified?: "0" | "1"
    }
    body: never
    response: {
      address: Address
      collectibles: {
        collection: Address
        /** The contract's own `name()`. */
        collectionName?: string | null
        collectionSymbol?: string | null
        /** OpenSea verified the collection; null where OpenSea has no word on it. */
        collectionVerified?: boolean | null
        /** The API's path for the collection's picture. */
        collectionImage?: string | null
        tokenId: string
        /** How many of the piece the wallet holds: 1 for an ERC-721, any count for an ERC-1155. */
        balance: string
        standard: "erc721" | "erc1155"
        /** The piece's name from its metadata. */
        name?: string | null
        /** The API's path for the piece's picture. */
        image?: string | null
        /** The piece's rank in its collection by OpenRarity's method, 1 the rarest. */
        rarityRank?: number | null
        /** The best live offer that covers the piece, one item's price in ether. Null where no offer covers it or its collection's offers are not read. */
        offer: number | null
        /** `offer` in dollars at ether's price. */
        offerUsd: number | null
        /** The kind of offer that set `offer`. */
        offerKind: "item" | "trait" | "collection" | null
      }[]
      /** Pieces of the page whose metadata was not read in time. They resolve behind the answer, for the next ask. */
      pending: number
      /** The wallet holds pieces in scope that the page does not carry. */
      truncated: boolean
      /** The block every transfer is read through. */
      indexedBlock: number | null
      /** The pieces in scope after the filters: the wallet's, or the one collection's. */
      total: number
      /** The `offset` of the next page; null on the last. */
      nextOffset: number | null
      /** Every collection the wallet holds after the filters, in the answer's order, 500 at the most. */
      collections: {
        collection: Address
        collectionName?: string | null
        collectionSymbol?: string | null
        standard: "erc721" | "erc1155"
        /** How many of its pieces the wallet holds. */
        count: number
        verified?: boolean | null
        image?: string | null
        banner?: string | null
        /** OpenSea's slug for the collection. */
        slug?: string | null
        openseaUrl?: string | null
        /** The collection's floor in ether. Shown as information, and not part of any value. */
        floor: number | null
        floorUsd?: number | null
        /** `read`: valued from the collection's whole live market. `unread`: not valued, since its market is not read whole. `unlisted`: OpenSea knows no collection of the contract. */
        offers: "read" | "unread" | "unlisted"
        /** Its best live collection offer, one item's price in ether. */
        collectionOffer: number | null
        collectionOfferUsd?: number | null
        /** The wallet's pieces of it at offers, in ether. Null where no offer covers any of them. */
        offerValueEth: number | null
        offerValueUsd?: number | null
        /** How many of its pieces an offer covers. */
        pricedPieces: number
      }[]
      /** The collections after the filters, the 500 cap aside. */
      collectionsTotal: number
      /** Those collections' pieces at offers, in ether. Null where no offer covers any piece. */
      offerValueEth: number | null
      /** `offerValueEth` in dollars at ether's price. */
      offerValueUsd: number | null
      /** How many of those pieces an offer covers. */
      pricedPieces: number
      /** How many of those pieces no offer covers, or whose collection's offers are not read. */
      unpricedPieces: number
    }
  }
  /** Get a wallet's value over time */
  getWalletHistory: {
    method: "GET"
    path: "/v1/wallets/{address}/history"
    pathParams: {
      address: Address
    }
    query: {
      days?: number
    }
    body: never
    response: {
      address: Address
      days: number
      source: "indexer"
      points: {
        /** The day's start */
        t?: number
        valueUsd?: number
      }[]
      tokens: {
        token?: Address
        symbol?: string
        decimals?: number
        /** Exact integer, unscaled. */
        balance?: string
        valueUsd?: number | null
      }[]
    }
  }
  /** List a wallet's NFT moves */
  getWalletNftActivity: {
    method: "GET"
    path: "/v1/wallets/{address}/nft-activity"
    pathParams: {
      address: Address
    }
    query: {
      /** The most moves the page carries, 1 to 4 digits; a value over 100 reads as 100. */
      limit?: number
      /** A page's `next`. Omit it for the newest page. */
      before?: string
      /** One collection's moves alone, in the same order and by the same cursor. */
      collection?: Address
    }
    body: never
    response: {
      address: Address
      events: WalletNftMove[]
      /** The `before` of the next older page; null on the last. */
      next: string | null
    }
  }
  /** List a wallet's pieces of a collection */
  getWalletNfts: {
    method: "GET"
    path: "/v1/wallets/{address}/nfts/{collection}"
    pathParams: {
      address: Address
      /** The collection's contract. */
      collection: Address
    }
    query: never
    body: never
    response: {
      address: Address
      collection: Address
      /** How many token ids are in `tokens`. */
      count: number
      tokens: {
        tokenId: string
        /** How many of the id the wallet holds: 1 for an ERC-721, any count for an ERC-1155. */
        balance: string
        /** The block of the last transfer of the id that touched the wallet. */
        lastBlock: number
      }[]
      /** The block every transfer of the collection is read through; null where it could not be read. */
      indexedBlock: number | null
      /** True when the wallet holds more than 10,000 ids of the collection; the answer carries the lowest 10,000. */
      truncated: boolean
    }
  }
  /** Get a wallet's profit and loss */
  getWalletPnl: {
    method: "GET"
    path: "/v1/wallets/{address}/pnl"
    pathParams: {
      address: Address
    }
    query: never
    body: never
    response: {
      address: Address
      source: "indexer"
      /** The wallet has more than 90,000 transfer rows; the figures cover the first 90,000. */
      truncated: boolean
      totals: {
        costBasisUsd: number
        valueUsd: number
        unrealizedUsd: number
        realizedUsd: number
      }
      tokens: {
        token: Address
        symbol?: string
        decimals?: number
        /** Exact integer held now, unscaled. */
        balance: string
        costBasisUsd: number
        valueUsd: number | null
        unrealizedUsd: number | null
        realizedUsd: number
        /** Average cost of one whole token while the balance is positive. */
        avgCostUsd: number | null
        /** A transfer came before the token's first price and was priced at its first close. */
        estimated: boolean
        firstDay: string
      }[]
    }
  }
  /** List a wallet's liquidity positions */
  getWalletPositions: {
    method: "GET"
    path: "/v1/wallets/{address}/positions"
    pathParams: {
      address: Address
    }
    query: {
      limit?: number
    }
    body: never
    response: {
      address: Address
      count: number
      positions: {
        /** The position manager that minted the NFT. */
        manager: Address
        tokenId: string
        /** The pool's address, or its id for a pool-manager venue. */
        pool: string
        family: string
        token0: {
          address: Address
          symbol?: string
          decimals?: number
        }
        token1: {
          address: Address
          symbol?: string
          decimals?: number
        }
        /** Pips (1e-6). */
        fee: number
        tickSpacing: number
        tickLower: number
        tickUpper: number
        /** Exact integer, unscaled. */
        liquidity: string
        /** The pool's tick at `asOf`; null before the pool has a state. */
        currentTick: number | null
        inRange: boolean | null
        /** Exact integer in token0, unscaled, at the pool's current price. */
        amount0: string | null
        amount1: string | null
        /** The amounts in USD, counting a side only where its token has $1,000 of 2% depth across its pools, each worth at most 100 times that depth. Null where neither side counts. */
        valueUsd: number | null
        lastBlock: number
        /** The block the pool state is exact at. */
        asOf: number | null
      }[]
    }
  }
  /** List a wallet's trades */
  getWalletSwaps: {
    method: "GET"
    path: "/v1/wallets/{address}/swaps"
    pathParams: {
      address: Address
    }
    query: {
      /** The most trades the page carries. A value out of range reads as its nearest bound. */
      limit?: number
      /** A page's `nextBefore`, as this route wrote it. The page holds the trades older than that page, and no transaction is split between two pages. Omit it for the newest page. */
      before?: string
      /** The trades in which this token was either side, bought, sold or paid with. Native ether (the zero address) is `bad-token`. */
      token?: Address
    }
    body: never
    response: {
      address: Address
      swaps: WalletTrade[]
      source: "indexer"
      /** The cursor of the next older page, opaque. Null once the wallet's history ends. */
      nextBefore: string | null
    }
  }
  /** Link a wallet */
  linkWallet: {
    method: "POST"
    path: "/v1/me/wallets/link"
    pathParams: never
    query: never
    body: {
      /** The wallet that joins, the one the message was issued for. */
      address: Address
      /** The wallet's `personal_sign` of `message`: a plain ECDSA signature of its own key, no ERC-6492 or ERC-8010 wrapper. */
      signature: string
      /** The message the nonce route answered, exactly as the wallet signed it. It stands ten minutes and is used once. */
      message: string
      /** Show the wallet on the account's profile. A new link is hidden unless true; a merge that moves what the joining account shows must be true. */
      public?: boolean
      /** Where both accounts have a username, the one to keep, matched without case or `@`. The other is released. */
      keepUsername?: string | null
      /** Where both accounts have an X account, the handle to keep, matched without case or `@`. The other is unlinked. */
      keepX?: string | null
    }
    response: WalletLinkResponse
  }
  /** List the account's wallets */
  listAccountWallets: {
    method: "GET"
    path: "/v1/me/wallets"
    pathParams: never
    query: never
    body: never
    response: AccountWalletsResponse
  }
  /** List the account's API keys */
  listApiKeys: {
    method: "GET"
    path: "/v1/me/api-keys"
    pathParams: never
    query: never
    body: never
    response: ApiKeyList
  }
  /** List blocked wallets */
  listBlocks: {
    method: "GET"
    path: "/v1/me/blocks"
    pathParams: never
    query: {
      /** How many wallets a page holds. */
      limit?: number
      /** A page's `nextCursor`, as this route wrote it. Omit it for the newest page. */
      cursor?: string
    }
    body: never
    response: BlocksPage
  }
  /** List top creators */
  listBookCreators: {
    method: "GET"
    path: "/v1/books/creators"
    pathParams: never
    query: {
      limit?: number
    }
    body: never
    response: BooksCreatorsResponse
  }
  /** List your saved Books */
  listBookDrafts: {
    method: "GET"
    path: "/v1/me/book-drafts"
    pathParams: never
    query: never
    body: never
    response: BookDraftsResponse
  }
  /** List Books */
  listBooks: {
    method: "GET"
    path: "/v1/books"
    pathParams: never
    query: {
      /** A comma list of `raising`, `graduated`, `trading`, `frozen`, `settled` and `aborted` (cancelled); every phase but `aborted` by default. A Book waiting to arm is never listed. */
      phase?: string
      /** Default `return` where every phase asked is `trading`, `frozen` or `settled`, `progress` where `raising` alone is, else `newest`. `votes` ranks up less down votes; `value`, `bookValueWei`. */
      sort?: "return" | "progress" | "timeLeft" | "newest" | "marketCap" | "votes" | "value"
      /** `asc` by default for `timeLeft`, `desc` otherwise. */
      order?: "asc" | "desc"
      /** A name or symbol substring, or the exact address of a Book's token, vault, creator or trader. */
      q?: string
      limit?: number
      offset?: number
    }
    body: never
    response: BooksBoardResponse
  }
  /** List a Book's theses */
  listBookTheses: {
    method: "GET"
    path: "/v1/books/{token}/theses"
    pathParams: {
      /** The Book's token, which names the Book. */
      token: Address
    }
    query: {
      limit?: number
      /** A page's `nextCursor`, as it was given. */
      cursor?: string
      /** `1` lists the theses of the profiles the session's account follows alone, and needs a session. */
      following?: "0" | "1"
    }
    body: never
    response: BookThesesResponse
  }
  /** List fills */
  listFills: {
    method: "GET"
    path: "/v1/fills"
    pathParams: never
    query: {
      maker?: Address
      orderHash?: Hash
      /** 1..500, default 200. */
      limit?: number
    }
    body: never
    response: {
      /** The live orders contract. */
      contract: string | null
      /** The last block of the live orders contract whose fills are listed. */
      cursor: number
      cursors: {
        contract?: string
        cursor?: number
      }[]
      count: number
      fills: Fill[]
    }
  }
  /** List notifications */
  listNotifications: {
    method: "GET"
    path: "/v1/me/notifications"
    pathParams: never
    query: {
      /** How many notices a page holds. */
      limit?: number
      /** A page's `nextBefore`: a notice's id. The page holds the notices older than it. Omit it for the newest page. */
      before?: string
      /** `1` lists the unread notices alone. */
      unread?: "1"
    }
    body: never
    response: NoticesPage
  }
  /** List orders */
  listOrders: {
    method: "GET"
    path: "/v1/orders"
    pathParams: never
    query: {
      /** Narrow to one wallet. A session may name itself, or a Book vault it trades for; any other maker answers 403 `orders-maker-only`. */
      maker?: Address
      status?: OrderStatus
      /** 1..500, default 500. */
      limit?: number
    }
    body: never
    response: {
      count: number
      /** True when the page hit `limit`. */
      truncated: boolean
      orders: OrderRecord[]
    }
  }
  /** List people you may know */
  listSuggestedPeople: {
    method: "GET"
    path: "/v1/me/people/suggested"
    pathParams: never
    query: {
      /** How many people the answer names at the most. */
      limit?: number
    }
    body: never
    response: SuggestedPeopleResponse
  }
  /** List a token's theses */
  listTokenTheses: {
    method: "GET"
    path: "/v1/tokens/{address}/theses"
    pathParams: {
      address: Address
    }
    query: {
      limit?: number
      /** A page's `nextCursor`, as it was given. */
      cursor?: string
      /** `1` lists the theses of the profiles the session's account follows alone, and needs a session. */
      following?: "0" | "1"
    }
    body: never
    response: BookThesesResponse
  }
  /** List a wallet's followers */
  listUserFollowers: {
    method: "GET"
    path: "/v1/users/{id}/followers"
    pathParams: {
      /** An address, or a username with or without its `@`. */
      id: string
    }
    query: {
      /** Wallets a page, 1 to 100. */
      limit?: number
      /** A page's `nextCursor`. */
      cursor?: string
    }
    body: never
    response: FollowListResponse
  }
  /** List the wallets a wallet follows */
  listUserFollowing: {
    method: "GET"
    path: "/v1/users/{id}/following"
    pathParams: {
      /** An address, or a username with or without its `@`. */
      id: string
    }
    query: {
      /** Wallets a page, 1 to 100. */
      limit?: number
      /** A page's `nextCursor`. */
      cursor?: string
    }
    body: never
    response: FollowListResponse
  }
  /** List a webhook's deliveries */
  listWebhookDeliveries: {
    method: "GET"
    path: "/v1/me/webhooks/{id}/deliveries"
    pathParams: {
      /** The hook's id. */
      id: string
    }
    query: never
    body: never
    response: {
      webhook: string
      /** Mancer holds the hook's deliveries now, as `GET /v1/me/webhooks` says. */
      held: boolean
      heldReason: "secret" | "previous-secret" | "no-server-key" | null
      deliveries: WebhookDelivery[]
    }
  }
  /** List the account's webhooks */
  listWebhooks: {
    method: "GET"
    path: "/v1/me/webhooks"
    pathParams: never
    query: never
    body: never
    response: WebhookList
  }
  /** Look up wallets' identities */
  lookupUsers: {
    method: "GET"
    path: "/v1/users/lookup"
    pathParams: never
    query: {
      /** 1 to 100 addresses, separated by commas. */
      addresses: string
    }
    body: never
    response: UserLookupResponse
  }
  /** Mark notifications read */
  markNotificationsRead: {
    method: "POST"
    path: "/v1/me/notifications/read"
    pathParams: never
    query: never
    body: {
      /** Notice ids, each a number or a decimal string. */
      ids: (string | number)[]
    } | {
      /** A notice id: it and every older notice are marked. */
      through: string | number
    } | {
      all: true
    }
    response: {
      /** How many unread notices this marked. */
      marked: number
      /** The unread left, counted to 100. */
      unread: number
    }
  }
  /** Mint an API key */
  mintApiKey: {
    method: "POST"
    path: "/v1/me/api-keys"
    pathParams: never
    query: never
    body: {
      /** The key's name: 1 to 40 lowercase letters, digits and hyphens, the account's once. */
      name: string
      scopes: KeyScope[]
      /** The holder's acknowledgement that keeping issued stocks from the places they may not be traded is theirs. Kept with the key. */
      acknowledgeStocks: "Issued stocks are open to this key. Keeping them from anyone in a place where they may not be traded is my responsibility."
    }
    response: ApiKeyMinted
  }
  /** Get a stream ticket */
  postStreamTicket: {
    method: "POST"
    path: "/v1/me/stream-ticket"
    pathParams: never
    query: never
    body: never
    response: StreamTicket
  }
  /** Get the owners of transactions */
  postTransactionOwners: {
    method: "POST"
    path: "/v1/transactions/owners"
    pathParams: never
    query: never
    body: {
      txs: {
        /** The block the transaction landed in. */
        block: number
        hash: Hash
      }[]
    }
    response: {
      owners: {
        [key: string]: Address | null
      }
      /** Who made each transaction: the maker of the most of its swaps, else its owner, else the account a bundler sent it for, else its sender. */
      makers: {
        [key: string]: Address
      }
      /** Each swap's own maker, its payer, by the swap's log index. A token's own fee is nobody's swap and is left out. */
      swapMakers?: {
        [key: string]: {
          [key: string]: Address
        }
      }
      /** What a swap says beside its maker, by log index, only where it says something: `fee` (a token's own fee), `deliveredTo` (what it bought went to another wallet), `solver` (a solver's float). */
      swapNotes?: {
        [key: string]: {
          [key: string]: {
            fee?: true
            deliveredTo?: Address
            solver?: true
          }
        }
      }
      /** Each landed transaction's sender, by its hash. */
      senders?: {
        [key: string]: Address
      }
      /** What a transaction did for its owner where it was no trade, named for those that had a purpose alone. */
      purposes: {
        [key: string]: "liquidity-add" | "liquidity-remove" | "liquidity-move"
      }
    }
  }
  /** Preview a vault's pending order */
  previewBookOrder: {
    method: "POST"
    path: "/v1/books/{token}/order-preview"
    pathParams: {
      /** The Book's token, which names the Book. */
      token: Address
    }
    query: never
    body: BookOrderPreviewRequest
    response: BookOrderPreviewResponse
  }
  /** Upload a saved Book's logo */
  putBookDraftLogo: {
    method: "PUT"
    path: "/v1/books/drafts/{id}/logo"
    pathParams: {
      /** The record's `id`. */
      id: string
    }
    query: never
    body: Blob | Uint8Array
    response: BookDraftResponse
  }
  /** Upload a Book's logo */
  putBookLogo: {
    method: "PUT"
    path: "/v1/books/{token}/profile/logo"
    pathParams: {
      /** The Book's token, which names the Book. */
      token: Address
    }
    query: never
    body: Blob | Uint8Array
    response: BookProfileResponse
  }
  /** Set a Book's profile */
  putBookProfile: {
    method: "PUT"
    path: "/v1/books/{token}/profile"
    pathParams: {
      /** The Book's token, which names the Book. */
      token: Address
    }
    query: never
    body: {
      /** Plain text: 1 to 500 characters and 10 lines once trimmed, with no link (no `://`, no `www.`, no bare domain). Null clears it. */
      description?: string | null
      /** Null clears all three. A link left out stands. */
      links?: {
        /** One https link on a host of its own, never a social network's page; an http link or a bare host is written as https. Null clears it. */
        website?: string | null
        /** An x.com or twitter.com link to an account, or an @handle. The profile answers the X account the creator linked through Mancer's X login. */
        x?: string | null
        /** A t.me or telegram.me link to a name or an invite, or an @name, written `https://t.me/<path>`. Null clears it. */
        telegram?: string | null
      } | null
      /** Distinct verified tokens, issued stocks, WETH or USDG, never the Book's own token, naming one at least beyond WETH and USDG. WETH is put at the fourteenth place at the latest, within the 16. */
      targets?: Address[]
    }
    response: BookProfileResponse
  }
  /** Vote on a Book */
  putBookVote: {
    method: "PUT"
    path: "/v1/books/{token}/vote"
    pathParams: {
      /** The Book's token, which names the Book. */
      token: Address
    }
    query: never
    body: {
      side: BookVoteSide
      /** Why, in plain text: 1 to 500 characters and 5 lines once trimmed, with no link (no `://`, no `www.`, no bare domain). Null or left out for none. */
      thesis?: string | null
    }
    response: BookVoteResponse
  }
  /** Upload the profile's picture */
  putOwnAvatar: {
    method: "PUT"
    path: "/v1/me/profile/avatar"
    pathParams: never
    query: never
    body: Blob | Uint8Array
    response: OwnerProfile
  }
  /** Upload the profile's banner */
  putOwnBanner: {
    method: "PUT"
    path: "/v1/me/profile/banner"
    pathParams: never
    query: never
    body: Blob | Uint8Array
    response: OwnerProfile
  }
  /** Vote on a token */
  putTokenVote: {
    method: "PUT"
    path: "/v1/tokens/{address}/vote"
    pathParams: {
      address: Address
    }
    query: never
    body: {
      side: BookVoteSide
      /** Why, in plain text: 1 to 500 characters and 5 lines once trimmed, with no link (no `://`, no `www.`, no bare domain). Null or left out for none. */
      thesis?: string | null
    }
    response: BookVoteResponse
  }
  /** Redeem an invite code */
  redeemAppInvite: {
    method: "POST"
    path: "/v1/me/app-access/redeem"
    pathParams: never
    query: never
    body: {
      /** Eight letters and digits, shown XXXX-XXXX, matched without case, spaces or dashes. */
      code: string
    }
    response: AppAccessResponse
  }
  /** Refresh an order from the chain */
  refreshOrder: {
    method: "POST"
    path: "/v1/orders/{hash}/refreshes"
    pathParams: {
      hash: Hash
    }
    query: never
    body: never
    response: OrderRecord
  }
  /** Refresh the profile from OpenSea */
  refreshOwnProfile: {
    method: "POST"
    path: "/v1/me/profile/refresh"
    pathParams: never
    query: never
    body: never
    response: OwnerProfileRefreshed
  }
  /** Read the linked X account again */
  refreshXLink: {
    method: "POST"
    path: "/auth/x/refresh"
    pathParams: never
    query: never
    body: never
    response: OwnerProfile
  }
  /** Register a phone for pushes */
  registerPushDevice: {
    method: "POST"
    path: "/v1/me/push-devices"
    pathParams: never
    query: never
    body: {
      /** The phone's Expo push token, as Expo hands it out. */
      token: string
      platform: "ios" | "android"
    }
    response: {
      registered: true
    }
  }
  /** Release the username */
  releaseUsername: {
    method: "DELETE"
    path: "/v1/me/username"
    pathParams: never
    query: never
    body: never
    response: {
      released: UsernameReleasedName
    }
  }
  /** Remove a phone */
  removePushDevice: {
    method: "DELETE"
    path: "/v1/me/push-devices"
    pathParams: never
    query: never
    body: {
      /** The phone's Expo push token. */
      token: string
    }
    response: {
      /** False where the account had no such phone. */
      removed: boolean
    }
  }
  /** Report a thesis */
  reportBookThesis: {
    method: "POST"
    path: "/v1/books/{token}/theses/{voter}/report"
    pathParams: {
      /** The Book's token, which names the Book. */
      token: Address
      voter: Address
    }
    query: never
    body: {
      reason: "impersonation" | "scam" | "spam" | "offensive" | "other"
      details?: string | null
    }
    response: BookThesisReportResponse
  }
  /** Report a profile */
  reportProfile: {
    method: "POST"
    path: "/v1/users/{id}/report"
    pathParams: {
      /** An address, or a username with or without its `@`. */
      id: string
    }
    query: never
    body: {
      reason: "impersonation" | "scam" | "spam" | "offensive" | "other"
      details?: string
    }
    response: ProfileReportResponse
  }
  /** Report a token thesis */
  reportTokenThesis: {
    method: "POST"
    path: "/v1/tokens/{address}/theses/{voter}/report"
    pathParams: {
      address: Address
      voter: Address
    }
    query: never
    body: {
      reason: "impersonation" | "scam" | "spam" | "offensive" | "other"
      details?: string | null
    }
    response: BookThesisReportResponse
  }
  /** Resolve addresses to tokens */
  resolveTokens: {
    method: "POST"
    path: "/v1/tokens/resolve"
    pathParams: never
    query: never
    body: {
      addresses: Address[]
    }
    response: {
      count: number
      source: "indexer"
      tokens: Token[]
    }
  }
  /** Redeliver an event */
  retryWebhookDelivery: {
    method: "POST"
    path: "/v1/me/webhooks/{id}/deliveries/{seq}/retry"
    pathParams: {
      /** The hook's id. */
      id: string
      /** The event's place in the account's log. */
      seq: string
    }
    query: never
    body: never
    response: (WebhookTry & {
      delivery?: WebhookDelivery | null
    })
  }
  /** End every session */
  revokeSessions: {
    method: "POST"
    path: "/v1/me/sessions/revoke"
    pathParams: never
    query: never
    body: {
      /** `account` takes a session of the account's primary wallet. */
      scope?: "account" | "wallet"
    }
    response: SessionsRevoked
  }
  /** Rotate a webhook's secret */
  rotateWebhookSecret: {
    method: "POST"
    path: "/v1/me/webhooks/{id}/rotate"
    pathParams: {
      /** The hook's id. */
      id: string
    }
    query: never
    body: {
      /** How long the old secret still signs. 0 ends it at once. */
      keepPreviousSeconds?: number
    }
    response: {
      webhook: Webhook
      /** The new secret. Keep it on your server; no other answer carries it. */
      secret: string
      /** Until when the old secret still signs, or null. */
      previousSecretUntil: string | null
    }
  }
  /** Search tokens */
  searchTokens: {
    method: "GET"
    path: "/v1/tokens"
    pathParams: never
    query: {
      /** Symbol, name, or address. Up to 64 characters. */
      q?: string
    }
    body: never
    response: {
      count: number
      source: "indexer"
      tokens: Token[]
    }
  }
  /** Search tokens for a chart setup */
  searchTokenSetups: {
    method: "GET"
    path: "/v1/tokens/setups"
    pathParams: never
    query: {
      /** The setup: a pullback into a Fib retracement band, a close above a prior 20-candle closing high and a retest of it, or a reclaim of a simple moving average. */
      setup?: "fib-pullback" | "breakout-retest" | "ma-reclaim"
      /** Each candle's length in seconds. */
      timeframe?: 900 | 3600 | 14400 | 43200 | 86400
      /** How many completed candles are read. By default 24 at a day, 48 at 12 hours and 96 at the shorter timeframes. */
      lookbackBars?: number
      /** The least 24-hour volume in dollars a token needs. */
      minVolume24hUsd?: number
      /** Fib setups: the least rise from the swing low to the swing high, in percent. */
      minRallyPct?: number
      /** Fib setups: the band's shallow edge, in percent of the rise given back. It must be under `retracementMax`. */
      retracementMin?: number
      /** Fib setups: the band's deep edge, in percent of the rise given back. */
      retracementMax?: number
      /** In percent: the band around a breakout's prior high, how far above its average a reclaim may close, and how far past the Fib band a `base` may stand. */
      tolerancePct?: number
      /** `ma-reclaim`: the moving average's length in candles. `lookbackBars` must be at least this plus 2. */
      maPeriod?: number
      /** `true` keeps verified tokens and issued stocks alone. */
      verifiedOnly?: "true" | "false"
      /** `fib-pullback`: the stage to find. `in-zone` is the latest close inside the band; `base`, `higher-lows`, `breakout` and `bounce` follow a visit to it. */
      fibStage?: "in-zone" | "base" | "higher-lows" | "breakout" | "bounce"
      /** Every Fib stage but `in-zone`: the most candles since the band or the level was first touched. */
      maxBarsSinceTouch?: number
      /** `base`: how many latest closes make the base. */
      baseBars?: number
      /** `base`: the widest the base's closes may span, in percent of the lowest of them. */
      baseMaxRangePct?: number
      /** `higher-lows`, `breakout` and `fibConfluence`: the strictly higher closes a pivot low needs on each side. */
      pivotBars?: number
      /** `higher-lows` and `breakout`: how many rises between confirmed pivot lows. */
      higherLowCount?: number
      /** `higher-lows` and `breakout`: the least each pivot low rises over the one before, in percent. */
      minHigherLowPct?: number
      /** `breakout`: the candles before it whose highest close the breakout must clear. */
      breakoutLookback?: number
      /** `breakout`: how far above that closing high the breakout must close, in percent. */
      breakoutBufferPct?: number
      /** `breakout`: the candles before it whose mean volume is the baseline. */
      volumeLookback?: number
      /** `breakout`: the least the breakout candle's volume may be over that baseline. */
      minRelativeVolume?: number
      /** Fib setups: `true` also requires a second band, from an earlier confirmed low to the same high, within `confluenceTolerancePct`. Not with `bounce`. */
      fibConfluence?: "true" | "false"
      /** The most gap between the two bands, in percent of the first band's midpoint. */
      confluenceTolerancePct?: number
      /** One token alone, and the answer carries `inspection`. Empty for the ranked tokens. */
      tokenAddress?: string
      /** `bounce`: read the swing and the touch by the candles' wicks or by their closes. */
      bounceBasis?: "wick" | "close"
      /** `bounce`: the Fib level, in percent of the rise given back. */
      bounceLevelPct?: number
      /** `bounce`: how near the level the touch must be, in percent of the level's price. */
      bounceTolerancePct?: number
      /** `bounce`: how far above the level a confirming close must be, in percent. */
      minBouncePct?: number
      /** `bounce`: how many latest closes must confirm. */
      bounceConfirmBars?: number
    }
    body: never
    response: TokenSetupsResponse
  }
  /** Search profiles */
  searchUsers: {
    method: "GET"
    path: "/v1/users"
    pathParams: never
    query: {
      /** A username, an X handle or an address. One leading `@` is dropped, and the rest is read lowercase, up to 64 characters. */
      q: string
      /** How many rows, 1 to 20. A value out of range reads as its nearest bound. */
      limit?: number
    }
    body: never
    response: {
      users: UserSearchRow[]
    }
  }
  /** Sign settlement sales */
  signBookLiquidationQuotes: {
    method: "POST"
    path: "/v1/books/{token}/liquidation-quotes"
    pathParams: {
      /** The Book's token, which names the Book. */
      token: Address
    }
    query: {
      /** `1` adds `ready`: the answer's approvals and transactions as ready-to-sign steps, each simulated from the wallet at the head. Without it, the answer carries no `ready`. It also pays a `steps` bucket. */
      steps?: "1"
    }
    body: BookLiquidationQuotesRequest
    response: BookLiquidationQuotesResponse
  }
  /** Sign a vault order grant */
  signBookOrderGrant: {
    method: "POST"
    path: "/v1/books/{token}/order-grant"
    pathParams: {
      /** The Book's token, which names the Book. */
      token: Address
    }
    query: never
    body: BookOrderGrantRequest
    response: BookOrderGrantResponse
  }
  /** Sign a vault quote */
  signBookVaultQuote: {
    method: "POST"
    path: "/v1/books/{token}/vault-quote"
    pathParams: {
      /** The Book's token, which names the Book. */
      token: Address
    }
    query: never
    body: BookVaultQuoteRequest
    response: BookVaultQuoteResponse
  }
  /** Start an X link */
  startXLink: {
    method: "POST"
    path: "/auth/x/start"
    pathParams: never
    query: never
    body: {
      /** `app`: the ticket comes back to the phone app. `device`: the person confirms on Mancer's page after X, and the bot finishes with its device code. Leave it out for the website. */
      return?: "app" | "device"
    }
    response: XLinkStart
  }
  /** Submit a signed order */
  submitOrder: {
    method: "POST"
    path: "/v1/orders"
    pathParams: never
    query: never
    body: {
      order: Order
      /** The maker's EIP-712 signature over `order`. EOAs, ERC-1271 accounts, and EIP-7702 delegated EOAs are accepted. */
      signature: string
      /** The orders contract the signature binds. Recommended; defaults to the current contract. */
      contract?: Address
      /** Accepted only as an echo of the signed `order.ocoGroup`. */
      ocoGroup?: string
    }
    response: {
      hash?: Hash
      existing?: true
    } | {
      hash: Hash
      existing: false
    }
  }
  /** Send a test delivery */
  testWebhook: {
    method: "POST"
    path: "/v1/me/webhooks/{id}/test"
    pathParams: {
      /** The hook's id. */
      id: string
    }
    query: never
    body: never
    response: WebhookTry
  }
  /** Turn off a wallet's trade alerts */
  turnOffTradeAlerts: {
    method: "DELETE"
    path: "/v1/me/following/{id}/alerts"
    pathParams: {
      /** An address, or a username with or without its `@`. */
      id: string
    }
    query: never
    body: never
    response: FollowState
  }
  /** Turn on a wallet's trade alerts */
  turnOnTradeAlerts: {
    method: "PUT"
    path: "/v1/me/following/{id}/alerts"
    pathParams: {
      /** An address, or a username with or without its `@`. */
      id: string
    }
    query: never
    body: never
    response: FollowState
  }
  /** Unblock a wallet */
  unblockWallet: {
    method: "DELETE"
    path: "/v1/me/blocks/{id}"
    pathParams: {
      /** An address, or a username with or without its `@`. */
      id: string
    }
    query: never
    body: never
    response: FollowState
  }
  /** Unfollow a wallet */
  unfollowWallet: {
    method: "DELETE"
    path: "/v1/me/following/{id}"
    pathParams: {
      /** An address, or a username with or without its `@`. */
      id: string
    }
    query: never
    body: never
    response: FollowState
  }
  /** Unlink a wallet */
  unlinkAccountWallet: {
    method: "DELETE"
    path: "/v1/me/wallets/{address}"
    pathParams: {
      /** A linked wallet of the account. */
      address: Address
    }
    query: never
    body: never
    response: AccountWalletsResponse
  }
  /** Unlink X */
  unlinkX: {
    method: "DELETE"
    path: "/auth/x"
    pathParams: never
    query: never
    body: never
    response: OwnerProfile
  }
  /** Attach a saved Book's open */
  updateBookDraft: {
    method: "PATCH"
    path: "/v1/books/drafts/{id}"
    pathParams: {
      /** The record's `id`. */
      id: string
    }
    query: never
    body: {
      /** The open's transaction hash. */
      txHash: Hash
    }
    response: BookDraftResponse
  }
  /** Change or pause a webhook */
  updateWebhook: {
    method: "PATCH"
    path: "/v1/me/webhooks/{id}"
    pathParams: {
      /** The hook's id. */
      id: string
    }
    query: never
    body: {
      /** The kinds to deliver, as at the hook's creation. Dropping the kind of the event the hook waits on passes that event over at once. */
      events?: string[]
      active?: boolean
    }
    response: {
      webhook: Webhook
    }
  }
  /** Sign in with a wallet */
  verifySignIn: {
    method: "POST"
    path: "/auth/verify"
    pathParams: never
    query: never
    body: {
      address: Address
      signature: Hex
      nonce: string
    }
    response: {
      /** The session token, an HS256 JWT. It lasts seven days from its `iat` (read `exp`), is never renewed, and its `iat` may sit a second ahead of your clock. */
      token: string
      /** Whether this sign-in made the account. */
      created: boolean
      /** The account the wallet signed in to: its own, or the one that holds it as a linked wallet. */
      account: Address
    }
  }
}

export type OperationId = keyof Operations

/** Every operation's method, path and credential at run time: `none` (the route reads none), `optional` or `required`. */
export const OPERATIONS = {
  blockWallet: { method: "PUT", path: "/v1/me/blocks/{id}", auth: "required" },
  cancelAccountDeletion: { method: "DELETE", path: "/v1/me/account/deletion", auth: "required" },
  cancelOrders: { method: "POST", path: "/v1/orders/cancellations", auth: "optional" },
  changeApiKey: { method: "PATCH", path: "/v1/me/api-keys/{name}", auth: "required" },
  checkAppAccess: { method: "POST", path: "/v1/me/app-access/check", auth: "required" },
  checkUsername: { method: "GET", path: "/v1/usernames/{name}", auth: "required" },
  claimUsername: { method: "PUT", path: "/v1/me/username", auth: "required" },
  confirmXLink: { method: "POST", path: "/auth/x/confirm", auth: "required" },
  countUnreadNotifications: { method: "GET", path: "/v1/me/notifications/unread", auth: "required" },
  createBookDraft: { method: "POST", path: "/v1/books/drafts", auth: "required" },
  createWalletLinkMessage: { method: "POST", path: "/v1/me/wallets/link/nonce", auth: "required" },
  createWebhook: { method: "POST", path: "/v1/me/webhooks", auth: "required" },
  deleteAccount: { method: "DELETE", path: "/v1/me/account", auth: "required" },
  deleteApiKey: { method: "DELETE", path: "/v1/me/api-keys/{name}", auth: "required" },
  deleteBookDraft: { method: "DELETE", path: "/v1/books/drafts/{id}", auth: "required" },
  deleteBookLogo: { method: "DELETE", path: "/v1/books/{token}/profile/logo", auth: "required" },
  deleteBookVote: { method: "DELETE", path: "/v1/books/{token}/vote", auth: "required" },
  deleteOwnAvatar: { method: "DELETE", path: "/v1/me/profile/avatar", auth: "required" },
  deleteOwnBanner: { method: "DELETE", path: "/v1/me/profile/banner", auth: "required" },
  deleteOwnProfile: { method: "DELETE", path: "/v1/me/profile", auth: "required" },
  deleteTokenVote: { method: "DELETE", path: "/v1/tokens/{address}/vote", auth: "required" },
  deleteWebhook: { method: "DELETE", path: "/v1/me/webhooks/{id}", auth: "required" },
  discoverTokens: { method: "GET", path: "/v1/tokens/discover", auth: "none" },
  editAccountWallet: { method: "PATCH", path: "/v1/me/wallets/{address}", auth: "required" },
  editOwnProfile: { method: "PATCH", path: "/v1/me/profile", auth: "required" },
  followWallet: { method: "PUT", path: "/v1/me/following/{id}", auth: "required" },
  getAccountEvents: { method: "GET", path: "/v1/me/events", auth: "required" },
  getAppAccess: { method: "GET", path: "/v1/me/app-access", auth: "required" },
  getAuthMe: { method: "GET", path: "/auth/me", auth: "required" },
  getAuthNonce: { method: "GET", path: "/auth/nonce", auth: "none" },
  getBook: { method: "GET", path: "/v1/books/{token}", auth: "optional" },
  getBookBuys: { method: "GET", path: "/v1/books/{token}/buys", auth: "optional" },
  getBookDraftOpenSteps: { method: "POST", path: "/v1/books/drafts/{id}/steps", auth: "required" },
  getBookHistory: { method: "GET", path: "/v1/books/{token}/history", auth: "optional" },
  getBookLiquidation: { method: "GET", path: "/v1/books/{token}/liquidation", auth: "optional" },
  getBookLogo: { method: "GET", path: "/v1/books/{token}/logo", auth: "optional" },
  getBookNftMarket: { method: "GET", path: "/v1/books/{token}/nft-market", auth: "optional" },
  getBookNftMoves: { method: "GET", path: "/v1/books/{token}/nft-market/moves", auth: "optional" },
  getBookNftQuote: { method: "GET", path: "/v1/books/{token}/nft-market/quote", auth: "optional" },
  getBookPnl: { method: "GET", path: "/v1/books/{token}/pnl", auth: "optional" },
  getBookPolicy: { method: "GET", path: "/v1/books/{token}/policy", auth: "required" },
  getBookRaiseQuote: { method: "GET", path: "/v1/books/{token}/raise-quote", auth: "optional" },
  getBooksActivity: { method: "GET", path: "/v1/books/activity", auth: "optional" },
  getBooksDeployments: { method: "GET", path: "/v1/books/deployments", auth: "optional" },
  getBooksStats: { method: "GET", path: "/v1/books/stats", auth: "optional" },
  getBookSteps: { method: "POST", path: "/v1/books/{token}/steps", auth: "optional" },
  getBooksTraders: { method: "GET", path: "/v1/books/traders", auth: "optional" },
  getBookTraderHistory: { method: "GET", path: "/v1/books/traders/{address}/history", auth: "optional" },
  getBookTraderRecord: { method: "GET", path: "/v1/books/traders/{address}", auth: "optional" },
  getBookTrades: { method: "GET", path: "/v1/books/{token}/trades", auth: "optional" },
  getContracts: { method: "GET", path: "/v1/contracts", auth: "none" },
  getExecutorEconomics: { method: "GET", path: "/v1/executor/economics", auth: "none" },
  getFollowingFeed: { method: "GET", path: "/v1/me/feed", auth: "required" },
  getFx: { method: "GET", path: "/v1/fx", auth: "none" },
  getGeo: { method: "GET", path: "/v1/geo", auth: "none" },
  getHealth: { method: "GET", path: "/health", auth: "none" },
  getLimits: { method: "GET", path: "/v1/limits", auth: "optional" },
  getMap: { method: "GET", path: "/v1/map", auth: "none" },
  getMarketStatus: { method: "GET", path: "/v1/market", auth: "none" },
  getNft: { method: "GET", path: "/v1/nfts/{collection}/{tokenId}", auth: "none" },
  getNftCollection: { method: "GET", path: "/v1/nft-collections/{address}", auth: "none" },
  getNftCollectionBanner: { method: "GET", path: "/v1/nft-collections/{address}/banner", auth: "none" },
  getNftCollectionImage: { method: "GET", path: "/v1/nft-collections/{address}/image", auth: "none" },
  getNftImage: { method: "GET", path: "/v1/nfts/{collection}/{tokenId}/image", auth: "none" },
  getOrder: { method: "GET", path: "/v1/orders/{hash}", auth: "required" },
  getOrderCancelSteps: { method: "POST", path: "/v1/orders/{hash}/cancel-steps", auth: "optional" },
  getOrderFee: { method: "GET", path: "/v1/order-fee", auth: "none" },
  getOrdersCancelAllSteps: { method: "POST", path: "/v1/orders/cancel-all-steps", auth: "optional" },
  getOrderSetup: { method: "GET", path: "/v1/orders/setup", auth: "optional" },
  getOwnProfile: { method: "GET", path: "/v1/me/profile", auth: "required" },
  getPoolCandles: { method: "GET", path: "/v1/pools/{pool}/candles", auth: "none" },
  getPoolDepth: { method: "GET", path: "/v1/pools/{uid}/depth", auth: "none" },
  getPrices: { method: "GET", path: "/v1/prices", auth: "none" },
  getQuote: { method: "GET", path: "/v1/quote", auth: "optional" },
  getRoutedStats: { method: "GET", path: "/v1/stats/routed", auth: "none" },
  getStream: { method: "GET", path: "/v1/stream", auth: "none" },
  getSwapPulse: { method: "GET", path: "/v1/swaps/pulse", auth: "none" },
  getSwaps: { method: "GET", path: "/v1/swaps", auth: "none" },
  getToken: { method: "GET", path: "/v1/tokens/{address}", auth: "none" },
  getTokenCandles: { method: "GET", path: "/v1/tokens/{address}/candles", auth: "none" },
  getTokenHolders: { method: "GET", path: "/v1/tokens/{address}/holders", auth: "none" },
  getTokenHoldersPnl: { method: "GET", path: "/v1/tokens/{address}/holders/pnl", auth: "none" },
  getTokenImage: { method: "GET", path: "/v1/tokens/{address}/image", auth: "none" },
  getTokenKolMarks: { method: "GET", path: "/v1/tokens/{address}/kol-marks", auth: "none" },
  getTokenStats: { method: "GET", path: "/v1/tokens/{address}/stats", auth: "none" },
  getTokenSummary: { method: "GET", path: "/v1/tokens/{address}/summary", auth: "none" },
  getTokenSwaps: { method: "GET", path: "/v1/tokens/{address}/swaps", auth: "none" },
  getTokenTrader: { method: "GET", path: "/v1/tokens/{address}/traders/{wallet}", auth: "none" },
  getTokenTraders: { method: "GET", path: "/v1/tokens/{address}/traders", auth: "none" },
  getTokenVotes: { method: "GET", path: "/v1/tokens/{address}/votes", auth: "none" },
  getTokenWindows: { method: "GET", path: "/v1/tokens/{address}/windows", auth: "none" },
  getTransaction: { method: "GET", path: "/v1/transactions/{hash}", auth: "none" },
  getTransferSteps: { method: "POST", path: "/v1/transfers/steps", auth: "optional" },
  getUser: { method: "GET", path: "/v1/users/{id}", auth: "optional" },
  getUserAvatar: { method: "GET", path: "/v1/users/{address}/avatar", auth: "none" },
  getUserBanner: { method: "GET", path: "/v1/users/{address}/banner", auth: "none" },
  getUserXAvatar: { method: "GET", path: "/v1/users/{address}/x-avatar", auth: "none" },
  getVenueFactories: { method: "GET", path: "/v1/venues/factories", auth: "none" },
  getWalletBalances: { method: "GET", path: "/v1/wallets/{address}/balances", auth: "none" },
  getWalletBooks: { method: "GET", path: "/v1/wallets/{address}/books", auth: "optional" },
  getWalletCollectibles: { method: "GET", path: "/v1/wallets/{address}/collectibles", auth: "none" },
  getWalletHistory: { method: "GET", path: "/v1/wallets/{address}/history", auth: "none" },
  getWalletNftActivity: { method: "GET", path: "/v1/wallets/{address}/nft-activity", auth: "none" },
  getWalletNfts: { method: "GET", path: "/v1/wallets/{address}/nfts/{collection}", auth: "none" },
  getWalletPnl: { method: "GET", path: "/v1/wallets/{address}/pnl", auth: "none" },
  getWalletPositions: { method: "GET", path: "/v1/wallets/{address}/positions", auth: "none" },
  getWalletSwaps: { method: "GET", path: "/v1/wallets/{address}/swaps", auth: "none" },
  linkWallet: { method: "POST", path: "/v1/me/wallets/link", auth: "required" },
  listAccountWallets: { method: "GET", path: "/v1/me/wallets", auth: "required" },
  listApiKeys: { method: "GET", path: "/v1/me/api-keys", auth: "required" },
  listBlocks: { method: "GET", path: "/v1/me/blocks", auth: "required" },
  listBookCreators: { method: "GET", path: "/v1/books/creators", auth: "optional" },
  listBookDrafts: { method: "GET", path: "/v1/me/book-drafts", auth: "required" },
  listBooks: { method: "GET", path: "/v1/books", auth: "optional" },
  listBookTheses: { method: "GET", path: "/v1/books/{token}/theses", auth: "optional" },
  listFills: { method: "GET", path: "/v1/fills", auth: "none" },
  listNotifications: { method: "GET", path: "/v1/me/notifications", auth: "required" },
  listOrders: { method: "GET", path: "/v1/orders", auth: "required" },
  listSuggestedPeople: { method: "GET", path: "/v1/me/people/suggested", auth: "required" },
  listTokenTheses: { method: "GET", path: "/v1/tokens/{address}/theses", auth: "optional" },
  listUserFollowers: { method: "GET", path: "/v1/users/{id}/followers", auth: "optional" },
  listUserFollowing: { method: "GET", path: "/v1/users/{id}/following", auth: "optional" },
  listWebhookDeliveries: { method: "GET", path: "/v1/me/webhooks/{id}/deliveries", auth: "required" },
  listWebhooks: { method: "GET", path: "/v1/me/webhooks", auth: "required" },
  lookupUsers: { method: "GET", path: "/v1/users/lookup", auth: "none" },
  markNotificationsRead: { method: "POST", path: "/v1/me/notifications/read", auth: "required" },
  mintApiKey: { method: "POST", path: "/v1/me/api-keys", auth: "required" },
  postStreamTicket: { method: "POST", path: "/v1/me/stream-ticket", auth: "required" },
  postTransactionOwners: { method: "POST", path: "/v1/transactions/owners", auth: "none" },
  previewBookOrder: { method: "POST", path: "/v1/books/{token}/order-preview", auth: "required" },
  putBookDraftLogo: { method: "PUT", path: "/v1/books/drafts/{id}/logo", auth: "required" },
  putBookLogo: { method: "PUT", path: "/v1/books/{token}/profile/logo", auth: "required" },
  putBookProfile: { method: "PUT", path: "/v1/books/{token}/profile", auth: "required" },
  putBookVote: { method: "PUT", path: "/v1/books/{token}/vote", auth: "required" },
  putOwnAvatar: { method: "PUT", path: "/v1/me/profile/avatar", auth: "required" },
  putOwnBanner: { method: "PUT", path: "/v1/me/profile/banner", auth: "required" },
  putTokenVote: { method: "PUT", path: "/v1/tokens/{address}/vote", auth: "required" },
  redeemAppInvite: { method: "POST", path: "/v1/me/app-access/redeem", auth: "required" },
  refreshOrder: { method: "POST", path: "/v1/orders/{hash}/refreshes", auth: "required" },
  refreshOwnProfile: { method: "POST", path: "/v1/me/profile/refresh", auth: "required" },
  refreshXLink: { method: "POST", path: "/auth/x/refresh", auth: "required" },
  registerPushDevice: { method: "POST", path: "/v1/me/push-devices", auth: "required" },
  releaseUsername: { method: "DELETE", path: "/v1/me/username", auth: "required" },
  removePushDevice: { method: "DELETE", path: "/v1/me/push-devices", auth: "required" },
  reportBookThesis: { method: "POST", path: "/v1/books/{token}/theses/{voter}/report", auth: "required" },
  reportProfile: { method: "POST", path: "/v1/users/{id}/report", auth: "required" },
  reportTokenThesis: { method: "POST", path: "/v1/tokens/{address}/theses/{voter}/report", auth: "required" },
  resolveTokens: { method: "POST", path: "/v1/tokens/resolve", auth: "none" },
  retryWebhookDelivery: { method: "POST", path: "/v1/me/webhooks/{id}/deliveries/{seq}/retry", auth: "required" },
  revokeSessions: { method: "POST", path: "/v1/me/sessions/revoke", auth: "required" },
  rotateWebhookSecret: { method: "POST", path: "/v1/me/webhooks/{id}/rotate", auth: "required" },
  searchTokens: { method: "GET", path: "/v1/tokens", auth: "none" },
  searchTokenSetups: { method: "GET", path: "/v1/tokens/setups", auth: "none" },
  searchUsers: { method: "GET", path: "/v1/users", auth: "none" },
  signBookLiquidationQuotes: { method: "POST", path: "/v1/books/{token}/liquidation-quotes", auth: "required" },
  signBookOrderGrant: { method: "POST", path: "/v1/books/{token}/order-grant", auth: "required" },
  signBookVaultQuote: { method: "POST", path: "/v1/books/{token}/vault-quote", auth: "required" },
  startXLink: { method: "POST", path: "/auth/x/start", auth: "required" },
  submitOrder: { method: "POST", path: "/v1/orders", auth: "optional" },
  testWebhook: { method: "POST", path: "/v1/me/webhooks/{id}/test", auth: "required" },
  turnOffTradeAlerts: { method: "DELETE", path: "/v1/me/following/{id}/alerts", auth: "required" },
  turnOnTradeAlerts: { method: "PUT", path: "/v1/me/following/{id}/alerts", auth: "required" },
  unblockWallet: { method: "DELETE", path: "/v1/me/blocks/{id}", auth: "required" },
  unfollowWallet: { method: "DELETE", path: "/v1/me/following/{id}", auth: "required" },
  unlinkAccountWallet: { method: "DELETE", path: "/v1/me/wallets/{address}", auth: "required" },
  unlinkX: { method: "DELETE", path: "/auth/x", auth: "required" },
  updateBookDraft: { method: "PATCH", path: "/v1/books/drafts/{id}", auth: "required" },
  updateWebhook: { method: "PATCH", path: "/v1/me/webhooks/{id}", auth: "required" },
  verifySignIn: { method: "POST", path: "/auth/verify", auth: "none" },
} as const satisfies Record<OperationId, { method: string; path: string; auth: 'none' | 'optional' | 'required' }>
