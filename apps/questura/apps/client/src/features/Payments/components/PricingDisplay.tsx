'use client';

import Link from 'next/link';
import JoinHeroVisual from './JoinHeroVisual';
import {
  formatPerMonthEquivalent,
  formatPlanAmount,
  formatPlanInterval,
  getAnnualSaving,
  useMembershipPlans,
  type MembershipPlan,
} from '../hooks/useMembershipPlan';

const tickerItems = [
  'Neighborhood deep-dives',
  'Day-by-day itineraries',
  'Food & restaurant guides',
  'Written by locals',
  'Every city we cover',
  'No paywalls',
  'Always publishing',
];

const unlocks = [
  {
    label: 'The library',
    title: 'Every article, no paywalls',
    body: 'Neighborhood deep-dives, food guides, and city reporting from experts who live where they write. Read everything, whenever you want.',
  },
  {
    label: 'The itineraries',
    title: 'Your days, already planned',
    body: 'Day-by-day plans from locals — where to stay, where to eat, what’s worth your time and what isn’t. Land with a plan instead of a search tab.',
  },
  {
    label: 'The experts',
    title: 'Every writer, one membership',
    body: 'You’re not subscribing to one voice. Membership unlocks every expert on Questurian at once, across every city we cover.',
  },
  {
    label: 'The upside',
    title: 'It keeps getting better',
    body: 'New articles and itineraries land regularly. Your membership grows more valuable the longer you hold it.',
  },
];

const PLAN_DIFFERENCE_QUESTION = 'What’s the difference between the plans?';
const PLAN_DIFFERENCE_ANSWER =
  'Nothing but the billing. Both plans unlock every article, itinerary, and expert we publish.';

function PlanArrowLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="join-plan-arrow relative z-10 grid h-14 w-14 shrink-0 self-center place-items-center text-[#1A1A1A] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#1A1A1A]"
    >
      <svg
        viewBox="0 0 56 56"
        fill="none"
        aria-hidden="true"
        className="h-full w-full"
      >
        <circle
          className="join-plan-arrow-ring-track"
          cx="28"
          cy="28"
          r="25"
          strokeWidth="1.5"
        />
        <circle
          className="join-plan-arrow-ring-progress"
          cx="28"
          cy="28"
          r="25"
          pathLength="100"
          strokeWidth="1.5"
        />
        <path
          d="M20 28H36M30 22L36 28L30 34"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </Link>
  );
}

/**
 * The annual card, priced from the catalog ($79.99/year).
 * Laptop Checkout may still charge $0.50. See docs/membership-pricing.md.
 */
