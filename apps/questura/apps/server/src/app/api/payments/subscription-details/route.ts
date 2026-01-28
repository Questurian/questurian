import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, getCorsHeaders, handleCorsOptions } from '@/auth/lib/auth-middleware'
import { getStripeSubscriptionDetails } from '@/payments/lib/payment-service'

export async function GET(req: NextRequest) {
  const corsHeaders = getCorsHeaders(req)

  try {
    // 1. Authenticate the user
    const authResult = await authenticateRequest(req)

    if (authResult.error) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status, headers: corsHeaders }
      )
    }

    const user = authResult.user!

    // 2. Check if user has a subscription
    if (!user.stripeSubscriptionId) {
      return NextResponse.json(
        { error: 'No subscription found' },
        { status: 404, headers: corsHeaders }
      )
    }

    // 3. Get subscription details from Stripe
    const subscriptionDetails = await getStripeSubscriptionDetails(user.stripeSubscriptionId)

    if (!subscriptionDetails) {
      return NextResponse.json(
        { error: 'Failed to retrieve subscription details' },
        { status: 500, headers: corsHeaders }
      )
    }

    // 4. Return subscription information
    return NextResponse.json(
      {
        subscriptionId: user.stripeSubscriptionId,
        status: subscriptionDetails.status,
        currentPeriodEnd: subscriptionDetails.currentPeriodEnd,
        currentPeriodStart: subscriptionDetails.currentPeriodStart,
        cancelAtPeriodEnd: subscriptionDetails.cancelAtPeriodEnd,
        // Include user's internal subscription status
        internalStatus: user.subscriptionStatus,
        renewsAt: user.subscriptionRenewsAt,
        membershipExpiration: user.membershipExpiration
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