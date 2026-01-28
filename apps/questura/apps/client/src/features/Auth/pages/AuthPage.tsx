"use client";

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query';
import { isPopupWindow } from '@/features/Auth/lib/auth-utils';
import { getSafeRedirectPath, parseSafeUserData } from '@/lib/validations';

function AuthPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [isProcessing, setIsProcessing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPopupClosing, setIsPopupClosing] = useState(false);

  useEffect(() => {
    const handleOAuthCallback = async () => {
      try {
        // Check if this is a popup window using utility function
        const isPopup = isPopupWindow();
        const isLinkingFlow = searchParams.get('isLinking') === 'true';

        // Treat as popup if either popup detection or linking flow parameter
        const forcedPopupBehavior = isPopup || isLinkingFlow || (
          !searchParams.get('returnTo') && // No returnTo (regular auth has this)
          (isLinkingFlow || window.name.includes('Auth'))
        );

        const userParam = searchParams.get('user');

        // Cookie is automatically set by backend
        // We only need user data for cache updates

        // Parse and validate user data if provided
        const validatedUserData = parseSafeUserData(userParam);

        // Handle popup case FIRST and EXIT EARLY
        if (forcedPopupBehavior) {
          // Set flag to show "closing popup" UI instead of redirecting
          setIsPopupClosing(true);
          setIsProcessing(false);

          try {
            // Send success message to parent window (with validated data)
            if (window.opener) {
              window.opener.postMessage({
                type: 'GOOGLE_AUTH_SUCCESS',
                user: validatedUserData
              }, window.location.origin);
            }

            // Force close popup immediately
            window.close();

            // Additional fallback - try to close again after small delay
            setTimeout(() => {
              window.close();
            }, 100);

          } catch {
            window.close(); // Close anyway
          }

          // CRITICAL: Exit function completely, don't continue
          return;
        }

        // Parse user data and update React Query cache immediately (before redirect)
        // This ensures components get the updated user state without needing a refresh
        if (validatedUserData) {
          // Update React Query cache synchronously with validated data
          queryClient.setQueryData(queryKeys.userMe(), validatedUserData);
        }

        // Get returnTo parameter from URL with validation
        const returnTo = searchParams.get('returnTo');
        const redirectPath = getSafeRedirectPath(returnTo);

        // Use client-side router navigation to preserve React Query cache
        // This prevents the loading spinner from appearing when navbar mounts
        router.push(redirectPath);

      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Authentication failed';
        setError(errorMessage);

        // Check if this is a popup window (reuse same logic as above)
        const isPopup = isPopupWindow();
        const isLinkingFlow = searchParams.get('isLinking') === 'true';
        const forcedPopupBehavior = isPopup || isLinkingFlow || (
          !searchParams.get('returnTo') &&
          (isLinkingFlow || window.name.includes('Auth'))
        );

        if (forcedPopupBehavior) {
          // Send error message to parent window
          if (window.opener) {
            window.opener.postMessage({
              type: 'GOOGLE_AUTH_ERROR',
              error: errorMessage
            }, window.location.origin);
          }
          
          // Close the popup after a short delay
          setTimeout(() => {
            window.close();
          }, 1000);
        } else {
          // Redirect to home page after error
          setTimeout(() => {
            router.push('/');
          }, 3000);
        }
      } finally {
        setIsProcessing(false);
      }
    };

    handleOAuthCallback();
  }, [searchParams, queryClient, router]);

  // Show popup closing message (prevents showing /account page in popup)
  if (isPopupClosing) {
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
            Authentication complete. This window will close automatically.
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-500">
            You can close this window if it doesn&apos;t close automatically.
          </p>
        </div>
      </div>
    );
  }

  if (isProcessing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="animate-spin mx-auto h-12 w-12 border-4 border-blue-500 border-t-transparent rounded-full"></div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Processing authentication...
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Please wait while we complete your sign-in.
          </p>
        </div>
      </div>
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
            Authentication Failed
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            {error}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-500">
            Redirecting to login page...
          </p>
        </div>
      </div>
    );
  }

  // This shouldn't render, but just in case
  return null;
}

export default function AuthPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    }>
      <AuthPageContent />
    </Suspense>
  );
}