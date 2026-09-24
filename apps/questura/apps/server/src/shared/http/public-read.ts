import { NextResponse, type NextRequest } from 'next/server'

import { isDatabaseUnavailable } from '@/shared/database/unavailable'
import { logger } from '@/shared/utils/logger'
import { noteOnRequest } from '@/shared/observability/request-report'
import { withPublicReadDiagnostics } from '@/shared/observability/public-read'

import { AdmissionRefused, admissionGate, type PublicWorkClass } from './admission'

import { withPublicCacheHeaders } from './public-cache-headers'
import {
  checkPublicReadRateLimit,
  publicReadRateLimitResponse,
  type PublicReadScope,
} from './public-read-rate-limit'

type PayloadLike = { db?: { pool?: unknown } }

/**
 * Which admission gate each scope's work passes through.
 *
 * `route` means the route admits its own work, inside request coalescing:
 * requests that join an assembly already in flight must not each take a slot
 * (a hot page would then refuse readers who cost nothing), so the gate has to
 * wrap the shared work, not the request. Those routes call `admitPublicWork`.
 */
const SCOPE_WORK: Record<PublicReadScope, PublicWorkClass | 'route' | 'none'> = {
  search: 'query',
  locationFeed: 'query',
  articleIndex: 'query',
  authorPage: 'query',
  articleRead: 'query',
  sitemap: 'query',
  related: 'query',
  locationHomepage: 'route',
  // A handful of depth-0 reads; gating them would only add a queue.
  navigation: 'none',
  // Not served through publicRead; the Payload hook uses only the limiter.
  payloadApi: 'none',
}

/**
 * Run expensive public work once admitted, and note the wait on the request.
 * Throws `AdmissionRefused`, which `publicRead` turns into a 503.
 */
export async function admitPublicWork<T>(
  kind: PublicWorkClass,
  work: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  const { value, waitedMs } = await admissionGate(kind).run(work, signal)
  noteOnRequest('admission', `${kind} waited ${waitedMs}ms`)
  return value
}

/**
 * A refusal is about this process right now. Nothing shared may cache it, and
 * `Retry-After` tells a well-behaved client (and the frontend) when to come
 * back.
 */
export function overloadedResponse(error: AdmissionRefused): NextResponse {
  return NextResponse.json(
    { message: 'Busy. Please try again shortly.' },
    {
      status: 503,
      headers: {
        'Retry-After': '1',
        'Cache-Control': 'no-store',
        'X-Questura-Overload': `${error.gate}; ${error.reason}`,
      },
    },
  )
}

/**
 * The database could not answer: frozen, gone, or too busy to finish inside
 * its budget (`shared/database/timeouts.ts`). That is about right now, not
 * about the request, so it is a 503 the frontend retries, never a 500 that
 * reads as a bug, and nothing shared may cache it.
 */
export function databaseUnavailableResponse(): NextResponse {
  return NextResponse.json(
    { message: 'Temporarily unavailable. Please try again shortly.' },
    {
      status: 503,
      headers: { 'Retry-After': '5', 'Cache-Control': 'no-store', 'X-Questura-Unavailable': 'database' },
    },
  )
}

/**
 * The five things every expensive public read needs, in the order they have
 * to happen.
 *
 * 0. Bound how many requests are in this process at all — *before* the rate
 *    limiter, because the rate limiter is a Redis call.
 * 1. Refuse the caller who is asking too often, before any database work.
 * 2. Admit the work only if the process has room for it (`admission.ts`).
 * 3. Count the work the request actually does.
 * 4. Say how long the answer may be reused.
 *
 * Step 0 is the one L07 added, and the ordering is the whole point. The rate
 * limiter fails open when Redis is unavailable, which is right — but "fails
 * open" describes the *answer*, not the *wait*. A half-open Redis answers
 * slowly rather than not at all, so every arriving request sits in the
 * limiter until its command deadline, and nothing bounded how many requests
 * could be sitting there. A command deadline caps one command; it says
 * nothing about how many requests are holding one. The ingress gate is the
 * only thing in this path that can refuse while the dependency behind it is
 * still deciding, and it covers `navigation` too, which had no gate at all.
 *
 * A wrapper rather than middleware because middleware cannot see the Payload
 * instance, and the counting has to be attached to the pool that serves this
 * request.
 */
export async function publicRead(
  options: {
    req: Pick<NextRequest, 'headers'> & { signal?: AbortSignal | null }
    scope: PublicReadScope
    payload: PayloadLike
  },
  handle: () => Promise<NextResponse>,
): Promise<NextResponse> {
  const signal = options.req.signal ?? undefined

  try {
    return await admitPublicWork(
      'ingress',
      async () => {
        const limit = await checkPublicReadRateLimit(options.req.headers, options.scope)
        if (!limit.allowed) return publicReadRateLimitResponse(limit.retryAfterSeconds)

        const work = SCOPE_WORK[options.scope]
        const admitted =
          work === 'route' || work === 'none' ? handle : () => admitPublicWork(work, handle, signal)

        const response = await withPublicReadDiagnostics(options.payload, options.req.headers, admitted)
        return withPublicCacheHeaders(response)
      },
      signal,
    )
  } catch (error) {
    if (error instanceof AdmissionRefused) return overloadedResponse(error)
    if (isDatabaseUnavailable(error)) {
      logger.warn('Public read: database unavailable', {
        scope: options.scope,
        error: error instanceof Error ? error.message : String(error),
      })
      return databaseUnavailableResponse()
    }
    throw error
  }
}
