"use client";

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
export default function SubscribeButton() {
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
      {/*
       * HARDCODED PRICE -- verify against Stripe before changing plan pricing.
       *
       * Derived from the annual plan: $79.99/yr ÷ 52 = $1.538/wk. Rounded up,
       * so "$1.54" slightly overstates and "under $1.55" stays true; rounding
       * down would understate the price, which is the direction that gets
       * argued in a dispute.
       *
       * This is static chrome on every page and cannot read Stripe, so it goes
       * stale the moment plan pricing changes. `GET /api/payments/plans` is the
       * source of truth, and /join renders from it. If you change the price in
       * Stripe, change this line in the same breath.
       *
       * Weekly framing for a plan billed annually is a deliberate choice, made
       * 2026-08-15 with the trade-off understood.
       */}
      <span className="380:hidden">Subscribe</span>
      <span className="hidden 380:inline 550:hidden">Join: $1.54/wk</span>
      <span className="hidden 550:inline">Subscribe: under $1.55/wk</span>

    </button>
  );
}
