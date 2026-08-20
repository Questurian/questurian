"use client";

import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { SuspenseBoundary } from '@/components/shared/SuspenseBoundary';
import { get } from '@/lib/api';
import { queryKeys } from '@/lib/react-query';
import type { CurrentPrincipalResponse } from '@/lib/user/types';
import { getSafeRedirectPath } from '@/lib/validations';

const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 8000;

type Confirmation = 'checking' | 'active' | 'pending';

function SubscriptionSuccessContent() {
  const searchParams = useSearchParams() ?? new URLSearchParams();
  const sessionId = searchParams?.get('session_id');
  const queryClient = useQueryClient();
  const router = useRouter();
  // Validated server-side before it reached the success_url, and validated
  // again here because a query parameter is editable in the address bar.
  const returnTo = getSafeRedirectPath(searchParams?.get('returnTo') ?? null);
  const [mounted, setMounted] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation>('checking');

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    let cancelled = false;
    const startedAt = Date.now();

    const poll = async () => {
      while (!cancelled && Date.now() - startedAt < POLL_TIMEOUT_MS) {
        try {
          const response = await get<CurrentPrincipalResponse>('/api/me');
          if (response.principal?.membership.active) {
            if (!cancelled) {
              setConfirmation('active');
              await queryClient.invalidateQueries({ queryKey: queryKeys.userMe() });

              // Only once entitlement is genuinely live. Forwarding on the
              // Stripe redirect alone would land the buyer on the article
              // while the webhook is still in flight, and show them the very
              // paywall they just paid to remove.
              if (returnTo && returnTo !== '/') {
                router.replace(returnTo);
              }
            }
            return;
          }
        } catch {
          // Webhook delay and a transient /api/me failure look the same here.
        }

        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }

      if (!cancelled) setConfirmation('pending');
    };

    void poll();
    return () => {
      cancelled = true;
    };
  }, [mounted, queryClient, returnTo, router]);

  if (!mounted) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-[0.88rem] text-[#6b6a68]">Loading...</div>
      </div>
    );
  }

  const headline =
    confirmation === 'active'
      ? 'Welcome to Premium!'
      : confirmation === 'checking'
        ? 'Confirming your subscription...'
        : 'Payment received';

  const body =
    confirmation === 'active'
      ? 'Your subscription is now active and ready to use.'
      : confirmation === 'checking'
        ? 'This usually takes a few seconds while we confirm the payment.'
        : 'Your payment went through. Membership may take a moment to appear on your account — refresh or check back shortly.';

  return (
    <div className="min-h-screen">
      <div className="px-6 pt-8 pb-16 480:pt-10 768:pt-12">
        <div className="max-w-xl mx-auto">
          <div className="bg-[#f7f6f2] border border-[#d7d4ce] rounded-sm p-6 480:p-8 text-center">
            <div className="flex justify-center mb-6">
              <div className={`flex items-center justify-center h-12 w-12 rounded-full ${
                confirmation === 'active'
                  ? 'bg-[#e8f5e9]'
                  : 'bg-white border border-[#e5e2dc]'
              }`}>
                {confirmation === 'active' ? (
                  <svg className="h-6 w-6 text-[#2e7d32]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : confirmation === 'checking' ? (
                  <div className="w-6 h-6 border-2 border-[#9a9894] border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="h-6 w-6 text-[#6b6a68]" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
            </div>

            <h1 className="font-display text-[1.35rem] text-[#1A1A1A] mb-2 480:text-[1.55rem]">
              {headline}
            </h1>
            <p className="text-[0.88rem] text-[#6b6a68] leading-[1.65] mb-6">
              {body}
            </p>

            {sessionId && (
              <div className="bg-white border border-[#e5e2dc] rounded-sm p-4 mb-6 text-left">
                <p className="text-[0.82rem] text-[#6b6a68]">
                  <span className="font-medium text-[#4f4e4b]">Session ID:</span> {sessionId}
                </p>
              </div>
            )}

            <div className="space-y-3">
              <Link
                href="/account"
                className="
                  block w-full bg-[#2C2C2C] hover:bg-[#1A1A1A]
                  text-white text-center py-3.5 rounded
                  text-[0.88rem] font-medium transition-colors
                "
              >
                Go to Account Dashboard
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

            {confirmation === 'active' && (
              <div className="mt-8 pt-5 border-t border-[#e5e2dc]">
                <p className="text-[0.78rem] text-[#9a9894] leading-[1.65]">
                  Thank you for your subscription! You now have access to all premium features.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SubscriptionSuccessPage() {
  return (
    <SuspenseBoundary fallback={
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-[0.88rem] text-[#6b6a68]">Loading...</div>
      </div>
    }>
      <SubscriptionSuccessContent />
    </SuspenseBoundary>
  );
}
