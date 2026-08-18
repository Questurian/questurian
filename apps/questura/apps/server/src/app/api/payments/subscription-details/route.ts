import { NextRequest, NextResponse } from 'next/server'
import { getStripeSubscriptionDetails } from '@/payments/lib/payment-service'
import { forbiddenOriginResponse, getPrivateCorsHeaders, handleCorsOptions } from '@/shared/utils/cors'
import { requireVisitorPrincipal } from '@/features/visitor-auth/lib/current-principal'
import { findVisitorProfileByAuthUserId } from '@/features/visitor-auth/lib/visitor-profile'
import { checkPaymentsRateLimit, checkPaymentsVisitorRateLimit, paymentsRateLimitResponse } from '@/payments/lib/payments-rate-limit'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  // Every response below carries these, the 404 included: "no subscription
  // found" is itself a fact about one visitor's billing, not a shared answer.
  const corsHeaders = getPrivateCorsHeaders(req)

  // The only payments route that skipped this. Being a GET with no reflected
  // CORS header makes it hard to read cross-origin, but "hard to exploit" is
  // not the guarantee the other five give: this one authenticates from an
  // ambient cookie and answers with the visitor's billing state. The rule is
  // that a cookie-authenticated payments route states its allowed origins,
  // rather than each route being argued about separately.
  const blocked = forbiddenOriginResponse(req, corsHeaders)
  if (blocked) return blocked

  const rateLimit = await checkPaymentsRateLimit(req.headers, 'details')
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
    const visitorLimit = await checkPaymentsVisitorRateLimit(String(visitor.id), 'details')
    if (!visitorLimit.allowed) {
      return paymentsRateLimitResponse(corsHeaders, visitorLimit.retryAfterSeconds)
    }

    const profile = await findVisitorProfileByAuthUserId(String(visitor.id))

    if (!profile?.stripeSubscriptionId) {
      return NextResponse.json(
        { error: 'No subscription found' },
        { status: 404, headers: corsHeaders }
      )
    }

    // 3. Get subscription details from Stripe
    const subscriptionDetails = await getStripeSubscriptionDetails(profile.stripeSubscriptionId)

    if (!subscriptionDetails) {
      return NextResponse.json(
        { error: 'Failed to retrieve subscription details' },
        { status: 500, headers: corsHeaders }
      )
    }

    // 4. Return subscription information
    return NextResponse.json(
      {
        subscriptionId: profile.stripeSubscriptionId,
        status: subscriptionDetails.status,
        currentPeriodEnd: subscriptionDetails.currentPeriodEnd,
        currentPeriodStart: subscriptionDetails.currentPeriodStart,
        cancelAtPeriodEnd: subscriptionDetails.cancelAtPeriodEnd,
        // Include the mirrored state this server holds. One date carries both
        // meanings: when access ends if the subscription is cancelling, when
        // the next charge falls due if it is not (ADR-0008).
        internalStatus: profile.subscriptionStatus,
        paidThroughAt: profile.paidThroughAt,
        dunningGraceUntil: profile.dunningGraceUntil
      },
      { headers: corsHeaders }
    )

  } catch (error) {
    console.error('Error in subscription details endpoint:', error)
    return NextResponse.json(
      { error: 'Failed to get subscription details' },
      { status: 500, headers: corsHeaders }
    )
  }
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}
