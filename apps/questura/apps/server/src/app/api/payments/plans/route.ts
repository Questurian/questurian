import { NextRequest, NextResponse } from 'next/server'
import { getCorsHeaders, handleCorsOptions } from '@/shared/utils/cors'
import { getMembershipPlans } from '@/payments/lib/membership-plans'
import { checkPaymentsRateLimit, paymentsRateLimitResponse } from '@/payments/lib/payments-rate-limit'
import { APP_CONFIG } from '@/shared/config'
import { logger } from '@/shared/utils/logger'

/**
 * Catalog amounts ($12.99 / $79.99), not the laptop $0.50 test charge.
 * Checkout uses the host Stripe price ID. See docs/membership-pricing.md.
 *
 * `taxAtCheckout` says whether checkout adds sales tax/VAT, so /join can
 * promise tax only when it is really charged. True only while Stripe Managed
 * Payments is on (`STRIPE_MANAGED_PAYMENTS`); with it off, checkout charges no
 * tax at all.
 */
export async function GET(req: NextRequest) {
  const corsHeaders = getCorsHeaders(req)

  const rateLimit = await checkPaymentsRateLimit(req.headers, 'plans')
  if (!rateLimit.allowed) {
    return paymentsRateLimitResponse(corsHeaders, rateLimit.retryAfterSeconds)
  }

  try {
    const plans = await getMembershipPlans()

    const taxAtCheckout = APP_CONFIG.features.stripeManagedPayments === true

    return NextResponse.json({ plans, taxAtCheckout }, { headers: corsHeaders })
  } catch (error) {
    logger.error('Error resolving membership plans', {
      error: error instanceof Error ? error.message : String(error),
    })

    return NextResponse.json(
      { error: 'Failed to load membership plans' },
      { status: 500, headers: corsHeaders }
    )
  }
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}
