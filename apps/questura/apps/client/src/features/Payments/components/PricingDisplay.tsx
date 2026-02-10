import Link from 'next/link';

const features = [
  {
    title: 'In-depth city guides',
    description:
      'Not another travel blog. Each guide covers neighborhoods block by block — cost of living, internet speeds, safety, walkability, food scenes, coworking spots, and the hundred small details that determine whether a city is right for your life.',
  },
  {
    title: 'Step-by-step relocation playbooks',
    description:
      'Visa applications, opening a bank account, finding a phone plan, navigating healthcare, apartment hunting — everything documented step by step. Written by expats who\'ve actually done it, updated as regulations change.',
  },
  {
    title: 'Curated accommodation picks',
    description:
      'Stop overpaying on Airbnb. Access vetted short-term rentals, co-living spaces, and long-term housing options in every city we cover. Arrive somewhere you\'ll actually love, at a price that makes sense.',
  },
  {
    title: 'A community of people doing it',
    description:
      'Get answers from people already on the ground. Our community connects you with remote workers, founders, and families building lives across Latin America — the kind of on-the-ground intel you can\'t find on Google.',
  },
  {
    title: 'New cities every month',
    description:
      'We\'re constantly expanding. New city guides, refreshed data, and emerging neighborhoods added regularly. Your membership gets more valuable the longer you hold it.',
  },
];

