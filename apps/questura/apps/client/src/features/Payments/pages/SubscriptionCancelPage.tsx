"use client";

import Link from 'next/link';

export default function SubscriptionCancelPage() {
  return (
    <div className="min-h-screen">
      <div className="px-6 pt-8 pb-16 480:pt-10 768:pt-12">
        <div className="max-w-xl mx-auto">
          <div className="bg-[#f7f6f2] border border-[#d7d4ce] rounded-sm p-6 480:p-8 text-center">
            <div className="flex justify-center mb-6">
              <div className="flex items-center justify-center h-12 w-12 rounded-full bg-[#fff3e0]">
                <svg className="h-6 w-6 text-[#e65100]" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
            </div>

            <h1 className="font-display text-[1.35rem] text-[#1A1A1A] mb-2 480:text-[1.55rem]">
              Subscription Cancelled
            </h1>
            <p className="text-[0.88rem] text-[#6b6a68] leading-[1.65] mb-6">
              No worries! You can try again anytime when you&apos;re ready.
            </p>

            <div className="bg-white border border-[#e5e2dc] rounded-sm p-4 mb-6 text-left">
              <h3 className="text-[0.84rem] font-medium text-[#1A1A1A] mb-2">
                What happens next?
              </h3>
              <ul className="text-[0.82rem] text-[#6b6a68] space-y-1 list-disc list-inside leading-[1.65]">
                <li>No charges have been made to your account</li>
                <li>You can subscribe anytime with no penalties</li>
                <li>Your account remains active for free features</li>
              </ul>
            </div>

            <div className="space-y-3">
              <Link
                href="/join"
                className="
                  block w-full bg-[#2C2C2C] hover:bg-[#1A1A1A]
                  text-white text-center py-3.5 rounded
                  text-[0.88rem] font-medium transition-colors
                "
              >
                Try Again
              </Link>

              <Link
                href="/"
                className="
                  block w-full bg-white border border-[#d7d4ce]
                  text-[#4f4e4b] text-center py-3 rounded
                  text-[0.88rem] font-medium transition-colors
                  hover:bg-[#f0efeb]
                "
              >
                Return to Home
              </Link>
            </div>

            <div className="mt-8 pt-5 border-t border-[#e5e2dc]">
              <p className="text-[0.78rem] text-[#9a9894]">
                Need help?{' '}
                <Link href="/contact" className="text-[#2563EB] hover:text-[#1A1A1A] underline underline-offset-2">
                  Contact our support team
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
