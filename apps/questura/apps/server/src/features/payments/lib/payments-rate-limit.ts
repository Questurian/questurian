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
 *
 * Two buckets, applied in order:
 * 1. IP, before auth. Cheap flood bound so a NAT office is not one 8-slot
 *    bucket, and unauthenticated hammering never reaches session lookup.
 * 2. Visitor, after login. The Stripe-budget bound that used to live on IP.
 *    Plans has no visitor bucket: it is public.
 */

const WINDOW_SECONDS = 60

export const PAYMENTS_RATE_LIMITS = {
  checkout: { ip: 40, visitor: 8 },
  portal: { ip: 40, visitor: 8 },
  cancel: { ip: 40, visitor: 8 },
  reactivate: { ip: 40, visitor: 8 },
  details: { ip: 60, visitor: 20 },
  plans: { ip: 30 },
} as const

export type PaymentsRateLimitScope = keyof typeof PAYMENTS_RATE_LIMITS
export type AuthenticatedPaymentsScope = Exclude<PaymentsRateLimitScope, 'plans'>

export type PaymentsRateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number }

async function checkCounter(
  key: string,
  limit: number,
  scope: PaymentsRateLimitScope
): Promise<PaymentsRateLimitResult> {
  let counter
  try {
    counter = await incrementCounter(key, WINDOW_SECONDS)
  } catch (error) {
    logger.error('Payments rate limit unavailable; denying', {
      scope,
      error: error instanceof Error ? error.message : String(error),
    })
    return { allowed: false, retryAfterSeconds: WINDOW_SECONDS }
  }

  if (counter.count > limit) {
    return { allowed: false, retryAfterSeconds: counter.ttlSeconds }
  }

  return { allowed: true }
}

export async function checkPaymentsRateLimit(
  headers: Headers,
  scope: PaymentsRateLimitScope
): Promise<PaymentsRateLimitResult> {
  const ipKey = `payments:rate-limit:${scope}:ip:${hashIdentifier(getClientIp(headers))}`
  return checkCounter(ipKey, PAYMENTS_RATE_LIMITS[scope].ip, scope)
}

export async function checkPaymentsVisitorRateLimit(
  visitorId: string,
  scope: AuthenticatedPaymentsScope
): Promise<PaymentsRateLimitResult> {
  const visitorKey = `payments:rate-limit:${scope}:visitor:${hashIdentifier(visitorId)}`
  return checkCounter(visitorKey, PAYMENTS_RATE_LIMITS[scope].visitor, scope)
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
