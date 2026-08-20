'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error for monitoring/debugging
    // In production, this would send to an error tracking service
    if (process.env.NODE_ENV === 'development') {
      console.error('Application error:', error);
    }
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center px-5">
      <div className="w-full max-w-md">
        <div className="bg-[#f7f6f2] border border-[#d7d4ce] rounded-sm p-8 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-[#fce4ec] rounded-full mb-4">
            <svg
              className="w-6 h-6 text-[#c62828]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4v2m0 0a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>

          <h1 className="font-display text-[1.35rem] text-[#1A1A1A]">
            Something went wrong
          </h1>
          <p className="mt-2 text-[0.88rem] text-[#6b6a68] leading-[1.65]">
            We encountered an unexpected error. Please try again.
          </p>

          {process.env.NODE_ENV === 'development' && error.message && (
            <details className="mt-4 text-left">
              <summary className="cursor-pointer text-[0.82rem] text-[#9a9894] hover:text-[#1A1A1A]">
                Error details (development only)
              </summary>
              <pre className="mt-2 p-3 bg-white border border-[#e5e2dc] rounded-sm text-xs overflow-auto text-[#c62828]">
                {error.message}
              </pre>
            </details>
          )}

          <button
            onClick={() => reset()}
            className="
              mt-6 w-full bg-[#2C2C2C] hover:bg-[#1A1A1A]
              text-white text-center py-3.5 rounded
              text-[0.88rem] font-medium transition-colors
            "
          >
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}
