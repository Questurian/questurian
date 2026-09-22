import { get } from '@/lib/api'
import type { CurrentPrincipalResponse } from '@/lib/user/types'

import { IdentityStore, type IdentityResponse } from './identity'

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
})

/** Reuse window for consumers mounting just after another resolved the same page's identity. */
export const SHARED_IDENTITY_MAX_AGE_MS = 30_000
