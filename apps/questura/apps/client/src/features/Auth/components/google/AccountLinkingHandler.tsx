"use client";

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query';
import { isPopupWindow } from '@/features/Auth/lib/auth-utils';
import { parseSafeUserData } from '@/lib/validations';
import type { User } from "@/lib/user/types";
import LoadingSpinner from '@/components/shared/ui/LoadingSpinner';

export default function AccountLinkingHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [isProcessing, setIsProcessing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [linkingResult, setLinkingResult] = useState<string | null>(null);

  useEffect(() => {
    const handleAccountLinking = async () => {
      try {
        const linked = searchParams.get('linked');
        const userParam = searchParams.get('user');
        const error = searchParams.get('error');

        if (error === 'linking_failed') {
          setError('Failed to link Google account. Please try again.');
          setLinkingResult(null);

          if (isPopupWindow()) {
            if (window.opener) {
              window.opener.postMessage({
                type: 'GOOGLE_AUTH_ERROR',
                error: 'Failed to link Google account. Please try again.'
              }, window.location.origin);
            }
            setTimeout(() => window.close(), 2000);
          } else {
            setTimeout(() => {
              window.history.replaceState({}, '', '/account');
              router.push('/account');
            }, 3000);
          }
          return;
        }

        if (linked === 'google') {
          // Get current user from React Query cache BEFORE updating
          const currentUser = queryClient.getQueryData<User>(queryKeys.userMe());

          // Parse and validate user data
          const validatedUserData = parseSafeUserData(userParam);

          // Cookie is automatically set by backend
          if (validatedUserData) {
            // Update React Query cache immediately with validated data
            queryClient.setQueryData(queryKeys.userMe(), validatedUserData);

            // Compare with currentUser that we read earlier
            if (currentUser?.email && validatedUserData.email && currentUser.email !== validatedUserData.email) {
              setLinkingResult(`Google account linked successfully, but note: Google email (${validatedUserData.email}) differs from your account email (${currentUser.email})`);
            } else {
              setLinkingResult('Google account linked successfully!');
            }
          } else {
            // Invalid or missing user data, still invalidate to refetch from API
            setLinkingResult('Google account linked successfully!');
            // Only refetch if we don't have validated data
            queryClient.invalidateQueries({ queryKey: queryKeys.userMe() });
          }

          if (isPopupWindow()) {
            if (window.opener) {
              window.opener.postMessage({
                type: 'GOOGLE_AUTH_SUCCESS',
                message: 'Google account linked successfully!'
              }, window.location.origin);
            }
            window.close();
          } else {
            setTimeout(() => {
              window.history.replaceState({}, '', '/account');
              router.push('/account');
            }, 2000);
          }
        } else {
          if (isPopupWindow()) {
            window.close();
          } else {
            router.push('/account');
          }
        }

      } catch (err) {
        setError(err instanceof Error ? err.message : 'Account linking failed');

        if (isPopupWindow()) {
          if (window.opener) {
            window.opener.postMessage({
              type: 'GOOGLE_AUTH_ERROR',
              error: err instanceof Error ? err.message : 'Account linking failed'
            }, window.location.origin);
          }
          setTimeout(() => window.close(), 1000);
        } else {
          setTimeout(() => {
            router.push('/account');
          }, 3000);
        }
      } finally {
        setIsProcessing(false);
      }
    };

    handleAccountLinking();
  }, [searchParams, router, queryClient]);

  if (isProcessing) {
    return (
      <LoadingSpinner
        message="Processing account linking..."
        subMessage="Please wait while we update your account."
        variant="fullscreen"
      />
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="mx-auto h-12 w-12 bg-red-100 rounded-full flex items-center justify-center">
            <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Account Linking Failed
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            {error}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-500">
            Redirecting to dashboard...
          </p>
        </div>
      </div>
    );
  }

  if (linkingResult) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="mx-auto h-12 w-12 bg-green-100 rounded-full flex items-center justify-center">
            <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Success!
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            {linkingResult}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-500">
            Redirecting to dashboard...
          </p>
        </div>
      </div>
    );
  }

  return null;
}