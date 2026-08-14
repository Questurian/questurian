import { useQuery } from '@tanstack/react-query';

import { get } from '@/lib/api';

/**
 * The real price of a plan, as Stripe reports it.
 *
 * Purchase pages used to hardcode their own numbers while checkout charged
 * whatever the server had configured. They drifted immediately: the pages
 * advertised $12.99 and $79.99 against a single $0.50/month price, and the
 * "Annual Plan" billed monthly. A page cannot be trusted to state a price it
 * does not control, so it asks for the same price the checkout will use.
 */
export type PlanId = 'monthly' | 'yearly';

export type MembershipPlan = {
  id: PlanId;
  priceId: string;
  /** Minor units, as Stripe reports them. */
  amount: number;
  currency: string;
  interval: string;
  intervalCount: number;
  productName: string | null;
};

function formatAmount(plan: MembershipPlan): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: plan.currency.toUpperCase(),
    // Whole amounts read better without trailing zeros on a pricing page.
    minimumFractionDigits: plan.amount % 100 === 0 ? 0 : 2,
  }).format(plan.amount / 100);
}

/** "month", or "3 months" when Stripe is billing in multiples. */
function formatInterval(plan: MembershipPlan): string {
  return plan.intervalCount === 1
    ? plan.interval
    : `${plan.intervalCount} ${plan.interval}s`;
}

export function formatPlanPrice(plan: MembershipPlan): string {
  return `${formatAmount(plan)}/${formatInterval(plan)}`;
}

export function useMembershipPlan(planId: PlanId) {
  const query = useQuery({
    queryKey: ['membership-plans'],
    queryFn: async () => {
      const response = await get<{ plans: MembershipPlan[] }>('/api/payments/plans');
      return response.plans;
    },
    staleTime: 60 * 60 * 1000,
  });

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
