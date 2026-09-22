/**
 * How a browser request fails, and whether to try again.
 *
 * Discovery finding 7: the client parsed JSON before it looked at the status,
 * so an HTML challenge page or an overload page became "Invalid JSON
 * response" — a generic error that the default query policy then retried
 * three times, on a deterministic schedule, in step with every other reader
 * who hit the same outage. `Retry-After` was thrown away. There was no
 * deadline, so a stalled response held a request open indefinitely.
 *
 * This module is the one place those rules live:
 *
 *  - **Status first.** A response is classified from its status and headers
 *    before its body is trusted. The body is read only to find a message,
 *    and at most `MAX_DETAIL` characters of it are kept — a challenge page is
 *    never echoed into the UI or a log.
 *  - **Categories, not message text.** `network`, `timeout`, `aborted`,
 *    `http`, `challenge`, `malformed`. Callers branch on these (and on
 *    `status`), never on whether a message happens to contain "401".
 *  - **Finite, staggered retries.** Equal-jitter exponential backoff, a
 *    maximum attempt count and a maximum elapsed time. 401/403, challenge
 *    pages, cancellations and malformed successes are never retried
 *    automatically. A valid `Retry-After` is honoured when it fits the
 *    budget; when it does not, the answer is "try later", not an earlier
 *    retry.
 *  - **Cancellation is not a failure of identity.** An aborted request says
 *    nothing about whether the reader is signed in.
 *
 * Dependency-free so the client's node:test suite can run it.
 */

export type RequestErrorCategory = 'network' | 'timeout' | 'aborted' | 'http' | 'challenge' | 'malformed'

/** Longest slice of an error body kept for a message. */
export const MAX_DETAIL = 200
/** A request with no caller deadline gives up after this long. */
export const DEFAULT_TIMEOUT_MS = 10_000

export class RequestError extends Error {
  readonly status: number
  readonly category: RequestErrorCategory
  /** From `Retry-After`, in milliseconds, when the server gave a valid one. */
  readonly retryAfterMs: number | null

  constructor(
    message: string,
    options: { status: number; category: RequestErrorCategory; retryAfterMs?: number | null },
  ) {
    super(message)
    this.name = 'RequestError'
    this.status = options.status
    this.category = options.category
    this.retryAfterMs = options.retryAfterMs ?? null
  }
}

/**
 * `Retry-After` as milliseconds from `now`: delta-seconds or an HTTP-date.
 * Anything else — negative, fractional nonsense, an unparseable date — is
 * `null`, never zero, so a malformed header cannot produce a tight loop.
 */
export function parseRetryAfter(value: string | null | undefined, now = Date.now()): number | null {
  if (value === null || value === undefined) return null
  const trimmed = value.trim()
  if (trimmed === '') return null

  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed)
    return Number.isSafeInteger(seconds) ? seconds * 1000 : null
  }

  // An HTTP-date always names a weekday or a month; a bare number with a
  // decimal point or a sign is not a date, whatever Date.parse makes of it.
  if (!/[a-z]/i.test(trimmed)) return null
  const at = Date.parse(trimmed)
  if (Number.isNaN(at)) return null
  return Math.max(0, at - now)
}

function looksLikeHtml(contentType: string | null, text: string): boolean {
  if (contentType && /text\/html/i.test(contentType)) return true
  return /^\s*</.test(text)
}

/**
 * Turn a non-OK response into a `RequestError` from its status and headers,
 * reading the body only for a short message.
 */
export function errorFromResponse(
  response: { status: number; headers: { get(name: string): string | null } },
  text: string,
  now = Date.now(),
): RequestError {
  const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'), now)
  const contentType = response.headers.get('content-type')

  if (looksLikeHtml(contentType, text)) {
    // A challenge or a proxy's error page. Its text is not a message for a
    // reader, and it is not something a script can satisfy by asking again.
    return new RequestError(`Request blocked or unavailable (${response.status})`, {
      status: response.status,
      category: 'challenge',
      retryAfterMs,
    })
  }

  let message = `Request failed with status ${response.status}`
  try {
    const parsed = JSON.parse(text) as { error?: unknown; message?: unknown }
    const detail = typeof parsed.error === 'string' ? parsed.error : typeof parsed.message === 'string' ? parsed.message : null
    if (detail) message = detail.slice(0, MAX_DETAIL)
  } catch {
    // Not JSON: keep the generic message rather than the raw body.
  }

  return new RequestError(message, { status: response.status, category: 'http', retryAfterMs })
}

/** The error a thrown `fetch` (or body read) becomes. */
export function errorFromThrown(error: unknown, signals: { callerAborted: boolean; timedOut: boolean }): RequestError {
  if (signals.callerAborted) return new RequestError('Request cancelled', { status: 0, category: 'aborted' })
  if (signals.timedOut) return new RequestError('Request timed out', { status: 0, category: 'timeout' })
  const detail = error instanceof Error ? error.message : String(error)
  return new RequestError(`Network error: ${detail}`.slice(0, MAX_DETAIL), { status: 0, category: 'network' })
}

/** A 200 whose body is not the JSON it claims to be. */
export function malformedSuccess(status: number): RequestError {
  return new RequestError(`Malformed response (${status})`, { status, category: 'malformed' })
}

