'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function EmailChangeSuccessPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
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
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Email Changed Successfully
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Your email address has been updated
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm p-6">
        {/* Success Icon */}
        <div className="flex justify-center mb-6">
          <div className="flex items-center justify-center h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/30">
            <svg className="h-6 w-6 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </div>

        {/* Success Message */}
        <div className="text-center mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Your email has been changed
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Your email address has been successfully updated.
          </p>
        </div>

        {/* New Email Display */}
        {newEmail && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-4 mb-6">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
              New email address:
            </p>
            <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
              {newEmail}
            </p>
          </div>
        )}

        {/* Google Unlink Warning */}
        {googleWasUnlinked && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md p-4 mb-6">
            <p className="text-sm text-yellow-800 dark:text-yellow-300">
              <strong>Note:</strong> Your Google account has been unlinked due to the email change. You can re-link it after logging in if you&apos;d like.
            </p>
          </div>
        )}

        {/* Re-login Instructions */}
        <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md p-4 mb-6">
          <p className="text-sm font-medium text-gray-900 dark:text-white mb-2">
            Next steps:
          </p>
          <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1 list-disc list-inside">
            <li>Click the button below to proceed to login</li>
            <li>Sign in with your new email address</li>
            <li>You&apos;ll be fully logged back into your account</li>
          </ul>
        </div>

        {/* CTA Button */}
        <div className="flex space-x-3">
          <button
            onClick={handleGoToLogin}
            className="flex-1 inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-900"
          >
            Go to Login
          </button>
        </div>
      </div>
    </div>
  );
}
