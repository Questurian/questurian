import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/payments/lib/stripe'
import { APP_CONFIG, APP_URLS } from '@/shared/config'
import { forbiddenOriginResponse, getCorsHeaders, handleCorsOptions } from '@/shared/utils/cors'
import { requireVisitorPrincipal } from '@/features/visitor-auth/lib/current-principal'
import { findVisitorProfileByAuthUserId } from '@/features/visitor-auth/lib/visitor-profile'

export async function POST(req: NextRequest) {
  const corsHeaders = getCorsHeaders(req)
  const blocked = forbiddenOriginResponse(req, corsHeaders)
  if (blocked) return blocked

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

    // 2. Validate user has a Stripe customer ID
    if (!profile?.stripeCustomerId) {
      return NextResponse.json(
        { error: 'No Stripe customer found. Please create a subscription first.' },
        { status: 400, headers: corsHeaders }
      )
    }

    // 3. Create a Stripe Customer Portal session
    const returnUrl = APP_CONFIG.stripe.portalReturnUrl || APP_URLS.frontendUrl('/account')

    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripeCustomerId,
      return_url: returnUrl // Where user returns after managing billing
    })

    console.log('Created Customer Portal session:', session.id)

    // 4. Return the portal URL to redirect the user
    return NextResponse.json(
      { url: session.url },
      { headers: corsHeaders }
    )

  } catch (error) {
    console.error('Error creating Customer Portal session:', error)
    return NextResponse.json(
      { error: 'Failed to create billing portal session' },
      { status: 500, headers: corsHeaders }
    )
  }
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}
