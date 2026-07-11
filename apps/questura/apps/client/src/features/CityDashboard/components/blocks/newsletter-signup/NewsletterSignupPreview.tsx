'use client'

import { useState, type JSX, type FormEvent } from 'react'

import type { NewsletterSignupBlock, HomepageBlockLayoutProps } from '../../../types'
import { BlockSection } from '../BlockSection'

export function NewsletterSignupPreview({
  block,
}: HomepageBlockLayoutProps<NewsletterSignupBlock>): JSX.Element {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const heading = block.sectionHeading?.trim() || 'Stay in the Know'
  const subheading = block.sectionSubheading?.trim() || null

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!email) return
    setSubmitted(true)
  }

  return (
    <BlockSection className="bg-[#0a0a0a]" contentClassName="py-12 768:py-16" aria-label="Newsletter signup">
        <div className="border-t border-white/20 pt-10 768:pt-12">
          <div className="grid grid-cols-1 gap-10 1024:grid-cols-2 1024:gap-16">

            {/* Left: content + form */}
            <div className="flex flex-col justify-center">
              <p className="font-[family-name:var(--font-dm-sans)] text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-white/50 768:text-[0.67rem]">
                Questurian Newsletter
              </p>

              <h2 className="mt-3 font-editorial text-[2rem] font-semibold leading-[1.1] text-white 768:text-[2.6rem] 1024:text-[3rem]">
                {heading}
              </h2>

              {subheading ? (
                <p className="mt-3 font-[family-name:var(--font-dm-sans)] text-[0.9rem] leading-relaxed text-white/60 768:text-[0.95rem]">
                  {subheading}
                </p>
              ) : null}

              {submitted ? (
                <p className="mt-8 font-[family-name:var(--font-dm-sans)] text-[0.95rem] text-white/80">
                  You&rsquo;re on the list. We&rsquo;ll be in touch.
                </p>
              ) : (
                <>
                  <form
                    onSubmit={handleSubmit}
                    className="mt-8 flex flex-col gap-3 480:flex-row"
                    noValidate
                  >
                    <input
                      type="email"
                      required
                      placeholder="Email Address"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-[52px] flex-1 border border-white/20 bg-white/5 px-4 font-[family-name:var(--font-dm-sans)] text-[0.9rem] text-white placeholder-white/30 outline-none focus:border-white/50"
                    />
                    <button
                      type="submit"
                      className="h-[52px] shrink-0 border border-white/30 bg-white/10 px-7 font-[family-name:var(--font-dm-sans)] text-[0.85rem] font-semibold uppercase tracking-[0.1em] text-white/80 transition-colors hover:bg-white/20 hover:text-white"
                    >
                      Sign Up
                    </button>
                  </form>

                  <p className="mt-4 font-[family-name:var(--font-dm-sans)] text-[0.7rem] leading-relaxed text-white/30">
                    By signing up you agree to receive updates from Questurian. No spam, ever.
                  </p>
                </>
              )}
            </div>

            {/* Right: empty decorative column */}
            <div className="hidden 1024:block" aria-hidden="true" />
          </div>
        </div>
    </BlockSection>
  )
}
