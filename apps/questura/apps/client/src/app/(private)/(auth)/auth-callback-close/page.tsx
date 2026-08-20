"use client";

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

function AuthCallbackCloseContent() {
  const searchParams = useSearchParams();
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const handleCallback = () => {
      const params = searchParams ?? new URLSearchParams();
      const userParam = params.get('user');
      const error = params.get('error');
      const linked = params.get('linked');

      console.log('Auth callback close page:', {
        user: userParam ? 'present' : 'missing',
        error: error || 'none',
        linked: linked || 'none'
      });

      // Parse user data if provided (React Query cache will be source of truth)
      // Cookie is automatically set by backend
      if (userParam) {
        try {
          JSON.parse(decodeURIComponent(userParam)); // Validate JSON only
        } catch (e) {
          console.warn('Failed to parse user data:', e);
        }
      }

      setClosing(true);

      // Send message to parent window
      if (window.opener) {
        if (error) {
          // Only send error if there's an actual error parameter
          window.opener.postMessage({
            type: 'GOOGLE_AUTH_ERROR',
            error: error
          }, window.location.origin);
        } else if (linked === 'google') {
          // Successful linking - cookie automatically set by backend
          window.opener.postMessage({
            type: 'GOOGLE_AUTH_SUCCESS',
            user: userParam ? JSON.parse(decodeURIComponent(userParam)) : null
          }, window.location.origin);
        } else {
          // Default success
          window.opener.postMessage({
            type: 'GOOGLE_AUTH_SUCCESS',
            user: userParam ? JSON.parse(decodeURIComponent(userParam)) : null
          }, window.location.origin);
        }
      }

      // Try to close immediately
      window.close();

      // Retry a few times in case browser blocks it
      let attempts = 0;
      const closeInterval = setInterval(() => {
        attempts++;
        window.close();
        if (attempts >= 5) {
          clearInterval(closeInterval);
        }
      }, 100);
    };

    handleCallback();
  }, [searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center px-5">
      <div className="w-full max-w-md">
        <div className="bg-[#f7f6f2] border border-[#d7d4ce] rounded-sm p-8 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-[#e8f5e9] rounded-full mb-4">
            {closing ? (
              <svg className="w-6 h-6 text-[#2e7d32]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <div className="w-6 h-6 border-2 border-[#2e7d32] border-t-transparent rounded-full animate-spin" />
            )}
          </div>
          <h2 className="font-display text-[1.35rem] text-[#1A1A1A] mb-2">
            {closing ? 'Success!' : 'Processing...'}
          </h2>
          <p className="text-[0.88rem] text-[#6b6a68] leading-[1.65]">
            {closing
              ? 'Authentication complete. This window will close automatically.'
              : 'Please wait while we complete your authentication.'}
          </p>
          <p className="mt-3 text-[0.78rem] text-[#9a9894]">
            You can close this window if it doesn&apos;t close automatically.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function AuthCallbackClosePage() {
  return <AuthCallbackCloseContent />;
}
