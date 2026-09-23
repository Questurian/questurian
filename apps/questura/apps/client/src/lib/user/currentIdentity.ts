import { get } from '@/lib/api'
import type { CurrentPrincipalResponse } from '@/lib/user/types'

import { IdentityStore, type IdentityResponse } from './identity'
import { hintFromResponse, writeHint } from './identityHint'

/**
 * The page's one identity store (`identity.ts`). The navbar's React Query
 * hook and the gated body both read through it, so a fresh gated page sends
 * one `/api/me`, not two.
 *
 * Module state lives in the browser tab. In a server render this module is
 * never asked anything: both consumers read it from effects and query
 * functions, which do not run during a render.
 */
export const identityStore = new IdentityStore({
  fetcher: () => get<CurrentPrincipalResponse>('/api/me') as Promise<IdentityResponse>,
  // Every answer refreshes the navbar's pre-paint hint (`identityHint.ts`).
  onAnswer: (value) => writeHint(hintFromResponse(value)),
})

/**
 * Start the page's `/api/me` as soon as the navbar's chunk evaluates, before
 * hydration. The navbar's query then joins it in flight (or reuses the answer
 * inside its own window), so the page still sends exactly one request.
 * Errors are left for the query to see and retry.
 */
export function primeIdentity(): void {
  if (typeof window === 'undefined') return
  identityStore.read({ maxAgeMs: PRIMED_IDENTITY_MAX_AGE_MS }).catch(() => {})
}

/** How long a primed answer stays good for the navbar's first query. */
export const PRIMED_IDENTITY_MAX_AGE_MS = 5_000

/** Reuse window for consumers mounting just after another resolved the same page's identity. */
export const SHARED_IDENTITY_MAX_AGE_MS = 30_000