export type RetryPolicy = {
  /** Total attempts, including the first. */
  maxAttempts: number
  /** Longest the whole sequence may take, first attempt to last retry. */
  maxElapsedMs: number
  /** First backoff ceiling; doubles each attempt up to `maxDelayMs`. */
  baseDelayMs: number
  maxDelayMs: number
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  maxElapsedMs: 20_000,
  baseDelayMs: 500,
  maxDelayMs: 8_000,
}

export type RetryDecision =
  | { retry: true; delayMs: number }
  | { retry: false; reason: 'permanent' | 'exhausted' | 'retry-later' | 'cancelled' }

function statusOf(error: unknown): number | null {
  const status = (error as { status?: unknown } | null)?.status
  return typeof status === 'number' ? status : null
}

function categoryOf(error: unknown): RequestErrorCategory | null {
  if (error instanceof RequestError) return error.category
  return null
}

/**
 * Should attempt `attempt + 1` happen, and after how long?
 *
 * `attempt` is how many attempts have already failed (1 after the first).
 * `elapsedMs` is time since the first attempt started.
 */
export function retryDecision(
  error: unknown,
  attempt: number,
  elapsedMs: number,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
  random: () => number = Math.random,
): RetryDecision {
  const category = categoryOf(error)
  const status = statusOf(error)

  if (category === 'aborted') return { retry: false, reason: 'cancelled' }
  if (category === 'challenge' || category === 'malformed') return { retry: false, reason: 'permanent' }
  if (status !== null && status >= 400 && status < 500 && status !== 408 && status !== 429) {
    return { retry: false, reason: 'permanent' }
  }

  if (attempt >= policy.maxAttempts) return { retry: false, reason: 'exhausted' }

  const remaining = policy.maxElapsedMs - elapsedMs
  if (remaining <= 0) return { retry: false, reason: 'exhausted' }

  // Equal jitter: half the ceiling fixed, half random. Readers who failed
  // together come back spread over a window, and never immediately — a
  // zero delay would be a tight loop against a service that just said no.
  const ceiling = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** Math.max(0, attempt - 1))
  const jittered = Math.round(ceiling / 2 + random() * (ceiling / 2))

  const retryAfterMs = error instanceof RequestError ? error.retryAfterMs : null
  if (retryAfterMs !== null) {
    // The server said when. Never earlier; and if "when" is past what this
    // caller will wait, surface "try later" instead of retrying early.
    if (retryAfterMs > remaining) return { retry: false, reason: 'retry-later' }
    return { retry: true, delayMs: Math.max(retryAfterMs, jittered) }
  }

  if (status === 429) {
    // Rate limited with no guidance: back off, but only as far as the budget.
    return jittered > remaining ? { retry: false, reason: 'retry-later' } : { retry: true, delayMs: jittered }
  }

  if (jittered > remaining) return { retry: false, reason: 'exhausted' }
  return { retry: true, delayMs: jittered }
}

/** True for failures that mean "the service could not answer", as opposed to "the answer is no". */
export function isTemporaryFailure(error: unknown): boolean {
  const category = categoryOf(error)
  if (category === 'network' || category === 'timeout' || category === 'challenge' || category === 'malformed') {
    return true
  }
  const status = statusOf(error)
  return status !== null && (status === 408 || status === 429 || status >= 500)
}

/** True when the server said, in so many words, that the caller has no session. */
export function isUnauthenticated(error: unknown): boolean {
  if (categoryOf(error) === 'challenge') return false
  const status = statusOf(error)
  return status === 401
}

type FetchLike = (
  url: string,
  init: RequestInit & { signal: AbortSignal },
) => Promise<{ ok: boolean; status: number; headers: { get(name: string): string | null }; text(): Promise<string> }>

/**
 * One request, with a deadline over headers *and* body, the caller's
 * cancellation joined to it, and status read before the body is trusted.
 * `apiRequest` is this plus the site's URL, headers and credentials; it lives
 * here so the timing and cancellation rules can be tested without a browser.
 */
export async function executeRequest<T>(options: {
  fetchImpl: FetchLike
  url: string
  init?: RequestInit
  timeoutMs?: number
  signal?: AbortSignal | null
}): Promise<T> {
  const { fetchImpl, url, init = {}, timeoutMs = DEFAULT_TIMEOUT_MS } = options
  const callerSignal = options.signal ?? undefined

  const deadline = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    deadline.abort()
  }, timeoutMs)
  const onCallerAbort = () => deadline.abort()
  if (callerSignal) {
    if (callerSignal.aborted) deadline.abort()
    else callerSignal.addEventListener('abort', onCallerAbort, { once: true })
  }

  // A body read does not always observe the signal (it depends on the
  // implementation), so the deadline races it explicitly.
  const aborted = new Promise<never>((_, reject) => {
    deadline.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
  })
  aborted.catch(() => undefined)

  try {
    let response: Awaited<ReturnType<FetchLike>>
    let text: string
    try {
      if (deadline.signal.aborted) throw new Error('aborted')
      response = await Promise.race([fetchImpl(url, { ...init, signal: deadline.signal }), aborted])
      text = await Promise.race([response.text(), aborted])
    } catch (error) {
      throw errorFromThrown(error, { callerAborted: Boolean(callerSignal?.aborted), timedOut })
    }

    if (!response.ok) throw errorFromResponse(response, text)

    if (text === '') return undefined as T
    try {
      return JSON.parse(text) as T
    } catch {
      throw malformedSuccess(response.status)
    }
  } finally {
    clearTimeout(timer)
    callerSignal?.removeEventListener('abort', onCallerAbort)
  }
}
