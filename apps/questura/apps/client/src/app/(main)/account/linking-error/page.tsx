'use client';

import { useEffect, useState } from 'react';

export default function LinkingErrorPage() {
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          // Post message to parent window before closing
          if (window.opener) {
            window.opener.postMessage(
              { type: 'linking_failed', message: 'Account linking failed' },
              '*'
            );
          }
          // Close the popup window
          window.close();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center px-5">
      <div className="w-full max-w-md">
        <div className="bg-[#f7f6f2] border border-[#d7d4ce] rounded-sm p-8 text-center">
          <div className="mb-6">
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
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <h1 className="font-display text-[1.35rem] text-[#1A1A1A] mb-2">
              Account Linking Failed
            </h1>
            <p className="text-[0.88rem] text-[#6b6a68] leading-[1.65]">
              The Google account email didn&apos;t match your current account.
            </p>
          </div>

          <div className="bg-[#fce4ec] border border-[#f8bbd0] text-[#c62828] px-4 py-3 rounded-sm">
            <p className="text-[0.84rem] font-medium">
              This window will close in {countdown} second{countdown !== 1 ? 's' : ''}.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
