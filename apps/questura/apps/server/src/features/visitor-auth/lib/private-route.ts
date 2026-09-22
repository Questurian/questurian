import { NextResponse } from 'next/server'

import { AdmissionRefused, type PublicWorkClass } from '@/shared/http/admission'
import { admitPublicWork, overloadedResponse } from '@/shared/http/public-read'
import { logger } from '@/shared/utils/logger'

import { checkSessionTrafficLimit } from './session-traffic-limit'
import { visitorSessionToken } from './session-cookie'

/**
 * The one order every costly account route runs in (discovery finding 2).
 *
 *  0. Origin check and the no-cookie shortcut — done by the route, before
 *     this, because both are free.
 *  1. **Ingress**, before anything that can wait on a dependency. The limit
 *     below is a Redis call; a slow Redis must not collect unbounded waiters.
 *  2. **Pre-authentication limits**: the per-session/per-address guard
 *     (`session-traffic-limit.ts`, fails open), then any route-specific ones
 *     (the member body's per-address limit, which fails closed).
 *  3. **The `private` gate** (or `auth` for sign-in and password work), held
 *     until the handler has finished — session resolution, profile reads and
 *     the route's own queries all happen inside it, including Better Auth's
 *     *internal* `getSession`, which its HTTP rate limiter never sees.
 *  4. Per-account limits after identity (bookmark writes), inside the handler.
 *
 * Each gate is taken once, in this order, so nothing nests a gate inside
 * itself and nothing can deadlock waiting on a slot it already holds.
 *
 * Every answer — success, refusal, limit, or an exception from a dependency —
 * carries the route's private CORS headers and `no-store`. An exception
 * becomes a 503 with `Retry-After`: a temporary failure must never read as
 * "signed out" or "no bookmarks" to a client that cannot tell the difference.
 */

export type PreAuthLimit = (headers: Headers) => Promise<Response | null>

export type PrivateWorkOptions = {
  headers: Headers
  signal?: AbortSignal | null
  corsHeaders: Record<string, string>
  /** Which gate holds the work. Identity/bookmark/member reads: `private`. Password work: `auth`. */
  gate?: Extract<PublicWorkClass, 'private' | 'auth'>
  /** Route-specific limits checked after the session guard, before the gate. */
  limits?: PreAuthLimit[]
  /** For the log line only. */
  route: string
}

function withHeaders(response: Response, headers: Record<string, string>): Response {
  for (const [name, value] of Object.entries(headers)) response.headers.set(name, value)
  return response
}

export function temporarilyUnavailable(
  corsHeaders: Record<string, string>,
  reason: 'dependency' | 'counter-unavailable',
  retryAfterSeconds = 2,
): NextResponse {
  return NextResponse.json(
    { error: 'Temporarily unavailable. Please try again shortly.' },
    {
      status: 503,
      headers: {
        ...corsHeaders,
        'Retry-After': String(retryAfterSeconds),
        'Cache-Control': 'no-store',
        'X-Questura-Unavailable': reason,
      },
    },
  )
}

export function tooManyRequests(
  corsHeaders: Record<string, string>,
  retryAfterSeconds: number,
  scope: string,
): NextResponse {
  return NextResponse.json(
    { error: 'Too many requests. Please try again shortly.' },
    {
      status: 429,
      headers: {
        ...corsHeaders,
        'Retry-After': String(Math.max(1, retryAfterSeconds)),
        'Cache-Control': 'no-store',
        'X-Questura-Limit': scope,
      },
    },
  )
}

export async function runPrivateWork(
  options: PrivateWorkOptions,
  work: () => Promise<Response>,
): Promise<Response> {
  const { headers, corsHeaders } = options
  const signal = options.signal ?? undefined

  try {
    return await admitPublicWork(
      'ingress',
      async () => {
        const token = visitorSessionToken(headers)
        if (token) {
          const decision = await checkSessionTrafficLimit(headers, token)
          if (!decision.allowed) return tooManyRequests(corsHeaders, decision.retryAfterSeconds, decision.scope)
        }
        for (const check of options.limits ?? []) {
          const refused = await check(headers)
          if (refused) return withHeaders(refused, { ...corsHeaders, 'Cache-Control': 'no-store' })
        }
        return admitPublicWork(options.gate ?? 'private', work, signal)
      },
      signal,
    )
  } catch (error) {
    if (error instanceof AdmissionRefused) return withHeaders(overloadedResponse(error), corsHeaders)
    logger.error('Private route failed on a dependency', {
      route: options.route,
      error: error instanceof Error ? error.message : String(error),
    })
    return temporarilyUnavailable(corsHeaders, 'dependency')
  }
}
