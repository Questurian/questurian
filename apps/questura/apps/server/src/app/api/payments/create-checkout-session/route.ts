import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/payments/lib/stripe'
import { resolveStripeCustomerForVisitor } from '@/payments/lib/customer-linkage'
import { APP_CONFIG, APP_URLS } from '@/shared/config'
import { getCorsHeaders, handleCorsOptions } from '@/shared/utils/cors'
import { requireVisitorPrincipal } from '@/features/visitor-auth/lib/current-principal'
import { isPlanId, priceIdForPlan, type PlanId } from '@/payments/lib/membership-plans'
import {
  findVisitorProfileByAuthUserId,
  updateVisitorProfileByAuthUserId,
} from '@/features/visitor-auth/lib/visitor-profile'

// Referral IDs are opaque tokens from the Endorsely script; anything else in
// the body must not reach Stripe metadata. Stripe caps metadata values at 500
// chars — bound well below that.
const REFERRAL_ID_MAX_LENGTH = 100

function sanitizeReferralId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > REFERRAL_ID_MAX_LENGTH) {
    return null
  }
  return trimmed
}

export async function POST(req: NextRequest) {
  const corsHeaders = getCorsHeaders(req)

  try {
    // Deliberately not requiring a verified email. Verification before checkout
    // costs the sale at peak intent for a rare failure (a mistyped signup
    // address). Stripe collects and confirms its own email during checkout, and
    // `checkout.session.completed` records it as `billingEmail` whenever it
    // differs from the account address — so a typo stays recoverable without
    // blocking anyone.
    const authResult = await requireVisitorPrincipal(req.headers)

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

    // 3. Parse the request body once: it carries the chosen plan, and the
    // affiliate referral when that feature is on. Reading it only for referrals
    // would silently drop the plan whenever the flag is off.
    let body: { plan?: unknown; referralId?: unknown } = {}
    try {
      body = await req.json()
    } catch {
      // Body is optional; defaults below apply.
    }

    const plan: PlanId = isPlanId(body?.plan) ? body.plan : 'monthly'
    const priceId = priceIdForPlan(plan)

    if (!priceId) {
      return NextResponse.json(
        { error: 'That plan is not available right now.' },
        { status: 400, headers: corsHeaders }
      )
    }

    let referralId: string | null = null
    if (APP_CONFIG.features.endorselyAffiliates) {
      referralId = sanitizeReferralId(body?.referralId)

      // Log affiliate conversion for debugging
      if (referralId) {
        console.log(`[Affiliate] Visitor referred by ${referralId}`)
      }
    }

    // 4. Get or create Stripe customer
    let stripeCustomerId = profile?.stripeCustomerId ?? null

    if (!stripeCustomerId) {
      const resolved = await resolveStripeCustomerForVisitor({
        email: visitor.email,
        visitorAuthUserId,
        visitorProfileId: visitor.profileId,
        name:
          visitor.firstName && visitor.lastName
            ? `${visitor.firstName} ${visitor.lastName}`
            : visitor.email,
      })

      stripeCustomerId = resolved.customerId
      console.log(
        resolved.created
          ? 'Created Stripe customer:'
          : 'Recovered this visitor\'s existing Stripe customer:',
        stripeCustomerId
      )

      // Re-link the profile so the lookup above succeeds next time. A missing
      // profile row means nothing stores the linkage, and the payment that
      // follows would land on a customer no profile points at — worth shouting
      // about, since only the logs can connect the charge back to the visitor.
      const linked = await updateVisitorProfileByAuthUserId(visitorAuthUserId, { stripeCustomerId })

      if (!linked) {
        console.error(
          'Could not link Stripe customer to a visitor profile; no profile row for auth user',
          { visitorAuthUserId, stripeCustomerId }
        )
      }
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
    console.log('Creating checkout session', { plan, priceId })

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'subscription', // KEY: subscription mode, not payment
      line_items: [{
        price: priceId,
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
