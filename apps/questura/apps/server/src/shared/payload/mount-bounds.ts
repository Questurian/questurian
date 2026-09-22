import { NextResponse, type NextRequest } from 'next/server'

import { AdmissionRefused } from '@/shared/http/admission'
import { admitPublicWork, overloadedResponse } from '@/shared/http/public-read'
import {
  checkPublicReadRateLimit,
  publicReadRateLimitResponse,
} from '@/shared/http/public-read-rate-limit'

import { ANONYMOUS_MAX_DEPTH, ANONYMOUS_MAX_LIMIT } from './anonymous-api-bounds'

/**
 * Bounds on Payload's own mounts, applied to the whole request.
 *
 * `anonymous-api-bounds.ts` clamps each *collection read* through a
 * `beforeOperation` hook. Three things it cannot reach:
 *
 *  - **Globals.** The plugin decorates collections. `/api/globals/main-homepage`
 *    is anonymously readable and takes `depth` from the query string, so it
 *    was unbounded by exactly the mechanism that bounds everything else.
 *  - **The request, as opposed to the read.** A hook admits nothing: there
 *    was no limit on how many of these could run at once, so the mount could
 *    hold the whole Payload pool while `/api/public/*` queued behind it.
 *  - **GraphQL.** One POST can carry many aliased root fields. Clamping each
 *    to a hundred documents bounds each read and not the request.
 *
 * So the bound moves to the route, where it can hold a slot for as long as
 * the SQL actually takes — the hook could only take one and give it back
 * before the read ran.
 *
 * The generated route files say not to modify them, and they mean it: Payload
 * rewrites them. The durable strategy is that they stay two lines long —
 * import this and export it — and `mount-bounds.test.ts` fails if a
 * regeneration drops the import. A test is a more reliable guard than a
 * comment in a file that is designed to be overwritten.
 */

/** Requests carrying no credential at all. Payload still authenticates the rest. */
export function looksAnonymous(req: NextRequest): boolean {
  if (req.headers.get('authorization')) return false
  if (req.headers.get('x-api-key')) return false
  const cookie = req.headers.get('cookie') ?? ''
  return !/payload-token|better-auth|questura-session/i.test(cookie)
}

/**
 * Cap what an anonymous caller may ask for, in the URL, before Payload parses
 * it. `pagination=false` is the important one: it means "every row", and a
 * global or a collection that slipped past the hook would honour it.
 */
export function clampMountQuery(url: URL): URL {
  const bounded = new URL(url)
  const params = bounded.searchParams

  // An absent parameter is not a zero. `Number(null)` is 0, which is a
  // perfectly valid depth, so reading it that way would leave an unasked-for
  // depth unset and the mount's own default in charge.
  const asked = (name: string): number | null => {
    const raw = params.get(name)
    if (raw === null || raw.trim() === '') return null
    const value = Number(raw)
    return Number.isFinite(value) ? value : Number.NaN
  }

  const depth = asked('depth')
  if (depth === null || Number.isNaN(depth) || depth > ANONYMOUS_MAX_DEPTH || depth < 0) {
    params.set('depth', String(ANONYMOUS_MAX_DEPTH))
  }

  const limit = asked('limit')
  if (limit === null || Number.isNaN(limit) || limit > ANONYMOUS_MAX_LIMIT || limit <= 0) {
    params.set('limit', String(ANONYMOUS_MAX_LIMIT))
  }

  params.set('pagination', 'true')

  return bounded
}

type Handler = (req: NextRequest, context: unknown) => Promise<Response> | Response

/**
 * Rate limit, clamp and admit an anonymous read of the REST mount.
 *
 * Only GET. The mount also serves sign-in and other writes, which have their
 * own limits and must not be refused by a gate meant for reads.
 */
export function boundedRestRead(handler: Handler): Handler {
  return async (req: NextRequest, context: unknown) => {
    if (req.method !== 'GET' || !looksAnonymous(req)) return handler(req, context)

    const limit = await checkPublicReadRateLimit(req.headers, 'payloadApi')
    if (!limit.allowed) return publicReadRateLimitResponse(limit.retryAfterSeconds)

    const clamped = clampMountQuery(new URL(req.url))
    // Rebuilt from method and headers rather than copied from `req`: copying
    // carries the abort signal across a Request boundary, and the two sides
    // do not always agree that an AbortSignal is an AbortSignal. The signal
    // is handed to the gate directly below, where it is actually needed.
    const bounded =
      clamped.toString() === req.url
        ? req
        : (new Request(clamped, { method: 'GET', headers: req.headers }) as NextRequest)

    try {
      // The slot is held for the whole request, so it is released when the
      // SQL has finished rather than when the hook returned.
      return await admitPublicWork('query', async () => handler(bounded, context), req.signal ?? undefined)
    } catch (error) {
      if (error instanceof AdmissionRefused) return overloadedResponse(error)
      throw error
    }
  }
}

/**
 * Anonymous GraphQL is closed.
 *
 * Nothing in this repository calls `/api/graphql` — not the client, not the
 * writer, not Location Manager, which syncs over REST. It exists because
 * Payload mounts it. Meanwhile one POST can carry many aliased root fields,
 * fragments and relationship selections, so a per-read clamp bounds each read
 * and not the request, and a real cost limiter means parsing and scoring
 * every operation.
 *
 * Building that limiter for a surface with no consumer is the expensive way
 * to reach the same place. Anonymous callers get 401; a request carrying a
 * credential goes through to Payload, which authenticates it properly. Staff
 * and service accounts are unaffected.
 *
 * If a public GraphQL consumer ever appears, this is the file to reopen — and
 * the cost limiter becomes worth building at that point, not before.
 */
export function authenticatedGraphQLOnly(handler: Handler): Handler {
  return async (req: NextRequest, context: unknown) => {
    if (looksAnonymous(req)) {
      return NextResponse.json(
        {
          errors: [
            {
              message:
                'Anonymous GraphQL is closed. The public site reads through /api/public/*; staff and service accounts authenticate.',
            },
          ],
        },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      )
    }

    return handler(req, context)
  }
}
