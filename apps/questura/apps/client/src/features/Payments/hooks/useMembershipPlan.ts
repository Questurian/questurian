import { useQuery } from '@tanstack/react-query';

import { get } from '@/lib/api';

/**
 * What membership costs to advertise. Catalog $12.99 / $79.99, not the laptop
 * $0.50 test charge. Mismatch is intentional until serverless.
 * See apps/questura/docs/membership-pricing.md.
 */
export type PlanId = 'monthly' | 'yearly';

export type MembershipPlan = {
  id: PlanId;
  priceId: string;
  /** Catalog amount in minor units ($12.99 or $79.99). Not the laptop test charge. */
  amount: number;
  currency: string;
  interval: string;
  intervalCount: number;
  productName: string | null;
  /** Optional "was" price in minor units. Presentation only; never charged. */
  compareAtAmount: number | null;
};

function formatMinorUnits(minorUnits: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    // Whole amounts read better without trailing zeros on a pricing page.
    minimumFractionDigits: minorUnits % 100 === 0 ? 0 : 2,
  }).format(minorUnits / 100);
}

export function formatPlanAmount(plan: MembershipPlan): string {
  return formatMinorUnits(plan.amount, plan.currency);
}

/** "month", or "3 months" when Stripe is billing in multiples. */
export function formatPlanInterval(plan: MembershipPlan): string {
  return plan.intervalCount === 1
    ? plan.interval
    : `${plan.intervalCount} ${plan.interval}s`;
}

export function formatPlanPrice(plan: MembershipPlan): string {
  return `${formatPlanAmount(plan)}/${formatPlanInterval(plan)}`;
}

/**
 * How many months one billing period covers, or null when Stripe bills in a
 * unit that does not divide into months (`day`, `week`).
 */
function billingMonths(plan: MembershipPlan): number | null {
  if (plan.interval === 'year') return 12 * plan.intervalCount;
  if (plan.interval === 'month') return plan.intervalCount;
  return null;
}

/**
 * A multi-month plan's price expressed per month, or null when the plan is
 * already billed monthly (or in a unit months cannot express).
 *
 * Rounded up: a derived figure must never undercut the catalog price.
 */
export function formatPerMonthEquivalent(plan: MembershipPlan): string | null {
  const months = billingMonths(plan);
  if (!months || months <= 1) return null;

  return formatMinorUnits(Math.ceil(plan.amount / months), plan.currency);
}

/**
 * How many weeks one billing period covers, or null when Stripe bills in a
 * unit that does not divide into weeks (`day`, `month`).
 *
 * Month is excluded on purpose: a month is not a fixed number of weeks, and
 * weekly framing was chosen for a plan billed annually.
 */
function billingWeeks(plan: MembershipPlan): number | null {
  if (plan.interval === 'year') return 52 * plan.intervalCount;
  if (plan.interval === 'week') return plan.intervalCount;
  return null;
}

function weeklyCeilingMinorUnits(plan: MembershipPlan): number | null {
  const weeks = billingWeeks(plan);
  if (!weeks || weeks <= 1) return null;

  return Math.ceil(plan.amount / weeks);
}

/**
 * A multi-week plan's price expressed per week, or null when the billing unit
 * cannot be divided into weeks without inventing a figure.
 *
 * Rounded up: a derived figure must never undercut the catalog price.
 */
export function formatPerWeekEquivalent(plan: MembershipPlan): string | null {
  const weekly = weeklyCeilingMinorUnits(plan);
  if (weekly == null) return null;

  return formatMinorUnits(weekly, plan.currency);
}

/**
 * One cent above the rounded-up weekly equivalent, for "under $X/wk" copy.
 * Null when there is no honest weekly figure.
 */
export function formatUnderWeeklyCeiling(plan: MembershipPlan): string | null {
  const weekly = weeklyCeilingMinorUnits(plan);
  if (weekly == null) return null;

  return formatMinorUnits(weekly + 1, plan.currency);
}

export type PlanSaving = {
  compareAt: string;
  saved: string;
  percentOff: number;
};

/**
 * The saving a plan advertises, or null when it advertises none.
 *
 * Derived from catalog amounts, so the crossed-out figure is "full price at
 * the monthly catalog rate", not a leftover laptop test charge.
 */
export function getPlanSaving(plan: MembershipPlan): PlanSaving | null {
  if (!plan.compareAtAmount || plan.compareAtAmount <= plan.amount) return null;

  const savedMinorUnits = plan.compareAtAmount - plan.amount;

  return {
    compareAt: formatMinorUnits(plan.compareAtAmount, plan.currency),
    saved: formatMinorUnits(savedMinorUnits, plan.currency),
    percentOff: Math.round((savedMinorUnits / plan.compareAtAmount) * 100),
  };
}

/**
 * The saving an annual plan can honestly advertise.
 *
 * Preferred form is the cross-plan comparison: what the same span of months
 * costs at the monthly catalog price. That is what the crossed-out "full
 * price" on /join claims to be. Falls back to the price's own
 * `compare_at_amount` when the monthly plan is not offered.
 */
export type AnnualSaving = {
  compareAt: string;
  percentOff: number;
};

export function getAnnualSaving(
  yearly: MembershipPlan,
  monthly: MembershipPlan | null,
): AnnualSaving | null {
  const months = billingMonths(yearly);

  if (monthly && months && months > 1 && monthly.currency === yearly.currency) {
    const fullPrice = monthly.amount * months;

    if (fullPrice > yearly.amount) {
      return {
        compareAt: formatMinorUnits(fullPrice, yearly.currency),
        percentOff: Math.round(((fullPrice - yearly.amount) / fullPrice) * 100),
      };
    }
  }

  const declared = getPlanSaving(yearly);
  return declared
    ? { compareAt: declared.compareAt, percentOff: declared.percentOff }
    : null;
}

function useMembershipPlansQuery() {
  return useQuery({
    queryKey: ['membership-plans'],
    queryFn: async () => {
      const response = await get<{ plans: MembershipPlan[] }>('/api/payments/plans');
      return response.plans;
    },
    staleTime: 60 * 60 * 1000,
  });
}

/**
 * Every plan Stripe currently offers. A plan missing from the list is a plan
 * that cannot be bought, so callers hide it rather than advertise it.
 */
export function useMembershipPlans() {
  const query = useMembershipPlansQuery();
  const plans = query.data ?? [];

  return {
    monthly: plans.find((plan) => plan.id === 'monthly') ?? null,
    yearly: plans.find((plan) => plan.id === 'yearly') ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

export function useMembershipPlan(planId: PlanId) {
  const query = useMembershipPlansQuery();

  const plan = query.data?.find((candidate) => candidate.id === planId) ?? null;

  return {
    plan,
    isLoading: query.isLoading,
    // A plan Stripe does not offer is not an error state to shout about; the
    // page shows that it is unavailable rather than inventing a number.
    isUnavailable: !query.isLoading && !query.isError && !plan,
    isError: query.isError,
  };
}
