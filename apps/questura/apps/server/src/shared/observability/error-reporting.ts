import type { Breadcrumb, ErrorEvent } from '@sentry/nextjs'
import type { Instrumentation } from 'next'

import { logger } from '@/shared/utils/logger'
import { REDACTED, redact, redactString } from './redact'
import { REQUEST_ID_HEADER, wellFormedRequestId } from './request-id'

/**
 * Where errors go: one log line each, always, and Sentry when it is configured.
 *
 * The owner chose Sentry (launch fix plan, decision D1) so a failure reaches a
 * phone rather than waiting to be found in a log. The log line stays the
 * record of truth either way; Sentry is the alarm.
 *
 * **Off unless `SENTRY_DSN` is set.** Development, the readiness sandbox and CI
 * never set it, so nothing is loaded and nothing leaves the machine. The SDK is
 * imported only when there is somewhere to send to.
 *
 * **Nothing personal is sent.** `sendDefaultPii` is off, and `scrubEvent` runs
 * on every event before it leaves: cookies, bodies, query strings, the user
 * and every header but a short allowlist are removed, and every remaining
 * string goes through the same redaction as the logs (`redact.ts`). The
 * scrubber has its own tests, because it is the one thing standing between a
 * session cookie and a third party.
 *
 * Setup and the one-command proof: docs/procedures/sentry-setup.md.
 */

type Env = Record<string, string | undefined>

type SentryModule = typeof import('@sentry/nextjs')
/** The part of the SDK this module uses, so tests can hand in a fake. */
export type SentryClient = Pick<
  SentryModule,
  'init' | 'withScope' | 'captureRequestError' | 'captureMessage' | 'captureException' | 'flush'
>

/**
 * The started SDK lives on `globalThis`, not in this module. Next bundles
 * `instrumentation.ts` (which starts it) separately from each route (which
 * report through it), so each has its own copy of this module; a module-level
 * variable set at boot was still `null` in `/api/client-errors`. Found by
 * running the route against a local ingest, not by a unit test.
 */
const slot = globalThis as unknown as { __questuraSentry?: SentryClient | null }

const sentryState = {
  get client(): SentryClient | null {
    return slot.__questuraSentry ?? null
  },
  set client(value: SentryClient | null) {
    slot.__questuraSentry = value
  },
}

/** Headers worth keeping on an event. Everything else is dropped, not redacted. */
const HEADER_ALLOWLIST = new Set([
  'user-agent',
  'content-type',
  'accept',
  'referer',
  REQUEST_ID_HEADER,
])

/** The Sentry options for this environment, or `null` when there is no DSN. */
export function sentryOptions(env: Env = process.env) {
  const dsn = env.SENTRY_DSN?.trim()
  if (!dsn) return null

  return {
    dsn,
    environment:
      env.SENTRY_ENVIRONMENT?.trim() ||
      (env.NODE_ENV === 'production' ? 'production' : 'development'),
    release: env.QUESTURA_RELEASE_SHA?.trim() || undefined,
    // No IP addresses, cookies or request bodies, whatever an integration would like.
    sendDefaultPii: false,
    // Errors only: no `tracesSampleRate`. Even a rate of 0 counts as tracing
    // switched on and loads the SDK's database and HTTP instrumentation.
    // Tracing is a separate decision with its own cost and quota.
    maxBreadcrumbs: 30,
    initialScope: { tags: { service: 'questura-server' } },
    beforeSend: (event: ErrorEvent) => scrubEvent(event),
    beforeBreadcrumb: (breadcrumb: Breadcrumb) => scrubBreadcrumb(breadcrumb),
  }
}

/** Load and start the SDK if a DSN is configured. Never throws. */
export async function initErrorReporting(env: Env = process.env): Promise<boolean> {
  const options = sentryOptions(env)
  if (!options) return false

  try {
    const loaded = await import('@sentry/nextjs')
    // Bundled by Next, the namespace has every export. Loaded as CommonJS by
    // a plain Node script (sentry:test-event), some only exist on `default`.
    const mod: SentryClient =
      typeof loaded.withScope === 'function'
        ? loaded
        : ((loaded as unknown as { default: SentryClient }).default ?? loaded)
    mod.init(options)
    sentryState.client = mod
    logger.info('Error reporting on', { sink: 'sentry', environment: options.environment })
    return true
  } catch (error) {
    // Reporting is a watcher. A watcher that fails to start must not take the
    // thing it watches down with it; the log lines still carry every error.
    logger.error('Error reporting failed to start; errors go to logs only', { error })
    return false
  }
}

export function errorReportingEnabled(): boolean {
  return sentryState.client !== null
}

/** The started SDK, or `null` when reporting is off. */
export function sentryClient(): SentryClient | null {
  return sentryState.client
}

/** Test seam. */
export function setSentryClientForTests(client: SentryClient | null): void {
  sentryState.client = client
}

