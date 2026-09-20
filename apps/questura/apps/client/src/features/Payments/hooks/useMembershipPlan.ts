import { useQuery } from '@tanstack/react-query';

import { get } from '@/lib/api';

import type { MembershipPlan, PlanId } from '../lib/planPresentation';
export type { MembershipPlan, PlanId, PlanSaving, AnnualSaving } from '../lib/planPresentation';
export { formatPlanAmount, formatPlanInterval, formatPlanPrice, formatPerMonthEquivalent, formatPerWeekEquivalent, formatUnderWeeklyCeiling, getPlanSaving, getAnnualSaving } from '../lib/planPresentation';

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
