import { NextRequest, NextResponse } from 'next/server'
import { getCorsHeaders, handleCorsOptions } from '@/shared/utils/cors'
import { getMembershipPlans } from '@/payments/lib/membership-plans'
import { checkPaymentsRateLimit, paymentsRateLimitResponse } from '@/payments/lib/payments-rate-limit'
import { logger } from '@/shared/utils/logger'

/**
 * Catalog amounts ($12.99 / $79.99), not the laptop $0.50 test charge.
 * Checkout uses the host Stripe price ID. See docs/membership-pricing.md.
 */
export async function GET(req: NextRequest) {
  const corsHeaders = getCorsHeaders(req)

  const rateLimit = await checkPaymentsRateLimit(req.headers, 'plans')
  if (!rateLimit.allowed) {
    return paymentsRateLimitResponse(corsHeaders, rateLimit.retryAfterSeconds)
  }

  try {
    const plans = await getMembershipPlans()

    return NextResponse.json({ plans }, { headers: corsHeaders })
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
