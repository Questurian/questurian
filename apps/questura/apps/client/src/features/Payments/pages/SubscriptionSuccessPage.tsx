"use client";

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { SuspenseBoundary } from '@/components/shared/SuspenseBoundary';
import { get } from '@/lib/api';
import { queryKeys } from '@/lib/react-query';
import type { CurrentPrincipalResponse } from '@/lib/user/types';

const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 8000;

type Confirmation = 'checking' | 'active' | 'pending';

function SubscriptionSuccessContent() {
  const searchParams = useSearchParams() ?? new URLSearchParams();
  const sessionId = searchParams?.get('session_id');
  const queryClient = useQueryClient();
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
  }, [mounted, queryClient]);

  if (!mounted) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-lg">Loading...</div>
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
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center">
        <div className="mb-6">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
            confirmation === 'active'
              ? 'bg-green-100 dark:bg-green-900/20'
              : 'bg-gray-100 dark:bg-gray-700'
          }`}>
            {confirmation === 'active' ? (
              <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            ) : confirmation === 'checking' ? (
              <div className="w-8 h-8 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-8 h-8 text-gray-500 dark:text-gray-300" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
              </svg>
            )}
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
            {confirmation === 'active' ? '🎉 ' : ''}{headline}
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300 mb-6">
            {body}
          </p>
        </div>

        {sessionId && (
          <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg mb-6">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              <span className="font-medium">Session ID:</span> {sessionId}
            </p>
          </div>
        )}

        <div className="space-y-4">
          <Link
            href="/account"
            className="inline-block w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            Go to Account Dashboard
          </Link>

          <Link
            href="/"
            className="inline-block w-full bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            Return to Home
          </Link>
        </div>

        {confirmation === 'active' && (
          <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-600">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Thank you for your subscription! You now have access to all premium features.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SubscriptionSuccessPage() {
  return (
    <SuspenseBoundary fallback={
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    }>
      <SubscriptionSuccessContent />
    </SuspenseBoundary>
  );
}
