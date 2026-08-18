import { NextRequest, NextResponse } from 'next/server'
import { forbiddenOriginResponse, getCorsHeaders, handleCorsOptions } from '@/shared/utils/cors'
import { reactivateUserSubscription } from '@/payments/lib/payment-service'
import { requireVisitorPrincipal } from '@/features/visitor-auth/lib/current-principal'
import { checkPaymentsRateLimit, checkPaymentsVisitorRateLimit, paymentsRateLimitResponse } from '@/payments/lib/payments-rate-limit'

export async function POST(req: NextRequest) {
  const corsHeaders = getCorsHeaders(req)
  const blocked = forbiddenOriginResponse(req, corsHeaders)
  if (blocked) return blocked

  const rateLimit = await checkPaymentsRateLimit(req.headers, 'reactivate')
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
    const visitorLimit = await checkPaymentsVisitorRateLimit(String(visitor.id), 'reactivate')
    if (!visitorLimit.allowed) {
      return paymentsRateLimitResponse(corsHeaders, visitorLimit.retryAfterSeconds)
    }

    const result = await reactivateUserSubscription(String(visitor.id))

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
        renewsAt: result.renewsAt
      },
      { headers: corsHeaders }
    )

  } catch (error) {
    console.error('Error in reactivate subscription endpoint:', error)
    return NextResponse.json(
      { error: 'Failed to reactivate subscription' },
      { status: 500, headers: corsHeaders }
    )
  }
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}
