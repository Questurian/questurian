import { APP_CONFIG } from '@/shared/config'
import { logger } from '@/shared/utils/logger'
import { MEMBERSHIP_CATALOG } from './membership-catalog'
import { stripe } from './stripe'

/**
 * The membership plans Questura sells.
 *
 * Advertised amounts come from `MEMBERSHIP_CATALOG` ($12.99/month, $79.99/year).
 * Checkout charges whichever Stripe price ID is in host env. On the laptop that
 * is usually $0.50/month on the same product. Intentional until serverless.
 * Do not copy Stripe `unit_amount` onto the page.
 * See `apps/questura/docs/membership-pricing.md`.
 */
export type PlanId = 'monthly' | 'yearly'

export type MembershipPlan = {
  id: PlanId
  priceId: string
  /** Catalog amount in minor units ($12.99 or $79.99). Not the laptop test charge. */
  amount: number
  currency: string
  /** Catalog billing interval, verified against Stripe so yearly cannot bill monthly. */
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

    const catalog = MEMBERSHIP_CATALOG[plan]
    const stripeAmount = price.unit_amount ?? 0

    if (
      price.recurring.interval !== catalog.interval ||
      price.recurring.interval_count !== 1 ||
      price.currency !== catalog.currency
    ) {
      logger.error('Configured membership price does not match the catalog', {
        plan,
        priceId,
        stripeInterval: price.recurring.interval,
        stripeIntervalCount: price.recurring.interval_count,
        stripeCurrency: price.currency,
      })
      return null
    }

    // Cheaper than catalog = laptop test charge. More than catalog = we would
    // advertise $12.99 and charge more, which is the dispute. Refuse that plan.
    if (stripeAmount > catalog.amount) {
      logger.error('Stripe would charge more than the catalog price; refusing to advertise', {
        plan,
        priceId,
        stripeAmount,
        catalogAmount: catalog.amount,
      })
      return null
    }

    const compareAtRaw = Number.parseInt(price.metadata?.compare_at_amount ?? '', 10)
    const compareAtAmount =
      Number.isFinite(compareAtRaw) && compareAtRaw > catalog.amount ? compareAtRaw : null

    const product = price.product
    const productName =
      product && typeof product !== 'string' && !('deleted' in product && product.deleted)
        ? product.name
        : null

    return {
      id: plan,
      priceId,
      amount: catalog.amount,
      currency: catalog.currency,
      interval: catalog.interval,
      intervalCount: 1,
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
