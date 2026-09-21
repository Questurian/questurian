import { NextResponse, type NextRequest } from 'next/server'

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
const SCOPE_WORK: Record<PublicReadScope, PublicWorkClass | 'route'> = {
  search: 'query',
  locationFeed: 'query',
  articleIndex: 'query',
  authorPage: 'query',
  locationHomepage: 'route',
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
 * The four things every expensive public read needs, in the order they have
 * to happen.
 *
 * 1. Refuse the caller who is asking too often, before any database work.
 * 2. Admit the work only if the process has room for it (`admission.ts`).
 * 3. Count the work the request actually does.
 * 4. Say how long the answer may be reused.
 *
 * A wrapper rather than middleware because middleware cannot see the Payload
 * instance, and the counting has to be attached to the pool that serves this
 * request.
 */
export async function publicRead(
  options: { req: NextRequest; scope: PublicReadScope; payload: PayloadLike },
  handle: () => Promise<NextResponse>,
): Promise<NextResponse> {
  const limit = await checkPublicReadRateLimit(options.req.headers, options.scope)
  if (!limit.allowed) return publicReadRateLimitResponse(limit.retryAfterSeconds)

  const work = SCOPE_WORK[options.scope]
  const admitted =
    work === 'route' ? handle : () => admitPublicWork(work, handle, options.req.signal)

  try {
    const response = await withPublicReadDiagnostics(options.payload, options.req.headers, admitted)
    return withPublicCacheHeaders(response)
  } catch (error) {
    if (error instanceof AdmissionRefused) return overloadedResponse(error)
    throw error
  }
}
