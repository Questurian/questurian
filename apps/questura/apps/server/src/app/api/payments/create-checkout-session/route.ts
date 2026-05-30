import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/payments/lib/stripe'
import { APP_CONFIG, APP_URLS } from '@/shared/config'
import { getCorsHeaders, handleCorsOptions } from '@/shared/utils/cors'
import { requireVisitorPrincipal } from '@/features/visitor-auth/lib/current-principal'
import {
  findVisitorProfileByAuthUserId,
  updateVisitorProfileByAuthUserId,
} from '@/features/visitor-auth/lib/visitor-profile'

export async function POST(req: NextRequest) {
  const corsHeaders = getCorsHeaders(req)

  try {
    const authResult = await requireVisitorPrincipal(req.headers, { requireVerified: true })

    if (authResult.error) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status, headers: corsHeaders }
      )
    }

    const visitor = authResult.principal!
    const visitorAuthUserId = String(visitor.id)
    const profile = await findVisitorProfileByAuthUserId(visitorAuthUserId)

    // 2. Validate required user data
    if (!visitor.email) {
      return NextResponse.json(
        { error: 'Email required for subscription' },
        { status: 400, headers: corsHeaders }
      )
    }

    // 3. Parse request body for affiliate referral ID (if feature enabled)
    let referralId: string | null = null
    if (APP_CONFIG.features.endorselyAffiliates) {
      try {
        const body = await req.json()
        referralId = body.referralId || null
      } catch {
        // Body is optional, continue without it
      }

      // Log affiliate conversion for debugging
      if (referralId) {
        console.log(`[Affiliate] Visitor ${visitor.email} referred by ${referralId}`)
      }
    }

    // 4. Get or create Stripe customer
    let stripeCustomerId = profile?.stripeCustomerId ?? null

    if (!stripeCustomerId) {
      console.log('Creating new Stripe customer for visitor:', visitorAuthUserId)

      const customer = await stripe.customers.create({
        email: visitor.email,
        name: visitor.firstName && visitor.lastName ? `${visitor.firstName} ${visitor.lastName}` : visitor.email,
        metadata: {
          visitorAuthUserId,
          visitorProfileId: String(visitor.profileId ?? ''),
        }
      })

      stripeCustomerId = customer.id
      console.log('Created Stripe customer:', stripeCustomerId)

      await updateVisitorProfileByAuthUserId(visitorAuthUserId, { stripeCustomerId })

      console.log('Updated VisitorProfile with stripeCustomerId')
    } else {
      console.log('Using existing Stripe customer:', stripeCustomerId)
    }

    // 5. Check if user already has an active subscription
    if (profile?.subscriptionStatus === 'active' && profile?.stripeSubscriptionId) {
      return NextResponse.json(
        { error: 'Visitor already has an active subscription' },
        { status: 400, headers: corsHeaders }
      )
    }

    // 6. Build metadata including optional affiliate referral
    const metadata: Record<string, string> = {
      visitorAuthUserId,
      visitorEmail: visitor.email,
    }

    if (referralId) {
      metadata.endorsely_referral = referralId
    }

    // 7. Create checkout session for subscription
    console.log('Creating checkout session with price ID:', APP_CONFIG.stripe.priceId)

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'subscription', // KEY: subscription mode, not payment
      line_items: [{
        price: APP_CONFIG.stripe.priceId, // Your recurring price ID
        quantity: 1
      }],
      success_url: APP_URLS.frontendUrl('/subscription/success?session_id={CHECKOUT_SESSION_ID}'),
      cancel_url: APP_URLS.frontendUrl('/subscription/cancel'),
      metadata,
      allow_promotion_codes: true, // Optional: allow discount codes
      billing_address_collection: 'auto', // Optional: collect billing address
      subscription_data: {
        metadata // Also add metadata to subscription object
      }
    })

    console.log('Created checkout session:', session.id)

    return NextResponse.json(
      { sessionId: session.id, url: session.url },
      { headers: corsHeaders }
    )

  } catch (error) {
    console.error('Error creating checkout session:', error)
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500, headers: corsHeaders }
    )
  }
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}
