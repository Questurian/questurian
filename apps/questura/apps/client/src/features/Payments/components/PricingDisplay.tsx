import Link from 'next/link';

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

const faqs = [
  {
    question: 'Can I cancel anytime?',
    answer:
      'Yes. Cancel in your account settings whenever you like — your access continues until the end of the billing period you’ve already paid for.',
  },
  {
    question: 'What’s the difference between the plans?',
    answer:
      'Nothing but the billing. Both plans unlock every article, itinerary, and expert we publish. Annual simply costs about half as much per month.',
  },
  {
    question: 'What if it’s not for me?',
    answer:
      'Annual members can request a prorated refund within the first 30 days. Monthly is non-refundable, but you can cancel before your next renewal and keep reading until it ends.',
  },
];

export default function PricingDisplay() {
  return (
    <div className="min-h-screen bg-[#F5F0E8]">
      {/* ── Hero ── */}
      <section className="px-6 pt-14 pb-10 text-center 768:pt-20 768:pb-14">
        <div className="max-w-3xl mx-auto">
          <p
            className="
              animate-fade-in-up flex items-center justify-center gap-3
              text-[0.66rem] font-bold uppercase
              tracking-[0.22em] text-[#B73F31]
              480:text-[0.7rem]
            "
            style={{ fontFamily: 'var(--font-dm-sans)' }}
          >
            <span className="h-px w-8 bg-[#C65D3B]/50" aria-hidden="true" />
            Questurian Membership
            <span className="h-px w-8 bg-[#C65D3B]/50" aria-hidden="true" />
          </p>

          <h1
            className="
              animate-fade-in-up mt-6 font-display text-[2.15rem]
              leading-[1.06] text-[#1A1A1A]
              480:text-[2.6rem]
              768:text-[3.3rem] 768:mt-8
              1024:text-[3.8rem]
            "
            style={{ animationDelay: '0.08s' }}
          >
            Travel like you{' '}
            <em className="font-editorial font-semibold italic text-[1.06em] text-[#C65D3B] whitespace-nowrap">
              know someone
            </em>{' '}
            there.
          </h1>

          <p
            className="
              animate-fade-in-up mt-5 max-w-md mx-auto text-[0.95rem]
              leading-[1.7] text-[#4f4e4b]
              480:max-w-lg 480:text-[1rem]
              768:mt-6 768:max-w-xl 768:text-[1.08rem]
            "
            style={{ animationDelay: '0.16s' }}
          >
            One membership unlocks every article and every day-by-day
            itinerary from local experts, in every city we cover — for
            less than $1.55&nbsp;a&nbsp;week.
          </p>

          <div
            className="animate-fade-in-up mt-8 768:mt-9"
            style={{ animationDelay: '0.24s' }}
          >
            <a
              href="#plans"
              className="
                inline-block rounded bg-[#C65D3B] px-9 py-3.5
                text-[0.9rem] font-medium text-white
                transition-colors hover:bg-[#B73F31]
                focus-visible:outline-2 focus-visible:outline-offset-2
                focus-visible:outline-[#B73F31]
              "
            >
              See membership plans
            </a>
            <p className="mt-3.5 text-[0.76rem] text-[#8a857c]">
              Cancel anytime · 30-day money-back guarantee on annual
            </p>
          </div>
        </div>
      </section>

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
                  <span className="text-[0.5rem] text-[#D4A574]">✦</span>
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
        <p
          className="
            mb-8 text-center font-mono text-[0.64rem] uppercase
            tracking-[0.2em] text-[#8a857c]
            768:mb-10
          "
        >
          Same full access — the only difference is how you&apos;re billed
        </p>

        <div className="grid grid-cols-1 items-stretch gap-6 768:grid-cols-[1fr_1.12fr] 768:gap-8">
          {/* Annual — the member pass */}
          <div
            className="
              relative flex flex-col overflow-hidden rounded-md
              bg-[#2D4A3E] text-[#FAF7F2]
              shadow-[0_28px_56px_-28px_rgba(45,74,62,0.6)]
              768:order-last
            "
          >
            <div className="flex flex-1 flex-col p-8 480:p-10">
              <div className="flex items-start justify-between gap-4">
                <p className="font-mono text-[0.64rem] uppercase tracking-[0.2em] text-[#D4A574]">
                  Annual · Most popular
                </p>
                <p
                  className="
                    shrink-0 rounded-sm bg-[#C65D3B] px-2 py-1 font-mono
                    text-[0.6rem] font-bold uppercase tracking-[0.14em]
                    text-white
                  "
                >
                  Save 49%
                </p>
              </div>

              <div className="mt-6 flex flex-wrap items-baseline gap-x-3">
                <span className="text-[0.95rem] text-[#FAF7F2]/45 line-through">
                  <span className="sr-only">Full price at the monthly rate: </span>
                  $155.88
                </span>
                <span className="font-display text-[2.6rem] leading-none 768:text-[3rem]">
                  $79.99
                </span>
                <span className="text-[0.9rem] text-[#FAF7F2]/70">/year</span>
              </div>
              <p className="mt-2.5 text-[0.86rem] font-medium text-[#D4A574]">
                $6.67 a month — less than $1.55 a week
              </p>

              <p className="mt-6 mb-8 flex-1 text-[0.95rem] leading-[1.75] text-[#FAF7F2]/75">
                The complete Questurian library, billed once a year. Twelve
                months of every article and itinerary for the price
                of&nbsp;six.
              </p>

              <Link
                href="/purchase/yearly"
                className="
                  block w-full rounded bg-[#C65D3B] py-3.5 text-center
                  text-[0.92rem] font-medium text-white transition-colors
                  hover:bg-[#B73F31]
                  focus-visible:outline-2 focus-visible:outline-offset-2
                  focus-visible:outline-[#D4A574]
                "
              >
                Continue with Annual
              </Link>
            </div>

            {/* Perforated stub */}
            <div className="relative" aria-hidden="true">
              <div className="border-t border-dashed border-[#FAF7F2]/30" />
              <span className="absolute -left-2.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-[#F5F0E8]" />
              <span className="absolute -right-2.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-[#F5F0E8]" />
            </div>
            <div className="flex items-center justify-between gap-3 px-8 py-4 480:px-10">
              <p className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-[#FAF7F2]/60">
                All-access · Every city
              </p>
              <p className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-[#D4A574]">
                30-day guarantee
              </p>
            </div>
          </div>

          {/* Monthly */}
          <div
            className="
              flex flex-col rounded-md border border-[#d7d4ce]
              bg-[#FAF7F2] p-8 480:p-10
            "
          >
            <p className="font-mono text-[0.64rem] uppercase tracking-[0.2em] text-[#8a857c]">
              Monthly
            </p>

            <div className="mt-6 flex items-baseline gap-x-3">
              <span className="font-display text-[2.6rem] leading-none text-[#1A1A1A] 768:text-[3rem]">
                $12.99
              </span>
              <span className="text-[0.9rem] text-[#6b6a68]">/month</span>
            </div>
            <p className="mt-2.5 text-[0.86rem] text-[#8a857c]">
              No commitment — cancel anytime
            </p>

            <p className="mt-6 mb-8 flex-1 text-[0.95rem] leading-[1.75] text-[#4f4e4b]">
              The same full access to every article and itinerary from all
              of our travel experts, billed month to month.
            </p>

            <Link
              href="/purchase/monthly"
              className="
                block w-full rounded border border-[#1A1A1A] py-3.5
                text-center text-[0.92rem] font-medium text-[#1A1A1A]
                transition-colors hover:bg-[#1A1A1A] hover:text-white
                focus-visible:outline-2 focus-visible:outline-offset-2
                focus-visible:outline-[#1A1A1A]
              "
            >
              Continue with Monthly
            </Link>
          </div>
        </div>

        <p className="mt-6 text-center text-[0.72rem] tracking-[0.01em] text-[#9a9894]">
          Secure payment via Stripe · Visa, Mastercard, American Express,
          Apple&nbsp;Pay
        </p>
      </section>

      {/* ── Pull quote ── */}
      <section className="mt-10 bg-[#EDE6DA] px-6 py-14 text-center 768:mt-16 768:py-20">
        <div className="max-w-3xl mx-auto">
          <span
            className="mx-auto block h-px w-10 bg-[#C65D3B]"
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
              <p className="font-mono text-[0.62rem] uppercase tracking-[0.2em] text-[#B73F31]">
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
                  className="join-faq-plus shrink-0 text-[1.1rem] font-light leading-none text-[#C65D3B]"
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
              mt-8 inline-block rounded bg-[#C65D3B] px-10 py-3.5
              text-[0.9rem] font-medium text-white transition-colors
              hover:bg-[#B73F31]
              focus-visible:outline-2 focus-visible:outline-offset-2
              focus-visible:outline-[#D4A574]
            "
          >
            Become a member
          </a>
          <p className="mt-4 text-[0.76rem] text-[#FAF7F2]/60">
            From $6.67 a month, billed annually · 30-day money-back guarantee
          </p>
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
              period unless cancelled. You may cancel your subscription at
              any time from your account settings — your access will
              continue until the end of your current billing period.
            </p>
            <p>
              Annual subscribers may request a prorated refund within the
              first 30 days of their subscription. After 30 days, no
              refunds will be issued for the remainder of the annual
              term. Monthly subscriptions are non-refundable.
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
