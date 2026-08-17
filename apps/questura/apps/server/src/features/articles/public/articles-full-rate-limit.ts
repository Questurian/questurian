import { NextResponse } from 'next/server'

import {
  getClientIp,
  hashIdentifier,
  incrementCounter,
} from '@/shared/lib/rate-limit-counter'
import { logger } from '@/shared/utils/logger'

/**
 * Throttle for `GET /api/public/articles/full`.
 *
 * This is the only public article route that authenticates from a cookie and
 * returns the unlocked paid body. The cached `/api/public/articles/*` routes
 * are ISR and shared; this one is per-caller and hits Payload at depth 2.
 * Unbounded callers can scrape every gated article or burn that read budget.
 *
 * Keyed by IP alone. Keying by account would mean resolving the session first,
 * which is the database work the throttle exists to bound.
 */

const WINDOW_SECONDS = 60
export const ARTICLES_FULL_RATE_LIMIT = 30

export type ArticlesFullRateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number }

export async function checkArticlesFullRateLimit(
  headers: Headers
): Promise<ArticlesFullRateLimitResult> {
  const ipKey = `articles:rate-limit:full:ip:${hashIdentifier(getClientIp(headers))}`

  let counter
  try {
    counter = await incrementCounter(ipKey, WINDOW_SECONDS)
  } catch (error) {
    logger.error('Articles full rate limit unavailable; denying', {
      error: error instanceof Error ? error.message : String(error),
    })
    return { allowed: false, retryAfterSeconds: WINDOW_SECONDS }
  }

  if (counter.count > ARTICLES_FULL_RATE_LIMIT) {
    return { allowed: false, retryAfterSeconds: counter.ttlSeconds }
  }

  return { allowed: true }
}

export function articlesFullRateLimitResponse(
  corsHeaders: HeadersInit,
  retryAfterSeconds: number
) {
  const response = NextResponse.json(
    { error: 'Too many attempts. Please try again shortly.' },
    { status: 429, headers: corsHeaders }
  )
  response.headers.set('Retry-After', String(retryAfterSeconds))
  return response
}
