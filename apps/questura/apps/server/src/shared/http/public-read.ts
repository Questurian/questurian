import type { NextRequest, NextResponse } from 'next/server'

import { withPublicReadDiagnostics } from '@/shared/observability/public-read'

import { withPublicCacheHeaders } from './public-cache-headers'
import {
  checkPublicReadRateLimit,
  publicReadRateLimitResponse,
  type PublicReadScope,
} from './public-read-rate-limit'

type PayloadLike = { db?: { pool?: unknown } }

/**
 * The three things every expensive public read needs, in the order they have
 * to happen.
 *
 * 1. Refuse the caller who is asking too often, before any database work.
 * 2. Count the work the request actually does.
 * 3. Say how long the answer may be reused.
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

  const response = await withPublicReadDiagnostics(options.payload, options.req.headers, handle)
  return withPublicCacheHeaders(response)
}
