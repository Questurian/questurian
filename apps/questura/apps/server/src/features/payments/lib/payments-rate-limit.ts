import { NextResponse } from 'next/server'

import {
  getClientIp,
  hashIdentifier,
  incrementCounter,
} from '@/shared/lib/rate-limit-counter'
import { logger } from '@/shared/utils/logger'

/**
 * Throttle for `/api/payments/*` except the Stripe webhook.
 *
 * Checkout, portal, cancel, and reactivate each call Stripe. An unbounded
 * visitor can burn the shared Stripe rate budget that webhook processing
 * also uses. Plans is public and was two Stripe reads per unauthenticated
 * hit. Webhooks are excluded: Stripe retries must not 429.
 */

const WINDOW_SECONDS = 60

export const PAYMENTS_RATE_LIMITS = {
  checkout: 8,
  portal: 8,
  cancel: 8,
  reactivate: 8,
  details: 20,
  plans: 30,
} as const

export type PaymentsRateLimitScope = keyof typeof PAYMENTS_RATE_LIMITS

export type PaymentsRateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number }

export async function checkPaymentsRateLimit(
  headers: Headers,
  scope: PaymentsRateLimitScope
): Promise<PaymentsRateLimitResult> {
  const ipKey = `payments:rate-limit:${scope}:ip:${hashIdentifier(getClientIp(headers))}`

  let counter
  try {
    counter = await incrementCounter(ipKey, WINDOW_SECONDS)
  } catch (error) {
    logger.error('Payments rate limit unavailable; denying', {
      scope,
      error: error instanceof Error ? error.message : String(error),
    })
    return { allowed: false, retryAfterSeconds: WINDOW_SECONDS }
  }

  if (counter.count > PAYMENTS_RATE_LIMITS[scope]) {
    return { allowed: false, retryAfterSeconds: counter.ttlSeconds }
  }

  return { allowed: true }
}

export function paymentsRateLimitResponse(
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
