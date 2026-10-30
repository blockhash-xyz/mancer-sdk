/**
 * Errors as values a bot can act on. Every answer of Mancer's API that is not a success is one envelope,
 * `{ error, code, retryable, retryAfterSeconds?, detail? }`: `MancerError` carries it whole, with the request's id and
 * the rate bucket nearest its end. `MancerCheckError` is the SDK's own refusal: a build, a step or an order that is not
 * what was asked for, refused before anything is signed.
 */

/** The rate bucket nearest its end, read from an answer's `RateLimit-Policy` and `RateLimit` headers. */
export interface RateLimitInfo {
  /** The bucket's name, as `GET /v1/limits` lists it. */
  bucket: string
  /** Requests the bucket holds when full (`q`). */
  burst: number | null
  /** Seconds the bucket takes to refill from empty (`w`). */
  windowSeconds: number | null
  /** Requests left at once (`r`). */
  remaining: number | null
  /** Seconds until the bucket is full again (`t`). */
  resetSeconds: number | null
}

/** The SDK's own codes, for answers that carry no envelope: no answer at all, or one that is not JSON. */
export const SDK_ERROR_CODES = {
  network: 'network-error',
  notJson: 'not-json',
  timeout: 'request-timeout',
} as const

export class MancerError extends Error {
  /** The HTTP status; 0 where no answer arrived. */
  readonly status: number
  /** The envelope's code (https://docs.mancer.xyz/api/guides/errors lists every one), or one of `SDK_ERROR_CODES`. */
  readonly code: string
  /** Whether the same request may succeed if sent again, as the API says it. */
  readonly retryable: boolean
  /** How long to wait first, from the envelope or the `Retry-After` header; null where neither names one. */
  readonly retryAfterSeconds: number | null
  readonly detail: Record<string, unknown> | null
  /** The answer's `X-Request-Id`: name it when you write to support. */
  readonly requestId: string | null
  readonly rateLimit: RateLimitInfo | null
  /** The method and path asked, with no query. */
  readonly request: string
  /** The whole envelope, as it arrived. */
  readonly body: unknown

  constructor(init: {
    status: number
    code: string
    message: string
    retryable: boolean
    retryAfterSeconds?: number | null
    detail?: Record<string, unknown> | null
    requestId?: string | null
    rateLimit?: RateLimitInfo | null
    request: string
    body?: unknown
  }) {
    super(`${init.request}: ${init.status ? `${init.status} ` : ''}${init.code}: ${init.message}`)
    this.name = 'MancerError'
    this.status = init.status
    this.code = init.code
    this.retryable = init.retryable
    this.retryAfterSeconds = init.retryAfterSeconds ?? null
    this.detail = init.detail ?? null
    this.requestId = init.requestId ?? null
    this.rateLimit = init.rateLimit ?? null
    this.request = init.request
    this.body = init.body ?? null
  }
}

/** A refusal of the SDK's own: what Mancer answered is not what was asked for, so nothing was signed or sent. */
export class MancerCheckError extends Error {
  /** What was checked: `swap`, `approval`, `order`, `transfer`, `cancel`, `book`, `sign-in`, `contracts`, `simulation`. */
  readonly check: string
  /** The step refused, from 0, where the refusal is of one step. */
  readonly step: number | null
  /** The first field that is not what was asked for, in a few words. */
  readonly reason: string

  constructor(check: string, reason: string, step: number | null = null) {
    super(`${check}${step === null ? '' : ` step ${step}`} refused before signing: ${reason}`)
    this.name = 'MancerCheckError'
    this.check = check
    this.step = step
    this.reason = reason
  }
}

/** Whether an error says the same request may succeed when sent again. Only Mancer's own word counts. */
export function isRetryable(e: unknown): e is MancerError {
  return e instanceof MancerError && e.retryable
}

export interface RetryOptions {
  /** Sends at the most, the first included. Default 3. */
  tries?: number
  /** The longest the helper waits before one retry, in seconds; an answer that asks for longer is thrown. Default 30. */
  maxWaitSeconds?: number
  /** The wait where a retryable answer names none, in seconds, doubled each time. Default 1. */
  baseWaitSeconds?: number
  /** Told of each retry before its wait. */
  onRetry?: (e: MancerError, attempt: number, waitSeconds: number) => void
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>
}

const sleepFor = (ms: number) => new Promise<void>((done) => setTimeout(done, ms))

/**
 * Runs `work`, and runs it again only where it threw a `MancerError` that says `retryable`, after the wait the answer
 * named (`retryAfterSeconds` or `Retry-After`). Every other error, and the last retryable one, is thrown as it came.
 */
export async function withRetry<T>(work: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const tries = Math.max(1, options.tries ?? 3)
  const most = options.maxWaitSeconds ?? 30
  const base = options.baseWaitSeconds ?? 1
  const sleep = options.sleep ?? sleepFor
  for (let attempt = 1; ; attempt++) {
    try {
      return await work()
    } catch (e) {
      if (!isRetryable(e) || attempt >= tries) throw e
      const wait = e.retryAfterSeconds ?? base * 2 ** (attempt - 1)
      if (wait > most) throw e
      options.onRetry?.(e, attempt, wait)
      await sleep(wait * 1000)
    }
  }
}

/** The bucket an answer's headers name, or null where they name none. */
export function readRateLimit(headers: Headers): RateLimitInfo | null {
  const policy = headers.get('ratelimit-policy')
  const now = headers.get('ratelimit')
  if (!policy && !now) return null
  const param = (text: string | null, name: string): number | null => {
    const m = text ? new RegExp(`;\\s*${name}=(\\d+)`).exec(text) : null
    return m ? Number(m[1]) : null
  }
  const bucket = /^\s*"([^"]+)"/.exec(policy ?? now ?? '')?.[1] ?? ''
  return {
    bucket,
    burst: param(policy, 'q'),
    windowSeconds: param(policy, 'w'),
    remaining: param(now, 'r'),
    resetSeconds: param(now, 't'),
  }
}
