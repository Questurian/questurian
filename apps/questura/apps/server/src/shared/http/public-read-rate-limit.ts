import { NextResponse } from 'next/server'

import { getClientIp, hashIdentifier, incrementCounter } from '@/shared/lib/rate-limit-counter'
import { logger } from '@/shared/utils/logger'

/**
 * Per-IP limits for the expensive anonymous reads.
 *
 * The frontend caches these for an hour with tag invalidation, so ordinary
 * browsing rarely reaches the backend at all. Direct API traffic does: a
 * crawler following `?page=` links, a scraper walking every author, a search
 * box hit in a loop. None of those are cached by anything, and search and the
 * feeds are the most expensive reads in the app.
 *
 * Keyed by IP only. Keying by account would mean resolving a session first,
 * which is database work the limit exists to bound, and these routes are
 * anonymous anyway. `getClientIp` reads the one header the configured proxy
 * overwrites — see `trusted-proxy.ts` for why it is not a search across
 * several.
 *
 * Fail-open, unlike the payments and `articles/full` limits
 * -------------------------------------------------------
 * Those deny when the counter backend is unavailable, because the thing behind
 * them is money and paid content and a denied request is a retry. These routes
 * serve public pages to anonymous readers. Denying every reader because Redis
 * blinked turns a cache outage into a site outage, and an hour of unbounded
 * search is a smaller failure than that. The bound each query carries on its
 * own — the search index, the paging window, the page read budget — is what
 * makes that trade acceptable; the limiter is defence in depth, not the only
 * defence. A failure is logged at error level so it is visible either way.
 */

const WINDOW_SECONDS = 60

export const PUBLIC_READ_RATE_LIMITS = {
  /** Ranked full-text search. The most expensive read per request. */
  search: 60,
  /** A location's combined feed, one page at a time. Crawler-facing. */
  locationFeed: 120,
  /** A single-collection index. Cheapest of the three; still paged. */
  articleIndex: 120,
  /** An author's combined feed plus the visibility counts. */
  authorPage: 60,
  /** A curated city page: dozens of populated document reads. */
  locationHomepage: 120,
} as const

export type PublicReadScope = keyof typeof PUBLIC_READ_RATE_LIMITS

export type PublicReadRateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number }

export async function checkPublicReadRateLimit(
  headers: Headers,
  scope: PublicReadScope,
): Promise<PublicReadRateLimitResult> {
  const key = `public-read:rate-limit:${scope}:ip:${hashIdentifier(getClientIp(headers))}`

  let counter
  try {
    counter = await incrementCounter(key, WINDOW_SECONDS)
  } catch (error) {
    logger.error('Public read rate limit unavailable; allowing', {
      scope,
      error: error instanceof Error ? error.message : String(error),
    })
    return { allowed: true }
  }

  if (counter.count > PUBLIC_READ_RATE_LIMITS[scope]) {
    return { allowed: false, retryAfterSeconds: counter.ttlSeconds }
  }

  return { allowed: true }
}

export function publicReadRateLimitResponse(retryAfterSeconds: number) {
  const response = NextResponse.json(
    { message: 'Too many requests. Please try again shortly.' },
    { status: 429 },
  )
  response.headers.set('Retry-After', String(retryAfterSeconds))
  // A 429 is about this caller right now; caching it would apply it to
  // everyone sharing the cache.
  response.headers.set('Cache-Control', 'no-store')
  return response
}
