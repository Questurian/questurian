import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/payments/lib/stripe'
import { resolveStripeCustomerForVisitor, findLiveSubscription } from '@/payments/lib/customer-linkage'
import { APP_CONFIG, APP_URLS } from '@/shared/config'
import { forbiddenOriginResponse, getCorsHeaders, handleCorsOptions } from '@/shared/utils/cors'
import { requireVisitorPrincipal } from '@/features/visitor-auth/lib/current-principal'
import { isPlanId, priceIdForPlan, type PlanId } from '@/payments/lib/membership-plans'
import { checkPaymentsRateLimit, checkPaymentsVisitorRateLimit, paymentsRateLimitResponse } from '@/payments/lib/payments-rate-limit'
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

/**
 * The characters an affiliate id can be made of. Anything else is not an id.
 *
 * Length alone was the only bound, so any 100 characters at all — newlines,
 * quotes, control bytes, invisible Unicode — rode the request body into Stripe
 * metadata and into the checkout idempotency hash. Nothing downstream
 * interpolates the value, so this is not a live injection; it is an untrusted
 * string being carried into places that are hard to clean up. Metadata surfaces
 * in Dashboard exports, event payloads and webhook logs, and a value with an
 * embedded newline is a forged line in a log a human will later read as truth.
 *
 * Endorsely does not publish the format, and the value is minted server-side —
 * `assets.endorsely.com/endorsely.js` only copies whatever
 * `app.endorsely.com/api/public/track` hands back into
 * `window.endorsely_referral`. The one concrete sample in this repo is our own
 * Endorsely org id, `fcadb40c-1e6f-45a3-b69f-709deae165c0` (client
 * `.env.production.local`), so their ids are at least UUID-shaped. That is
 * suggestive, not proof, so this set is drawn wider than a UUID on purpose: it
 * also admits prefixed ids (`ref_abc123`), base64 and base64url tokens, and
 * dotted or colon-namespaced slugs.
 *
 * Erring wide is the right direction here. Rejecting a real referral silently
 * drops the metadata, the affiliate never gets the commission, and nobody finds
 * out — there is no error anywhere. Accepting an odd-but-harmless id costs
 * nothing.
 *
 * Two printable characters are still left out. `/` never appears in an id and
 * is the one character that would matter if this value were ever put in a path.
 * `@` is excluded so the "no email in metadata" guard below stays meaningful:
 * with it allowed, a caller could plant an address-shaped string in the one
 * field that assertion exists to keep addresses out of.
 */
const REFERRAL_ID_PATTERN = /^[A-Za-z0-9._:+=-]+$/

function sanitizeReferralId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > REFERRAL_ID_MAX_LENGTH) {
    return null
  }
  // `null` is the existing "no referral" answer, so a malformed value is
  // ignored rather than failing the checkout. A visitor must not lose a
  // subscription because an affiliate script sent something odd.
  if (!REFERRAL_ID_PATTERN.test(trimmed)) {
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
    const visitorLimit = await checkPaymentsVisitorRateLimit(visitorAuthUserId, 'checkout')
    if (!visitorLimit.allowed) {
      return paymentsRateLimitResponse(corsHeaders, visitorLimit.retryAfterSeconds)
    }

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
    const forceThreeDSecure = APP_CONFIG.features.stripeForceThreeDSecure

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
      forceThreeDSecure,
    })

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'subscription', // KEY: subscription mode, not payment
      line_items: [{
        price: priceId,
        quantity: 1
      }],
      // Pinned here rather than left to the Dashboard, because the rest of this
      // system is written against cards and says so out loud:
      // `DELIBERATELY_UNHANDLED_STRIPE_EVENTS` leaves
      // `checkout.session.async_payment_failed` unhandled on the stated grounds
      // that "Checkout is card-only, so it cannot fire".
      //
      // That was not true. The account's default payment method configuration
      // (`pmc_1RdDUl…`, checked 2026-08-19) enables affirm, amazon_pay,
      // bancontact, blik, cashapp, eps, giropay and klarna alongside card and
      // link. `mode: 'subscription'` filters that list to methods supporting
      // recurring payments, which is why nothing has broken yet — but bancontact
      // reaches recurring through a SEPA mandate, and SEPA is a
      // delayed-notification method: the session completes `unpaid`, money
      // arrives later, and the failure case is the event we do not handle.
      //
      // Naming the methods here means an enabled Dashboard toggle can no longer
      // silently widen what this endpoint sells, and the contract's reasoning
      // becomes true again. Apple Pay and Google Pay are unaffected — they ride
      // in as card wallets. Link is the one thing this drops; add `'link'` to
      // the array to bring it back, since it is card-backed and settles
      // immediately.
      payment_method_types: ['card'],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata,
      allow_promotion_codes: allowPromotionCodes,
      billing_address_collection: 'auto', // Optional: collect billing address
      subscription_data: {
        metadata // Also add metadata to subscription object
      },
      // Off unless the host asks for it. A US-issued card never triggers SCA on
      // its own, so without this the subscription never passes through
      // `incomplete` and the 3DS branch of the membership emails cannot be
      // exercised against a real Stripe at all. See `stripeForceThreeDSecure`.
      // `challenge`, not `any`: `any` only asks the issuer to authenticate, and a
      // US issuer answers that frictionlessly — authenticated invisibly, paid in
      // three seconds, subscription `active` on arrival. Observed on this account
      // 2026-08-18. `challenge` asks for an interactive step, which is what
      // actually leaves the subscription sitting in `incomplete`.
      ...(forceThreeDSecure
        ? { payment_method_options: { card: { request_three_d_secure: 'challenge' as const } } }
        : {}),
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
