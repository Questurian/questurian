import { AsyncLocalStorage } from 'node:async_hooks'

import { describe, expect, it } from 'vitest'

/**
 * `currentRequestId()` inside a request Next is serving: the path every log
 * line in a route handler takes.
 *
 * Next's server installs `globalThis.AsyncLocalStorage` before any of its
 * storages are created. Anywhere else (a jsdom test, a tsx script) the storage
 * is an inert stand-in whose `getStore()` is always undefined, which is the
 * right answer outside a request. So this file installs the global first, as
 * the server does, and only then loads Next's storage and the module under
 * test. It is its own file because that has to happen before the first import.
 */
;(globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage = AsyncLocalStorage

const { workUnitAsyncStorage } = await import('next/dist/server/app-render/work-unit-async-storage.external')
const { currentRequestId } = await import('./request-id')

function inRequest<T>(headers: Record<string, string>, fn: () => T): T {
  return workUnitAsyncStorage.run({ type: 'request', headers: new Headers(headers) } as never, fn)
}

describe('currentRequestId inside a Next request', () => {
  it('reads the id proxy.ts forwarded', () => {
    expect(inRequest({ 'x-request-id': 'req-from-proxy-1' }, () => currentRequestId())).toBe('req-from-proxy-1')
  })

  it('ignores a malformed id', () => {
    expect(inRequest({ 'x-request-id': 'no good' }, () => currentRequestId())).toBeUndefined()
  })

  it('has none for a request without one', () => {
    expect(inRequest({}, () => currentRequestId())).toBeUndefined()
  })
})
