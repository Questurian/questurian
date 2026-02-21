'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
export default function EmailChangeSuccessPage() {
  const router = useRouter();
  const searchParams = useSearchParams() ?? new URLSearchParams();
  const [newEmail, setNewEmail] = useState<string | null>(null);
  const [googleWasUnlinked, setGoogleWasUnlinked] = useState(false);

  useEffect(() => {
    const email = searchParams.get('newEmail');
    const unlinked = searchParams.get('googleUnlinked') === 'true';
    setNewEmail(email);
    setGoogleWasUnlinked(unlinked);
  }, [searchParams]);

  const handleGoToLogin = () => {
    router.push('/auth');
  };

  return (
    <div className="min-h-screen">
      <div className="px-6 pt-8 pb-16 480:pt-10 768:pt-12">
        <div className="max-w-xl mx-auto">
          <div className="mb-8">
            <h1 className="font-display text-[1.35rem] text-[#1A1A1A] 480:text-[1.55rem] 768:text-[1.75rem]">
              Email Changed Successfully
            </h1>
            <p className="mt-2 text-[0.88rem] text-[#6b6a68] leading-[1.6]">
              Your email address has been updated
            </p>
          </div>

          <div className="bg-[#f7f6f2] border border-[#d7d4ce] rounded-sm p-6 480:p-8">
            {/* Success Icon */}
            <div className="flex justify-center mb-6">
              <div className="flex items-center justify-center h-12 w-12 rounded-full bg-[#e8f5e9]">
                <svg className="h-6 w-6 text-[#2e7d32]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>

            {/* Success Message */}
            <div className="text-center mb-6">
              <h2 className="font-display text-[1.1rem] text-[#1A1A1A] mb-2">
                Your email has been changed
              </h2>
              <p className="text-[0.88rem] text-[#6b6a68]">
                Your email address has been successfully updated.
              </p>
            </div>

            {/* New Email Display */}
            {newEmail && (
              <div className="bg-white border border-[#e5e2dc] rounded-sm p-4 mb-5">
                <p className="text-[0.82rem] text-[#6b6a68] mb-1">
                  New email address:
                </p>
                <p className="text-[0.88rem] font-medium text-[#1A1A1A]">
                  {newEmail}
                </p>
              </div>
            )}

            {/* Google Unlink Warning */}
            {googleWasUnlinked && (
              <div className="bg-[#fff3e0] border border-[#ffe0b2] rounded-sm p-4 mb-5">
                <p className="text-[0.84rem] text-[#e65100] leading-[1.55]">
                  <strong>Note:</strong> Your Google account has been unlinked due to the email change. You can re-link it after logging in if you&apos;d like.
                </p>
              </div>
            )}

            {/* Re-login Instructions */}
            <div className="bg-white border border-[#e5e2dc] rounded-sm p-4 mb-6">
              <p className="text-[0.84rem] font-medium text-[#1A1A1A] mb-2">
                Next steps:
              </p>
              <ul className="text-[0.82rem] text-[#6b6a68] space-y-1 list-disc list-inside leading-[1.65]">
                <li>Click the button below to proceed to login</li>
                <li>Sign in with your new email address</li>
                <li>You&apos;ll be fully logged back into your account</li>
              </ul>
            </div>

            {/* CTA Button */}
            <button
              onClick={handleGoToLogin}
              className="
                block w-full bg-[#2C2C2C] hover:bg-[#1A1A1A]
                text-white text-center py-3.5 rounded
                text-[0.88rem] font-medium transition-colors
              "
            >
              Go to Login
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
