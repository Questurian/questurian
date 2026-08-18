"use client";

import {
  formatPerWeekEquivalent,
  formatPlanAmount,
  formatPlanInterval,
  formatPlanPrice,
  formatUnderWeeklyCeiling,
  useMembershipPlans,
  type MembershipPlan,
} from '@/features/Payments/hooks/useMembershipPlan';

/**
 * Breakpoints from globals.css:
 * --breakpoint-280: 280px
 * --breakpoint-320: 320px
 * --breakpoint-380: 380px
 * --breakpoint-480: 480px
 * --breakpoint-550: 550px
 * --breakpoint-640: 640px
 * --breakpoint-768: 768px
 * --breakpoint-1024: 1024px
 * --breakpoint-1280: 1280px
 * --breakpoint-1536: 1536px
 */

function shortBillingUnit(plan: MembershipPlan): string {
  if (plan.intervalCount !== 1) return formatPlanInterval(plan);
  if (plan.interval === 'month') return 'mo';
  if (plan.interval === 'year') return 'yr';
  if (plan.interval === 'week') return 'wk';
  return plan.interval;
}

export default function SubscribeButton() {
  const { monthly, yearly } = useMembershipPlans();

  // Same source /join and /purchase use. Catalog $12.99 / $79.99, not the
  // laptop $0.50 test charge. See docs/membership-pricing.md.
  const weekly = yearly ? formatPerWeekEquivalent(yearly) : null;
  const underWeekly = yearly ? formatUnderWeeklyCeiling(yearly) : null;
  const billedPlan = yearly ?? monthly;

  let mid = 'Join';
  let wide = 'Subscribe';

  if (weekly && underWeekly) {
    mid = `Join: ${weekly}/wk`;
    wide = `Subscribe: under ${underWeekly}/wk`;
  } else if (billedPlan) {
    mid = `Join: ${formatPlanAmount(billedPlan)}/${shortBillingUnit(billedPlan)}`;
    wide = `Subscribe: ${formatPlanPrice(billedPlan)}`;
  }

  return (
    <button
      className={`
        cursor-pointer
        inline-flex items-center justify-center whitespace-nowrap leading-none
        h-[32px] w-[90px] px-1.5 text-[0.690rem]
        rounded-[3px] border-2 border-white/20
        bg-[#3B5BDB]
        text-white font-semibold font-[var(--font-dm-sans)] tracking-[0.02em]
        transition-colors duration-150 ease-out
        hover:bg-[#3451C7]
        active:bg-[#2F44B0]
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B5BDB]/50 focus-visible:ring-offset-2
        motion-reduce:transition-none
        max-[379.98px]:h-[30px] max-[379.98px]:w-auto max-[379.98px]:px-2
        max-[379.98px]:text-[0.72rem] max-[379.98px]:font-medium
        380:max-[479.98px]:h-[30px] 380:max-[479.98px]:w-auto 380:max-[479.98px]:px-2
        380:max-[479.98px]:text-[0.72rem] 380:max-[479.98px]:font-medium
        480:h-[40px] 480:w-[125px] 480:px-1.5 480:text-[.850rem]
        550:h-[40px] 550:w-[234px] 550:px-1.5 550:text-[.850rem]
      `}
    >
      <span className="380:hidden">Subscribe</span>
      <span className="hidden 380:inline 550:hidden">{mid}</span>
      <span className="hidden 550:inline">{wide}</span>
    </button>
  );
}
