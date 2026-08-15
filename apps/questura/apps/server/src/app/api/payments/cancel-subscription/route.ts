import { NextRequest, NextResponse } from 'next/server'
import { forbiddenOriginResponse, getCorsHeaders, handleCorsOptions } from '@/shared/utils/cors'
import { cancelUserSubscription } from '@/payments/lib/payment-service'
import { requireVisitorPrincipal } from '@/features/visitor-auth/lib/current-principal'
import { checkPaymentsRateLimit, paymentsRateLimitResponse } from '@/payments/lib/payments-rate-limit'

export async function POST(req: NextRequest) {
  const corsHeaders = getCorsHeaders(req)
  const blocked = forbiddenOriginResponse(req, corsHeaders)
  if (blocked) return blocked

  const rateLimit = await checkPaymentsRateLimit(req.headers, 'cancel')
  if (!rateLimit.allowed) {
    return paymentsRateLimitResponse(corsHeaders, rateLimit.retryAfterSeconds)
  }

  try {
    const authResult = await requireVisitorPrincipal(req.headers)

    if (authResult.error) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status, headers: corsHeaders }
      )
    }

    const visitor = authResult.principal!
    const result = await cancelUserSubscription(String(visitor.id))

    if (!result.success) {
      return NextResponse.json(
        { error: result.message },
        { status: 400, headers: corsHeaders }
      )
    }

    // 3. Return success response
    return NextResponse.json(
      {
        success: true,
        message: result.message,
        membershipExpiresAt: result.membershipExpiresAt
      },
      { headers: corsHeaders }
    )

  } catch (error) {
    console.error('Error in cancel subscription endpoint:', error)
    return NextResponse.json(
      { error: 'Failed to cancel subscription' },
      { status: 500, headers: corsHeaders }
    )
  }
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}
