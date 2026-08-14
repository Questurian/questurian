import { NextRequest, NextResponse } from 'next/server'
import { getStripeSubscriptionDetails } from '@/payments/lib/payment-service'
import { getCorsHeaders, handleCorsOptions } from '@/shared/utils/cors'
import { requireVisitorPrincipal } from '@/features/visitor-auth/lib/current-principal'
import { findVisitorProfileByAuthUserId } from '@/features/visitor-auth/lib/visitor-profile'

export async function GET(req: NextRequest) {
  const corsHeaders = getCorsHeaders(req)

  try {
    const authResult = await requireVisitorPrincipal(req.headers)

    if (authResult.error) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status, headers: corsHeaders }
      )
    }

    const visitor = authResult.principal!
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
