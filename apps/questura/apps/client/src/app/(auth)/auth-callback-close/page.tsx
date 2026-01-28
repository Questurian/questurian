"use client";

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function AuthCallbackCloseContent() {
  const searchParams = useSearchParams();
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const handleCallback = () => {
      const userParam = searchParams.get('user');
      const error = searchParams.get('error');
      const linked = searchParams.get('linked');

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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="max-w-md w-full text-center space-y-4 p-6">
        <div className="mx-auto h-12 w-12 bg-green-100 rounded-full flex items-center justify-center">
          {closing ? (
            <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <div className="animate-spin h-6 w-6 border-2 border-green-600 border-t-transparent rounded-full"></div>
          )}
        </div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          {closing ? 'Success!' : 'Processing...'}
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          {closing
            ? 'Authentication complete. This window will close automatically.'
            : 'Please wait while we complete your authentication.'}
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-500">
          You can close this window if it doesn&apos;t close automatically.
        </p>
      </div>
    </div>
  );
}

export default function AuthCallbackClosePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    }>
      <AuthCallbackCloseContent />
    </Suspense>
  );
}