export default function PricingDisplay() {
  return (
    <div className="min-h-screen">
      {/* ── Minimal Nav ── */}
      <nav className="py-5 text-center border-b border-[#1A1A1A]/8 768:py-6">
        <Link
          href="/"
          className="
            font-display text-[1.05rem] uppercase tracking-[0.12em]
            font-semibold text-[#25292d]
            480:text-[1.15rem]
          "
        >
          Questurian
        </Link>
      </nav>

      {/* ── Dark Banner ── */}
      <section className="relative bg-[#151515] text-white px-6 pt-11 pb-24 min-h-[320px] 480:pt-12 480:pb-28 768:pt-16 768:pb-44 768:min-h-[500px]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_10%,rgba(255,255,255,0.1),transparent_45%)]" />
        <div className="relative max-w-5xl mx-auto">
          <p
            className="
              font-display text-center text-[1.35rem] leading-[1.15]
              max-w-2xl mx-auto
              480:text-[1.6rem]
              768:text-[2.15rem]
            "
          >
            See the world. Understand it better
          </p>
          <h1
            className="
              mt-5 font-display text-center text-[1.45rem] leading-[1.16]
              max-w-[860px] mx-auto text-white/95
              480:text-[1.8rem]
              768:text-[2.55rem] 768:mt-7
              1024:text-[2.95rem]
            "
          >
            The insider&apos;s guide to living in Latin America
          </h1>
          <p
            className="
              mt-4 text-[0.93rem] text-white/80 leading-[1.65]
              max-w-sm mx-auto text-center
              480:text-[0.97rem] 480:max-w-lg
              768:text-[1.05rem] 768:max-w-2xl 768:mt-5
            "
          >
            In-depth city guides, relocation playbooks, and a community of
            people already doing it. Starting at less than $1.55&nbsp;a&nbsp;week.
          </p>
        </div>
      </section>

      {/* ── Pricing Cards ── */}
      <section id="plans" className="relative z-10 px-5 pb-10 max-w-6xl mx-auto -mt-14 480:-mt-16 768:px-8 768:-mt-28">
        <div className="grid grid-cols-1 gap-6 768:grid-cols-2 768:gap-7">
          {/* Monthly */}
          <div className="bg-[#f7f6f2] border border-[#d7d4ce] rounded-sm p-8 480:p-10 1024:p-12 flex flex-col min-h-[430px] 1024:min-h-[500px]">
            <h2 className="font-display text-[1.55rem] text-[#1A1A1A] mb-3 768:text-[1.85rem]">
              Monthly
            </h2>
            <p className="text-[1.45rem] font-semibold text-[#1A1A1A] mb-4 768:text-[1.75rem]">
              $12.99/month
            </p>
            <p className="text-[0.98rem] text-[#4f4e4b] leading-[1.75] mb-9 flex-1 768:text-[1.03rem]">
              Full access to every guide, tool, and community
              resource. Flexibility to cancel anytime,
              no&nbsp;commitment.
            </p>
            <Link
              href="/purchase/monthly"
              className="
                block w-full bg-[#2C2C2C] hover:bg-[#1A1A1A]
                text-white text-center py-3.5 rounded
                text-[0.92rem] font-medium transition-colors
              "
            >
              Select Monthly
            </Link>
          </div>

          {/* Annual */}
          <div className="bg-[#f7f6f2] border border-[#b73f31] rounded-sm p-8 480:p-10 1024:p-12 relative overflow-hidden flex flex-col min-h-[430px] 1024:min-h-[500px]">
            <div className="absolute top-0 left-0 right-0 h-[3px] bg-[#C65D3B]" />
            <p className="text-[0.64rem] uppercase tracking-[0.2em] font-bold text-[#B73F31] mb-3 768:mb-4">
              For Sale
            </p>

            <div className="flex items-center gap-2.5 mb-3">
              <h2 className="font-display text-[1.55rem] text-[#1A1A1A] 768:text-[1.85rem]">
                Annual
              </h2>
              <span
                className="
                  text-[0.62rem] uppercase tracking-[0.1em] font-bold
                  text-[#C65D3B] bg-[#C65D3B1A] px-2 py-0.5 rounded
                "
              >
                Best value
              </span>
            </div>

            <div className="mb-5">
              <p className="text-[1.45rem] font-semibold text-[#1A1A1A] 768:text-[1.75rem]">
                $79.99/year
              </p>
              <p className="text-[0.84rem] text-[#C65D3B] font-medium mt-1">
                Save 49% — just $6.67/month
              </p>
            </div>

            <p className="text-[0.98rem] text-[#4f4e4b] leading-[1.75] mb-9 flex-1 768:text-[1.03rem]">
              Everything in Monthly, billed once a year.
              Lock in the best rate and get a full year of
              access for the price of&nbsp;six&nbsp;months.
            </p>
            <Link
              href="/purchase/yearly"
              className="
                block w-full bg-[#2C2C2C] hover:bg-[#1A1A1A]
                text-white text-center py-3.5 rounded
                text-[0.92rem] font-medium transition-colors
              "
            >
              Select Annual
            </Link>
          </div>
        </div>

        {/* Payment note */}
        <p className="text-center text-[0.72rem] text-[#9a9894] mt-6 tracking-[0.01em]">
          Secure payment via Stripe · Visa, Mastercard, American Express,
          Apple&nbsp;Pay
        </p>
      </section>

      {/* ── What's Included ── */}
      <section className="px-6 pt-16 pb-14 768:pt-20 768:pb-16">
        <div className="max-w-2xl mx-auto">
          <h2
            className="
              font-display text-[1.35rem] text-center text-[#1A1A1A]
              uppercase tracking-[0.04em] mb-3
              480:text-[1.5rem]
              768:text-[1.75rem]
            "
          >
            What&apos;s included
          </h2>
          <p
            className="
              text-center text-[0.88rem] text-[#6b6a68] leading-relaxed
              mb-12 max-w-md mx-auto
              768:text-[0.92rem] 768:mb-14
            "
          >
            Every plan comes with full access to our guides, tools,
            and community. Here&apos;s what you&apos;ll get:
          </p>

          <div className="space-y-10 768:space-y-12">
            {features.map((feature) => (
              <div key={feature.title}>
                <h3
                  className="
                    font-display text-[1.02rem] text-[#1A1A1A] mb-2
                    768:text-[1.12rem]
                  "
                >
                  {feature.title}
                </h3>
                <p className="text-[0.86rem] text-[#5c5b58] leading-[1.75]">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>

          {/* Bottom CTA */}
          <div className="mt-14 text-center 768:mt-16">
            <a
              href="#plans"
              className="
                inline-block bg-[#2C2C2C] hover:bg-[#1A1A1A]
                text-white py-3 px-10 rounded
                text-[0.86rem] font-medium transition-colors
              "
            >
              Select a Plan
            </a>
          </div>
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