/** A URL with its query string and fragment removed: tokens travel there. */
export function pathOnly(url: string | undefined): string | undefined {
  if (!url) return url
  const cut = url.search(/[?#]/)
  return cut === -1 ? url : url.slice(0, cut)
}

/**
 * What leaves for Sentry. Runs on every event (`beforeSend`).
 *
 * Removes whole: cookies, request bodies, query strings, the user (bar an
 * opaque id), every header outside a short allowlist, and local variables in
 * stack frames. Redacts in place: every string that remains.
 */
export function scrubEvent<T extends ErrorEvent>(event: T): T {
  const out = { ...event }

  if (out.request) {
    const request = { ...out.request }
    delete request.cookies
    delete request.data
    if (request.query_string) request.query_string = REDACTED
    request.url = pathOnly(request.url)

    if (request.headers) {
      const headers: Record<string, string> = {}
      for (const [key, value] of Object.entries(request.headers)) {
        if (HEADER_ALLOWLIST.has(key.toLowerCase())) headers[key] = redactString(String(value))
      }
      request.headers = headers
    }

    delete request.env
    out.request = request
  }

  if (out.user) {
    if (out.user.id !== undefined) out.user = { id: out.user.id }
    else delete out.user
  }

  if (out.message) out.message = redactString(out.message)
  if (out.transaction) out.transaction = pathOnly(redactString(out.transaction))
  if (out.extra) out.extra = redact(out.extra)
  if (out.contexts) out.contexts = redact(out.contexts)
  if (out.tags) out.tags = redact(out.tags)

  if (out.exception?.values) {
    out.exception = {
      ...out.exception,
      values: out.exception.values.map((value) => ({
        ...value,
        value: value.value === undefined ? undefined : redactString(value.value),
        stacktrace: value.stacktrace && {
          ...value.stacktrace,
          // Local variables go. The source lines around each frame stay (they
          // are what makes a report readable) but are redacted like any other
          // text: source can hold a literal address or key too.
          frames: value.stacktrace.frames?.map((original) => {
            const frame = { ...original }
            delete frame.vars
            return {
              ...frame,
              ...(frame.context_line !== undefined
                ? { context_line: redactString(frame.context_line) }
                : {}),
              ...(frame.pre_context ? { pre_context: frame.pre_context.map(redactString) } : {}),
              ...(frame.post_context ? { post_context: frame.post_context.map(redactString) } : {}),
            }
          }),
        },
      })),
    }
  }

  if (out.breadcrumbs) {
    out.breadcrumbs = out.breadcrumbs
      .map((crumb) => scrubBreadcrumb(crumb))
      .filter(Boolean) as Breadcrumb[]
  }

  return out
}

export function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb | null {
  const out: Breadcrumb = { ...crumb }
  if (out.message) out.message = redactString(out.message)
  if (out.data) {
    const data = redact(out.data)
    if (typeof data.url === 'string') data.url = pathOnly(data.url)
    out.data = data
  }
  return out
}

type RequestInfo = Parameters<Instrumentation.onRequestError>[1]
type ErrorContext = Parameters<Instrumentation.onRequestError>[2]

function headerValue(headers: RequestInfo['headers'], name: string): string | undefined {
  const value = headers[name]
  return Array.isArray(value) ? value[0] : value
}

/**
 * Next's `onRequestError`: a route handler, page or action threw.
 *
 * Exactly one log line and at most one Sentry event, both carrying the
 * request id, neither carrying the query string, a cookie or a header value
 * outside the allowlist.
 */
export function reportRequestError(
  error: unknown,
  request: RequestInfo,
  context: ErrorContext,
): void {
  const requestId = wellFormedRequestId(headerValue(request.headers, REQUEST_ID_HEADER))
  const digest = (error as { digest?: unknown } | null)?.digest

  logger.error('Request failed', {
    requestId,
    method: request.method,
    path: pathOnly(request.path),
    routePath: context.routePath,
    routeType: context.routeType,
    ...(typeof digest === 'string' ? { digest } : {}),
    release: process.env.QUESTURA_RELEASE_SHA || undefined,
    error,
  })

  const client = sentryState.client
  if (!client) return

  try {
    // Only what the scrubber would keep anyway; it runs again on the event.
    const headers: Record<string, string> = {}
    for (const key of HEADER_ALLOWLIST) {
      const value = headerValue(request.headers, key)
      if (value) headers[key] = value
    }

    client.withScope((scope) => {
      if (requestId) scope.setTag('request_id', requestId)
      client.captureRequestError(
        error,
        { ...request, path: pathOnly(request.path) ?? '', headers },
        context,
      )
    })
  } catch {
    // Already logged above; the reporter must never turn one error into two.
  }
}

export type ClientErrorReport = {
  source: 'browser' | 'worker'
  boundary: string
  message: string
  path?: string
  digest?: string
  requestId?: string
  release?: string
  stack?: string
}

/**
 * An error the website reported through `/api/client-errors`: a browser error
 * boundary, or the Worker's own `onRequestError`. Already validated and
 * trimmed by the route; redacted again here on the way out.
 */
export function reportClientError(report: ClientErrorReport, serverRequestId?: string): void {
  const clean = redact(report)
  // `message` is the log line's own field; the report's goes beside it.
  const { message: clientMessage, ...fields } = clean

  logger.error('Client error reported', {
    ...fields,
    clientMessage,
    path: pathOnly(clean.path),
    reportRequestId: serverRequestId,
  })

  const client = sentryState.client
  if (!client) return

  try {
    client.withScope((scope) => {
      scope.setTags({
        service: 'questura-client',
        source: clean.source,
        boundary: clean.boundary,
        ...(clean.requestId ? { request_id: clean.requestId } : {}),
        ...(clean.digest ? { digest: clean.digest } : {}),
      })
      if (clean.release) scope.setTag('client_release', clean.release)
      scope.setContext('client_error', {
        path: pathOnly(clean.path),
        stack: clean.stack,
      })
      scope.setFingerprint(['client-error', clean.source, clean.boundary, clean.message])
      client.captureMessage(`[${clean.source}] ${clean.message}`, 'error')
    })
  } catch {
    // Logged above.
  }
}

/** Wait for queued events to leave, e.g. before a script exits. */
export async function flushErrorReporting(timeoutMs = 5000): Promise<boolean> {
  const client = sentryState.client
  return client ? client.flush(timeoutMs) : true
}
