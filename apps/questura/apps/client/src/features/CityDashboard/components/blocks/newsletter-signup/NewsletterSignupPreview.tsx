"use client";

import { useState, type JSX, type FormEvent } from "react";

import type {
  NewsletterSignupBlock,
  HomepageBlockLayoutProps,
} from "../../../types";
import { BlockSection } from "../BlockSection";

export function NewsletterSignupPreview({
  block,
}: HomepageBlockLayoutProps<NewsletterSignupBlock>): JSX.Element {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const heading = block.sectionHeading?.trim() || "Newsletter";
  const subheading =
    block.sectionSubheading?.trim() ||
    "Subscribe to the Questurian newsletter — your shortcut to the world’s most unforgettable places.";

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email) return;
    setSubmitted(true);
  }

  return (
    <BlockSection
      contentClassName="py-8 768:py-10"
      aria-label="Newsletter signup"
    >
      <div className="relative overflow-hidden bg-[#16226B]">
        {/* Duotone background stays inside the shared page-width boundary. */}
        <div className="absolute inset-0" aria-hidden="true">
          <img
            src="/images/newsletter/lima-pier.jpg"
            alt=""
            className="h-full w-full object-cover grayscale contrast-125"
          />
          <div className="absolute inset-0 bg-[#16226B] mix-blend-screen" />
          <div className="absolute inset-0 bg-accent/90 mix-blend-multiply" />
          <div className="absolute inset-0 bg-[#16226B]/45" />
        </div>

        <div className="relative grid gap-10 px-6 py-10 480:px-10 768:min-h-[320px] 768:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)] 768:items-center 768:gap-12 768:px-14 768:py-12 1024:min-h-[360px] 1024:gap-20 1024:px-20">
          {/* Left: rule + heading + subcopy */}
          <div className="max-w-[38rem]">
            <div className="h-[3px] w-16 bg-background" />

            <h2 className="mt-5 font-editorial text-[2.5rem] font-semibold leading-[1.05] text-background 768:text-[3.2rem] 1024:text-[3.6rem]">
              {heading}
            </h2>

            <p className="mt-4 max-w-[34rem] font-[family-name:var(--font-dm-sans)] text-[1rem] leading-relaxed text-background/85 768:text-[1.05rem]">
              {subheading}
            </p>
          </div>

          {/* Right: signup form */}
          <div className="w-full 768:justify-self-end">
            {submitted ? (
              <p className="font-[family-name:var(--font-dm-sans)] text-[1rem] text-background">
                You&rsquo;re on the list. We&rsquo;ll be in touch.
              </p>
            ) : (
              <form onSubmit={handleSubmit} noValidate>
                <label
                  htmlFor="newsletter-email"
                  className="block font-[family-name:var(--font-dm-sans)] text-[0.9rem] font-medium text-background"
                >
                  Your email address
                </label>
                <div className="mt-2 flex flex-col gap-3 1024:flex-row">
                  <input
                    id="newsletter-email"
                    type="email"
                    required
                    placeholder="your.email@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-[56px] min-w-0 flex-1 border border-foreground/20 bg-paper px-4 font-[family-name:var(--font-dm-sans)] text-[0.95rem] text-foreground placeholder-foreground/40 outline-none focus:border-foreground"
                  />
                  <button
                    type="submit"
                    className="h-[56px] shrink-0 bg-foreground px-8 font-[family-name:var(--font-dm-sans)] text-[0.95rem] font-semibold text-background transition-colors hover:bg-black"
                  >
                    Sign up
                  </button>
                </div>

                <p className="mt-4 max-w-[34rem] font-[family-name:var(--font-dm-sans)] text-[0.72rem] leading-relaxed text-background/65">
                  By signing up you agree to receive updates from Questurian. No
                  spam, ever.
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </BlockSection>
  );
}
