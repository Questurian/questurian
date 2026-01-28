import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, getCorsHeaders, handleCorsOptions } from '@/auth/lib/auth-middleware'
import { stripe } from '@/payments/lib/stripe'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { APP_CONFIG, APP_URLS } from '@/shared/config'

export async function POST(req: NextRequest) {
  const corsHeaders = getCorsHeaders(req)

  try {
    // 1. Authenticate the user and require email verification
    const authResult = await authenticateRequest(req, { requireEmailVerification: true })

    if (authResult.error) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status, headers: corsHeaders }
      )
    }

    const user = authResult.user!

    // GUARD: Staff members cannot create checkout sessions (they have free access)
    if (user.role === 'admin' || user.role === 'editor') {
      console.log('Preventing checkout session for staff member:', {
        userId: user.id,
        email: user.email,
        role: user.role
      })
      return NextResponse.json(
        { error: 'Staff members do not require subscriptions' },
        { status: 403, headers: corsHeaders }
      )
    }

    // 2. Validate required user data
    if (!user.email) {
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
        console.log(`[Affiliate] User ${user.email} referred by ${referralId}`)
      }
    }

    // 4. Get or create Stripe customer
    let stripeCustomerId = user.stripeCustomerId

    if (!stripeCustomerId) {
      console.log('Creating new Stripe customer for user:', user.id)

      const customer = await stripe.customers.create({
        email: user.email,
        name: user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.email,
        metadata: {
          userId: user.id,
          payloadUserId: user.id // Additional field for clarity
        }
      })

      stripeCustomerId = customer.id
      console.log('Created Stripe customer:', stripeCustomerId)

      // Update user record with Stripe customer ID
      const payload = await getPayload({ config })
      await payload.update({
        collection: 'users',
        id: user.id,
        data: { stripeCustomerId }
      })

      console.log('Updated user record with stripeCustomerId')
    } else {
      console.log('Using existing Stripe customer:', stripeCustomerId)
    }

    // 5. Check if user already has an active subscription
    if (user.subscriptionStatus === 'active' && user.stripeSubscriptionId) {
      return NextResponse.json(
        { error: 'User already has an active subscription' },
        { status: 400, headers: corsHeaders }
      )
    }

    // 6. Build metadata including optional affiliate referral
    const metadata: Record<string, string> = {
      userId: String(user.id),
      userEmail: user.email
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