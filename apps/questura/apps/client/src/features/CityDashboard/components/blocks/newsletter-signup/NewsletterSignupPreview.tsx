'use client'

import { useState, type JSX, type FormEvent } from 'react'

import type { NewsletterSignupBlock, HomepageBlockLayoutProps } from '../../../types'
import { BlockSection } from '../BlockSection'

export function NewsletterSignupPreview({
  block,
}: HomepageBlockLayoutProps<NewsletterSignupBlock>): JSX.Element {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const heading = block.sectionHeading?.trim() || 'Newsletter'
  const subheading =
    block.sectionSubheading?.trim() ||
    'Subscribe to the Questurian newsletter — your shortcut to the world’s most unforgettable places.'

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!email) return
    setSubmitted(true)
  }

  return (
    <BlockSection
      className="overflow-hidden bg-[#0a0a0a]"
      contentClassName="py-10 768:py-8 1024:py-10"
      aria-label="Newsletter signup"
    >
      {/* Duotone background: grayscale photo, shadows lifted to deep blue, highlights pulled to brand blue */}
      <div className="absolute inset-0" aria-hidden="true">
        <img
          src="/images/newsletter/lima-pier.jpg"
          alt=""
          className="h-full w-full object-cover grayscale contrast-125"
        />
        <div className="absolute inset-0 bg-[#16226B] mix-blend-screen" />
        <div className="absolute inset-0 bg-[#3B5BDB] mix-blend-multiply" />
      </div>

      {/* min-h matches the featured-article card's image shell (768:360px, 1024:420px) so both bands render the same height */}
      <div className="relative flex flex-col justify-center bg-[#3B5BDB] px-6 py-12 480:px-10 768:min-h-[360px] 768:px-14 768:py-16 1024:min-h-[420px] 1024:px-20 1024:py-20">
        <div className="grid grid-cols-1 gap-10 1024:grid-cols-2 1024:gap-16">
          {/* Left: rule + heading + subcopy */}
          <div className="flex flex-col justify-center">
            <div className="h-[3px] w-16 bg-[#FAF7F2]" />

            <h2 className="mt-6 font-editorial text-[2.6rem] font-semibold leading-[1.05] text-[#FAF7F2] 768:text-[3.4rem] 1024:text-[4rem]">
              {heading}
            </h2>

            <p className="mt-5 max-w-[32rem] font-[family-name:var(--font-dm-sans)] text-[1rem] leading-relaxed text-[#FAF7F2]/85 768:text-[1.1rem]">
              {subheading}
            </p>
          </div>

          {/* Right: signup form */}
          <div className="flex flex-col justify-center">
            {submitted ? (
              <p className="font-[family-name:var(--font-dm-sans)] text-[1rem] text-[#FAF7F2]">
                You&rsquo;re on the list. We&rsquo;ll be in touch.
              </p>
            ) : (
              <form onSubmit={handleSubmit} noValidate>
                <label
                  htmlFor="newsletter-email"
                  className="block font-[family-name:var(--font-dm-sans)] text-[0.9rem] font-medium text-[#FAF7F2]"
                >
                  Your email address
                </label>
                <input
                  id="newsletter-email"
                  type="email"
                  required
                  placeholder="your.email@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-2 h-[56px] w-full border border-[#1A1A1A]/20 bg-white px-4 font-[family-name:var(--font-dm-sans)] text-[0.95rem] text-[#1A1A1A] placeholder-[#1A1A1A]/35 outline-none focus:border-[#1A1A1A]"
                />
                <button
                  type="submit"
                  className="mt-6 h-[56px] bg-[#1A1A1A] px-10 font-[family-name:var(--font-dm-sans)] text-[0.95rem] font-semibold text-[#FAF7F2] transition-colors hover:bg-black"
                >
                  Sign up
                </button>

                <p className="mt-5 font-[family-name:var(--font-dm-sans)] text-[0.72rem] leading-relaxed text-[#FAF7F2]/60">
                  By signing up you agree to receive updates from Questurian. No spam, ever.
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </BlockSection>
  )
}
