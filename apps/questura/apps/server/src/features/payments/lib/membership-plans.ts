import { APP_CONFIG } from '@/shared/config'
import { logger } from '@/shared/utils/logger'
import { stripe } from './stripe'

/**
 * The membership plans Questura sells, resolved from Stripe.
 *
 * Prices used to be hardcoded in the purchase pages while checkout charged
 * whatever `STRIPE_PRICE_ID` pointed at. The two drifted immediately: the pages
 * advertised $12.99 and $79.99 against a single $0.50/month price, and the
 * "Annual Plan" billed monthly. A page that states a price it does not control
 * will eventually lie, so the amount shown is read from the same price the
 * checkout session uses.
 */
export type PlanId = 'monthly' | 'yearly'

export type MembershipPlan = {
  id: PlanId
  priceId: string
  /** Minor units, as Stripe reports them. */
  amount: number
  currency: string
  /** Stripe's own billing interval, so the page never has to assume "month". */
  interval: string
  intervalCount: number
  productName: string | null
  /**
   * Optional "was" price in minor units, from `compare_at_amount` metadata on
   * the Stripe price. Presentation only -- never charged.
   *
   * A permanently-applied coupon would be the other way to show a saving, and
   * is the wrong tool: Checkout accepts only one discount per session, so a
   * standing sale coupon would consume the slot that real promotion codes need,
   * and any failure to apply it would overcharge the customer by the full
   * difference.
   */
  compareAtAmount: number | null
}

export function priceIdForPlan(plan: PlanId): string {
  return plan === 'yearly' ? APP_CONFIG.stripe.yearlyPriceId : APP_CONFIG.stripe.monthlyPriceId
}

export function isPlanId(value: unknown): value is PlanId {
  return value === 'monthly' || value === 'yearly'
}

async function fetchPlan(plan: PlanId): Promise<MembershipPlan | null> {
  const priceId = priceIdForPlan(plan)

  // A plan with no configured price is not offered, rather than broken. That is
  // how the yearly plan behaves until an annual price exists in Stripe.
  if (!priceId) return null

  try {
    const price = await stripe.prices.retrieve(priceId, { expand: ['product'] })

    if (!price.recurring) {
      logger.error('Configured membership price is not recurring', { plan, priceId })
      return null
    }

    const compareAtRaw = Number.parseInt(price.metadata?.compare_at_amount ?? '', 10)
    const compareAtAmount =
      Number.isFinite(compareAtRaw) && compareAtRaw > (price.unit_amount ?? 0) ? compareAtRaw : null

    const product = price.product
    const productName =
      product && typeof product !== 'string' && !('deleted' in product && product.deleted)
        ? product.name
        : null

    return {
      id: plan,
      priceId,
      amount: price.unit_amount ?? 0,
      currency: price.currency,
      interval: price.recurring.interval,
      intervalCount: price.recurring.interval_count,
      productName,
      compareAtAmount,
    }
  } catch (error) {
    logger.error('Could not resolve membership plan from Stripe', {
      plan,
      priceId,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

/** Every plan that is actually purchasable right now. */
const PLAN_CACHE_TTL_MS = 5 * 60 * 1000

let planCache: { storedAt: number; plans: MembershipPlan[] } | null = null

export async function getMembershipPlans(): Promise<MembershipPlan[]> {
  if (planCache && Date.now() - planCache.storedAt < PLAN_CACHE_TTL_MS) {
    return planCache.plans
  }

  const plans = await Promise.all([fetchPlan('monthly'), fetchPlan('yearly')])
  const resolved = plans.filter((plan): plan is MembershipPlan => plan !== null)

  // Do not cache an empty result: a Stripe blip would hide both plans for
  // the whole TTL, and prices change ~never so a successful fetch is stable.
  if (resolved.length > 0) {
    planCache = { storedAt: Date.now(), plans: resolved }
  }

  return resolved
}

/** Test seam: drop the in-process cache between cases. */
export function resetMembershipPlansCache(): void {
  planCache = null
}
