import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/payments/lib/stripe'
import { resolveStripeCustomerForVisitor, findLiveSubscription } from '@/payments/lib/customer-linkage'
import { APP_CONFIG, APP_URLS } from '@/shared/config'
import { forbiddenOriginResponse, getCorsHeaders, handleCorsOptions } from '@/shared/utils/cors'
import { requireVisitorPrincipal } from '@/features/visitor-auth/lib/current-principal'
import { isPlanId, priceIdForPlan, type PlanId } from '@/payments/lib/membership-plans'
import { checkPaymentsRateLimit, paymentsRateLimitResponse } from '@/payments/lib/payments-rate-limit'
import { safeReturnPath } from '@/payments/lib/safe-return-path'
import { checkoutIdempotencyKey } from '@/payments/lib/checkout-idempotency'
import {
  findVisitorProfileByAuthUserId,
  updateVisitorProfileByAuthUserId,
} from '@/features/visitor-auth/lib/visitor-profile'
import { logger } from '@/shared/utils/logger'

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
  const blocked = forbiddenOriginResponse(req, corsHeaders)
  if (blocked) return blocked

  const rateLimit = await checkPaymentsRateLimit(req.headers, 'checkout')
  if (!rateLimit.allowed) {
    return paymentsRateLimitResponse(corsHeaders, rateLimit.retryAfterSeconds)
  }

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
    let body: { plan?: unknown; referralId?: unknown; returnTo?: unknown } = {}
    try {
      body = await req.json()
    } catch {
      // Body is optional; defaults below apply.
    }

    const plan: PlanId = isPlanId(body?.plan) ? body.plan : 'monthly'
    const priceId = priceIdForPlan(plan)

    // Where to send the buyer once the success page has confirmed entitlement.
    // Attacker-controlled by definition and destined for a URL Stripe redirects
    // a browser to, so it is validated here rather than trusted from the client.
    const returnTo = safeReturnPath(body?.returnTo)

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
        logger.info('Checkout includes an affiliate referral')
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
      logger.info(
        resolved.created
          ? 'Created Stripe customer for visitor'
          : 'Reused existing Stripe customer for visitor'
      )

      // Re-link the profile so the lookup above succeeds next time. A missing
      // profile row means nothing stores the linkage, and the payment that
      // follows would land on a customer no profile points at — worth shouting
      // about, since only the logs can connect the charge back to the visitor.
      const linked = await updateVisitorProfileByAuthUserId(visitorAuthUserId, { stripeCustomerId })

      if (!linked) {
        logger.error(
          'Could not link Stripe customer to a visitor profile; no profile row for auth user'
        )
      }
    } else {
      logger.info('Using existing Stripe customer on the visitor profile')
    }

    // 5. Refuse a second live subscription on this customer. Local
    // `subscriptionStatus === 'active'` missed past_due / unpaid, so a visitor
    // being dunned could open another Checkout and get charged twice.
    const liveSubscription = await findLiveSubscription(stripeCustomerId)
    if (liveSubscription) {
      return NextResponse.json(
        { error: 'Visitor already has an active subscription' },
        { status: 400, headers: corsHeaders }
      )
    }

    // 6. Build metadata including optional affiliate referral.
    //
    // `visitorAuthUserId` is the only identity Stripe needs: it is what
    // ownership is resolved by everywhere (see `resolveStripeCustomerForVisitor`),
    // and the address itself already lives on the Stripe customer. Carrying the
    // email as well only copies PII into a field that surfaces in Dashboard
    // exports, event payloads, and webhook logs.
    const metadata: Record<string, string> = {
      visitorAuthUserId,
    }

    if (referralId) {
      metadata.endorsely_referral = referralId
    }

    // 7. Create checkout session for subscription
    logger.info('Creating checkout session', { plan })

    const successUrl = APP_URLS.frontendUrl(
      `/subscription/success?session_id={CHECKOUT_SESSION_ID}&returnTo=${encodeURIComponent(returnTo)}`,
    )
    const cancelUrl = APP_URLS.frontendUrl('/subscription/cancel')

    // Off unless deliberately enabled: `allow_promotion_codes` opens *every*
    // active code in the Stripe account to anyone on any plan, so one
    // unrestricted 100%-off code is a free membership for whoever learns it.
    const allowPromotionCodes = APP_CONFIG.features.stripePromotionCodes

    // A double-clicked buy button otherwise creates two sessions on the same
    // customer. The key is derived from the request rather than the visitor
    // alone, because Stripe refuses a reused key whose parameters changed — see
    // `checkout-idempotency.ts` for why it is also time-bucketed.
    const idempotencyKey = checkoutIdempotencyKey({
      visitorAuthUserId,
      customerId: stripeCustomerId,
      priceId,
      successUrl,
      cancelUrl,
      referralId,
      allowPromotionCodes,
    })

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'subscription', // KEY: subscription mode, not payment
      line_items: [{
        price: priceId,
        quantity: 1
      }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata,
      allow_promotion_codes: allowPromotionCodes,
      billing_address_collection: 'auto', // Optional: collect billing address
      subscription_data: {
        metadata // Also add metadata to subscription object
      }
    }, { idempotencyKey })

    logger.info('Created checkout session')

    return NextResponse.json(
      { sessionId: session.id, url: session.url },
      { headers: corsHeaders }
    )

  } catch (error) {
    logger.error('Error creating checkout session', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500, headers: corsHeaders }
    )
  }
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}
