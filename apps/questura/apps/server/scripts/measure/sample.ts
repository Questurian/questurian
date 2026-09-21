/**
 * One request, classified.
 *
 * Every response lands in exactly one outcome. Only `ok` contributes to the
 * latency distribution: a 429 that returns in 2 ms, or a 500 that returns in
 * 5 ms, is not a fast page, and letting it into the percentile is how a
 * throttled run reports a better p95 than a healthy one.
 */

import type { Expectation, Step } from './scenario'

export type Outcome =
  /** Intended content: expected status and body checks passed. */
  | 'ok'
  /** 429: a limiter refused. Legitimate-traffic 429s are availability failures. */
  | 'throttled'
  /** Any other 4xx. */
  | 'client-error'
  /** 5xx, including 503 overload responses. */
  | 'server-error'
  /** Expected status class but the body was not the content (empty, wrong shape). */
  | 'invalid-body'
  /** No response inside the deadline. */
  | 'timeout'
  /** Connection refused, reset, DNS — no HTTP response at all. */
  | 'transport'

export type Sample = {
  step: string
  /** Measured or warmup. Warmup samples never enter a summary. */
  phase: 'warmup' | 'measure'
  outcome: Outcome
  status: number | null
  ms: number
  bytes: number
  /** Scheduled start versus actual start, arrival mode only: generator lag. */
  lateMs: number
  /** From `Server-Timing`. `null` means the server did not say, never zero. */
  statements: number | null
  statementMs: number | null
  reads: number | null
  poolWaitMs: number | null
  coalesced: string | null
  cacheControl: string | null
  /** `x-nextjs-cache` / `x-vercel-cache` / `cf-cache-status`, whichever is present. */
  cacheStatus: string | null
  error: string | null
}

/** `total;dur=954, sql;dur=5438;desc="382 statements (cumulative)", reads;desc="43"` */
export function parseServerTiming(header: string | null): Record<string, { dur?: number; desc?: string }> {
  if (!header) return {}

  const entries: Record<string, { dur?: number; desc?: string }> = {}
  // Split on commas outside quotes. A quoted comma is legal in this header and
  // splitting on it blindly silently drops the entry it was in.
  const parts = header.match(/(?:[^,"]|"[^"]*")+/g) ?? []

  for (const part of parts) {
    const name = part.trim().split(';')[0]?.trim()
    if (!name) continue

    const desc = /desc="([^"]*)"/.exec(part)?.[1]
    const dur = /dur=([\d.]+)/.exec(part)?.[1]
    entries[name] = {
      ...(dur !== undefined ? { dur: Number(dur) } : {}),
      ...(desc !== undefined ? { desc } : {}),
    }
  }
  return entries
}

function numberOrNull(value: string | number | undefined): number | null {
  if (value === undefined || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(/^[\d.]+/.exec(value)?.[0])
  return Number.isFinite(parsed) ? parsed : null
}

export function classify(
  status: number,
  body: string,
  expect: Expectation | undefined,
): { outcome: Outcome; error: string | null } {
  const expectedStatuses = expect?.status ?? [200]

  if (!expectedStatuses.includes(status)) {
    if (status === 429) return { outcome: 'throttled', error: null }
    if (status >= 500) return { outcome: 'server-error', error: null }
    if (status >= 400) return { outcome: 'client-error', error: null }
    return { outcome: 'invalid-body', error: `unexpected status ${status}` }
  }

  const kind = expect?.body ?? 'any'
  if (kind === 'json') {
    try {
      JSON.parse(body)
    } catch {
      return { outcome: 'invalid-body', error: 'body is not JSON' }
    }
  }
  if (kind === 'html' && !/<html/i.test(body)) {
    return { outcome: 'invalid-body', error: 'body is not an HTML document' }
  }
  if (expect?.minBytes !== undefined && Buffer.byteLength(body) < expect.minBytes) {
    return { outcome: 'invalid-body', error: `body under ${expect.minBytes} bytes` }
  }
  if (expect?.contains !== undefined && !body.includes(expect.contains)) {
    return { outcome: 'invalid-body', error: `body lacks "${expect.contains}"` }
  }
  return { outcome: 'ok', error: null }
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>

export async function takeSample(
  url: string,
  step: Step,
  options: {
    phase: Sample['phase']
    timeoutMs: number
    lateMs?: number
    /** Resolved request headers; defaults to the step's own. */
    headers?: Record<string, string>
    fetchImpl?: FetchLike
    now?: () => number
  },
): Promise<Sample> {
  const now = options.now ?? (() => performance.now())
  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init))
  const controller = new AbortController()
  // The deadline covers the body too: a server that sends headers and then
  // stalls is exactly as unavailable as one that never answers.
  const timer = setTimeout(() => controller.abort(), options.timeoutMs)
  const startedAt = now()

  const base: Omit<Sample, 'outcome' | 'status' | 'ms' | 'bytes' | 'error'> = {
    step: step.name,
    phase: options.phase,
    lateMs: options.lateMs ?? 0,
    statements: null,
    statementMs: null,
    reads: null,
    poolWaitMs: null,
    coalesced: null,
    cacheControl: null,
    cacheStatus: null,
  }

  try {
    const response = await fetchImpl(url, {
      headers: { 'x-questura-diagnostics': '1', ...(options.headers ?? step.headers ?? {}) },
      signal: controller.signal,
      redirect: 'manual',
    })
    const body = await response.text()
    const ms = now() - startedAt

    const timing = parseServerTiming(response.headers.get('server-timing'))
    const { outcome, error } = classify(response.status, body, step.expect)

    return {
      ...base,
      outcome,
      status: response.status,
      ms,
      bytes: Buffer.byteLength(body),
      statements: numberOrNull(timing.sql?.desc),
      statementMs: numberOrNull(timing.sql?.dur),
      reads: numberOrNull(timing.reads?.desc),
      poolWaitMs: numberOrNull(timing.pool?.dur),
      coalesced: timing.coalesced?.desc ?? null,
      cacheControl: response.headers.get('cache-control'),
      cacheStatus:
        response.headers.get('x-nextjs-cache') ??
        response.headers.get('x-vercel-cache') ??
        response.headers.get('cf-cache-status'),
      error,
    }
  } catch (error) {
    const aborted = controller.signal.aborted
    return {
      ...base,
      outcome: aborted ? 'timeout' : 'transport',
      status: null,
      ms: now() - startedAt,
      bytes: 0,
      error: aborted
        ? `no complete response within ${options.timeoutMs} ms`
        : error instanceof Error
          ? (error.cause instanceof Error ? error.cause.message : error.message)
          : String(error),
    }
  } finally {
    clearTimeout(timer)
  }
}