function AnnualPlanCard({
  plan,
  monthly,
}: {
  plan: MembershipPlan;
  monthly: MembershipPlan | null;
}) {
  const saving = getAnnualSaving(plan, monthly);
  const perMonth = formatPerMonthEquivalent(plan);

  return (
    <div
      className="
        join-plan-card join-plan-card--annual
        relative flex flex-col overflow-hidden
        bg-[#FAF7F2] text-[#1A1A1A]
        shadow-[0_18px_44px_-36px_rgba(26,26,26,0.45)]
        768:order-last
      "
    >
      <div className="flex flex-1 flex-col p-8 480:p-10">
        <div className="flex items-start justify-between gap-4">
          <p className="font-mono text-[0.64rem] uppercase tracking-[0.2em] text-[#3451C7]">
            Annual · Most popular
          </p>
          {saving ? (
            <p
              className="
                shrink-0 rounded-sm bg-[#3B5BDB] px-2 py-1 font-mono
                text-[0.6rem] font-bold uppercase tracking-[0.14em]
                text-white
              "
            >
              Save {saving.percentOff}%
            </p>
          ) : null}
        </div>

        <div className="mt-6 flex flex-wrap items-baseline gap-x-3">
          {saving ? (
            <span className="text-[0.95rem] text-[#1A1A1A]/45 line-through">
              <span className="sr-only">Full price at the monthly rate: </span>
              {saving.compareAt}
            </span>
          ) : null}
          <span className="font-display text-[2.6rem] leading-none 768:text-[3rem]">
            {formatPlanAmount(plan)}
          </span>
          <span className="text-[0.9rem] text-[#6b6a68]">
            /{formatPlanInterval(plan)}
          </span>
        </div>
        {perMonth ? (
          <p className="mt-2.5 text-[0.86rem] font-medium text-[#9DACF2]">
            {perMonth} a month
          </p>
        ) : null}

        <p className="mt-6 mb-8 flex-1 text-[0.95rem] leading-[1.75] text-[#4f4e4b]">
          The complete Questurian library, billed once a year. Every article and
          itinerary we publish, for one yearly payment.
        </p>

        <PlanArrowLink href="/purchase/yearly" label="Continue with Annual" />
      </div>
    </div>
  );
}

function MonthlyPlanCard({ plan }: { plan: MembershipPlan }) {
  return (
    <div
      className="
        join-plan-card
        relative flex flex-col
        bg-[#FAF7F2] p-8
        shadow-[0_18px_44px_-36px_rgba(26,26,26,0.45)]
        480:p-10
      "
    >
      <p className="font-mono text-[0.64rem] uppercase tracking-[0.2em] text-[#8a857c]">
        Monthly
      </p>

      <div className="mt-6 flex items-baseline gap-x-3">
        <span className="font-display text-[2.6rem] leading-none text-[#1A1A1A] 768:text-[3rem]">
          {formatPlanAmount(plan)}
        </span>
        <span className="text-[0.9rem] text-[#6b6a68]">
          /{formatPlanInterval(plan)}
        </span>
      </div>
      <p className="mt-6 mb-8 flex-1 text-[0.95rem] leading-[1.75] text-[#4f4e4b]">
        The same full access to every article and itinerary from all of our
        travel experts, billed month to month.
      </p>

      <PlanArrowLink href="/purchase/monthly" label="Continue with Monthly" />
    </div>
  );
}

export default function PricingDisplay() {
  const { monthly, yearly, isLoading } = useMembershipPlans();

  const annualPerMonth = yearly ? formatPerMonthEquivalent(yearly) : null;
  const hasBothPlans = Boolean(monthly && yearly);

  // No plan means nothing is purchasable, so the page says so instead of
  // advertising a number the checkout would not honour.
  const hasAnyPlan = Boolean(monthly || yearly);

  // Only meaningful while there is more than one plan to choose between.
  const faqs = hasBothPlans
    ? [{ question: PLAN_DIFFERENCE_QUESTION, answer: PLAN_DIFFERENCE_ANSWER }]
    : [];

  return (
    <div className="min-h-screen bg-[#F5F0E8]">
      {/* ── Hero ── */}
      <JoinHeroVisual />

      {/* ── Departures-board ticker ── */}
      <div
        className="join-ticker overflow-hidden border-y border-[#1A1A1A]/15 py-3"
        aria-hidden="true"
      >
        <div className="join-ticker-track">
          {[0, 1].map((copy) => (
            <div key={copy} className="flex shrink-0 items-center">
              {tickerItems.map((item) => (
                <span
                  key={item}
                  className="
                    flex items-center font-mono text-[0.64rem] uppercase
                    tracking-[0.2em] text-[#1A1A1A]/65
                    480:text-[0.68rem]
                  "
                >
                  <span className="px-5 480:px-7">{item}</span>
                  <span className="text-[0.5rem] text-[#9DACF2]">✦</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ── Plans ── */}
      <section
        id="plans"
        className="scroll-mt-28 px-5 pt-12 pb-10 max-w-5xl mx-auto 768:px-8 768:pt-16"
      >
        <div className="mb-8 text-center 768:mb-10">
          <h2 className="font-display text-[2rem] font-semibold leading-tight text-[#1A1A1A] 768:text-[2.4rem]">
            {hasBothPlans ? 'Choose your plan.' : 'Become a member.'}
          </h2>
          <p className="mt-2 text-[0.9rem] text-[#6f6a62]">
            You can{' '}
            <strong className="font-semibold text-[#1A1A1A]">
              cancel anytime.
            </strong>
          </p>
        </div>

        {isLoading ? (
          <p
            className="py-10 text-center text-[0.9rem] text-[#6f6a62]"
            role="status"
          >
            Loading plans…
          </p>
        ) : hasAnyPlan ? (
          <div
            className={`grid grid-cols-1 items-stretch gap-6 768:gap-8 ${
              hasBothPlans
                ? '768:grid-cols-[1fr_1.12fr]'
                : 'mx-auto max-w-md'
            }`}
          >
            {/* Annual — the member pass. Absent from Stripe means absent here. */}
            {yearly ? (
              <AnnualPlanCard plan={yearly} monthly={monthly} />
            ) : null}
            {monthly ? <MonthlyPlanCard plan={monthly} /> : null}
          </div>
        ) : (
          <p className="py-10 text-center text-[0.9rem] text-[#6f6a62]">
            Memberships are temporarily unavailable. Please try again shortly.
          </p>
        )}

        {hasAnyPlan ? (
          <p className="mt-6 text-center text-[0.72rem] tracking-[0.01em] text-[#9a9894]">
            Secure payment via Stripe · Visa, Mastercard, American Express,
            Apple&nbsp;Pay
          </p>
        ) : null}
      </section>

      {/* ── Pull quote ── */}
      <section className="mt-10 bg-[#EDE6DA] px-6 py-14 text-center 768:mt-16 768:py-20">
        <div className="max-w-3xl mx-auto">
          <span
            className="mx-auto block h-px w-10 bg-[#3B5BDB]"
            aria-hidden="true"
          />
          <p
            className="
              mt-7 font-editorial text-[1.6rem] font-medium italic
              leading-[1.3] text-[#1A1A1A]
              480:text-[1.85rem]
              768:text-[2.3rem] 768:leading-[1.25]
            "
          >
            Every guide on Questurian is written by someone who actually
            lives there.
          </p>
          <p className="mt-6 font-mono text-[0.62rem] uppercase tracking-[0.22em] text-[#8a857c]">
            That&apos;s the whole point
          </p>
        </div>
      </section>

      {/* ── What membership unlocks ── */}
      <section className="px-6 py-14 max-w-5xl mx-auto 768:px-8 768:py-20">
        <h2
          className="
            text-center font-display text-[1.6rem] text-[#1A1A1A]
            480:text-[1.8rem]
            768:text-[2.1rem]
          "
        >
          What membership unlocks
        </h2>

        <div className="mt-10 grid grid-cols-1 gap-x-12 gap-y-9 768:mt-14 768:grid-cols-2 768:gap-y-12">
          {unlocks.map((item) => (
            <div
              key={item.title}
              className="border-t border-[#1A1A1A]/15 pt-5 768:pt-6"
            >
              <p className="font-mono text-[0.62rem] uppercase tracking-[0.2em] text-[#3451C7]">
                {item.label}
              </p>
              <h3 className="mt-2.5 font-display text-[1.15rem] text-[#1A1A1A] 768:text-[1.3rem]">
                {item.title}
              </h3>
              <p className="mt-2.5 text-[0.88rem] leading-[1.75] text-[#5c5b58]">
                {item.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── FAQ ── */}
      {faqs.length > 0 ? (
        <section className="join-faq px-6 pb-16 max-w-2xl mx-auto 768:pb-20">
          <h2 className="text-center font-display text-[1.35rem] text-[#1A1A1A] 768:text-[1.5rem]">
            Before you ask
          </h2>
          <div className="mt-8 border-b border-[#1A1A1A]/15">
            {faqs.map((faq) => (
              <details key={faq.question} className="group border-t border-[#1A1A1A]/15">
                <summary
                  className="
                    flex items-center justify-between gap-4 py-5
                    text-[0.95rem] font-medium text-[#1A1A1A]
                  "
                >
                  {faq.question}
                  <span
                    className="join-faq-plus shrink-0 text-[1.1rem] font-light leading-none text-[#3B5BDB]"
                    aria-hidden="true"
                  >
                    +
                  </span>
                </summary>
                <p className="pb-5 pr-8 text-[0.88rem] leading-[1.75] text-[#5c5b58]">
                  {faq.answer}
                </p>
              </details>
            ))}
          </div>
        </section>
      ) : null}

      {/* ── Final CTA ── */}
      <section className="bg-[#2D4A3E] px-6 py-16 text-center text-[#FAF7F2] 768:py-20">
        <div className="max-w-2xl mx-auto">
          <h2
            className="
              font-display text-[1.7rem] leading-[1.15]
              480:text-[2rem]
              768:text-[2.4rem]
            "
          >
            Your next trip deserves better than guesswork.
          </h2>
          <a
            href="#plans"
            className="
              mt-8 inline-block rounded bg-[#3B5BDB] px-10 py-3.5
              text-[0.9rem] font-medium text-white transition-colors
              hover:bg-[#3451C7]
              focus-visible:outline-2 focus-visible:outline-offset-2
              focus-visible:outline-[#9DACF2]
            "
          >
            Become a member
          </a>
          {annualPerMonth ? (
            <p className="mt-4 text-[0.76rem] text-[#FAF7F2]/60">
              From {annualPerMonth} a month, billed annually
            </p>
          ) : monthly ? (
            <p className="mt-4 text-[0.76rem] text-[#FAF7F2]/60">
              {formatPlanAmount(monthly)} per {formatPlanInterval(monthly)},
              cancel anytime
            </p>
          ) : null}
        </div>
      </section>

      {/* ── Dark Footer ── */}
      <footer className="bg-[#1A1A1A] text-white">
        <div className="max-w-2xl mx-auto px-6 py-10 768:py-12">
          {/* Terms */}
          <div className="text-[0.71rem] text-white/50 leading-[1.85] space-y-4 mb-8">
            <p>
              All prices are in U.S. dollars. Plus tax where applicable.
              Subscriptions renew automatically at the end of each billing
              period.
            </p>
          </div>

          {/* Links */}
          <div className="border-t border-white/10 pt-6">
            <div
              className="
                flex flex-wrap justify-center gap-x-3 gap-y-2
                text-[0.69rem] text-white/45 mb-6
              "
            >
              <Link
                href="/terms"
                className="underline underline-offset-2 hover:text-white/70 transition-colors"
              >
                Terms of Service
              </Link>
              <span className="text-white/20">|</span>
              <Link
                href="/privacy"
                className="underline underline-offset-2 hover:text-white/70 transition-colors"
              >
                Privacy Policy
              </Link>
              <span className="text-white/20">|</span>
              <Link
                href="/faq"
                className="underline underline-offset-2 hover:text-white/70 transition-colors"
              >
                Subscription FAQ
              </Link>
            </div>
          </div>

          {/* Copyright */}
          <div className="border-t border-white/10 pt-5 text-center">
            <p className="text-[0.67rem] text-white/30">
              © 2026 Questurian. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
