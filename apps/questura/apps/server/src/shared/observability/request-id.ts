import { AsyncLocalStorage } from 'node:async_hooks'

import { workUnitAsyncStorage } from 'next/dist/server/app-render/work-unit-async-storage.external'

/**
 * One id per request, carried in and out as `x-request-id`, and written on
 * every log line and every error report the request produces.
 *
 * Without it, a reader's "the page broke at 14:02" meets a log with forty
 * error lines around 14:02 and no way to say which were theirs. With it, the
 * id in the response header (or in the error report) finds every line.
 *
 * - `proxy.ts` accepts a well-formed id from the caller (Cloudflare, a load
 *   balancer, the site's own server-side fetches) or makes one, forwards it
 *   to the route as a request header, and echoes it on the response.
 * - `currentRequestId()` is how the logger finds it without every call site
 *   passing it along: first an explicit `runWithRequestId` scope (scripts,
 *   tests), then the request Next is serving right now.
 *
 * An id from outside is accepted only if it looks like an id. It ends up in
 * log lines and headers, so a caller must not be able to put a newline, a
 * kilobyte, or anything else there.
 */

export const REQUEST_ID_HEADER = 'x-request-id'

const WELL_FORMED = /^[A-Za-z0-9._:-]{8,128}$/

/** The id if it is safe to log and echo, otherwise `undefined`. */
export function wellFormedRequestId(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  return WELL_FORMED.test(trimmed) ? trimmed : undefined
}

/** The caller's id when it is well formed, otherwise a new one. */
export function acceptOrCreateRequestId(incoming: string | null | undefined): string {
  return wellFormedRequestId(incoming) ?? globalThis.crypto.randomUUID()
}

const scope = new AsyncLocalStorage<string>()

/** Run `fn` with `id` as the current request id. For scripts and tests. */
export function runWithRequestId<T>(id: string, fn: () => T): T {
  return scope.run(id, fn)
}

/**
 * The request id of the work running now, if there is one.
 *
 * Next keeps the request it is serving in `workUnitAsyncStorage`; that is what
 * `headers()` reads. Reading it directly keeps this synchronous, which the
 * logger needs, and it is the one module in Next built to be shared rather
 * than bundled twice (the `.external` suffix). Outside a request (boot,
 * timers, the outbox drain) there is no store and no id, which is the truth.
 */
export function currentRequestId(): string | undefined {
  const scoped = scope.getStore()
  if (scoped) return scoped

  try {
    const store = workUnitAsyncStorage.getStore()
    if (store && store.type === 'request') {
      return wellFormedRequestId(store.headers.get(REQUEST_ID_HEADER))
    }
  } catch {
    // An internal of Next moved. Logging must never be the thing that throws.
  }

  return undefined
}
