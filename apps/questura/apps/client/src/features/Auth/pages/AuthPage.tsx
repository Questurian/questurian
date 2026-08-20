"use client";

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { SuspenseBoundary } from '@/components/shared/SuspenseBoundary';
import { queryKeys } from '@/lib/react-query';
import { isPopupWindow } from '@/features/Auth/lib/auth-utils';
import { getSafeRedirectPath, parseSafeUserData } from '@/lib/validations';

function AuthStatusCard({
  tone,
  title,
  body,
  hint,
}: {
  tone: 'success' | 'loading' | 'error';
  title: string;
  body: string;
  hint?: string;
}) {
  const iconWrap =
    tone === 'success'
      ? 'bg-[#e8f5e9]'
      : tone === 'error'
        ? 'bg-[#fce4ec]'
        : 'bg-white border border-[#e5e2dc]';
  const iconColor =
    tone === 'success'
      ? 'text-[#2e7d32]'
      : tone === 'error'
        ? 'text-[#c62828]'
        : 'text-[#6b6a68]';

  return (
    <div className="min-h-screen flex items-center justify-center px-5">
      <div className="w-full max-w-md">
        <div className="bg-[#f7f6f2] border border-[#d7d4ce] rounded-sm p-8 text-center">
          <div className={`inline-flex items-center justify-center w-12 h-12 rounded-full mb-4 ${iconWrap}`}>
            {tone === 'loading' ? (
              <div className="w-6 h-6 border-2 border-[#9a9894] border-t-transparent rounded-full animate-spin" />
            ) : tone === 'success' ? (
              <svg className={`w-6 h-6 ${iconColor}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className={`w-6 h-6 ${iconColor}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
          </div>
          <h2 className="font-display text-[1.35rem] text-[#1A1A1A] mb-2">
            {title}
          </h2>
          <p className="text-[0.88rem] text-[#6b6a68] leading-[1.65]">
            {body}
          </p>
          {hint ? (
            <p className="mt-3 text-[0.78rem] text-[#9a9894]">
              {hint}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function AuthPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams() ?? new URLSearchParams();
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
      <AuthStatusCard
        tone="success"
        title="Success!"
        body="Authentication complete. This window will close automatically."
        hint="You can close this window if it doesn't close automatically."
      />
    );
  }

  if (isProcessing) {
    return (
      <AuthStatusCard
        tone="loading"
        title="Processing authentication..."
        body="Please wait while we complete your sign-in."
      />
    );
  }

  if (error) {
    return (
      <AuthStatusCard
        tone="error"
        title="Authentication Failed"
        body={error}
        hint="Redirecting to login page..."
      />
    );
  }

  // This shouldn't render, but just in case
  return null;
}

export default function AuthPage() {
  return (
    <SuspenseBoundary fallback={
      <AuthStatusCard
        tone="loading"
        title="Loading..."
        body="Please wait."
      />
    }>
      <AuthPageContent />
    </SuspenseBoundary>
  );
}
