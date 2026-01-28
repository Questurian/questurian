"use client";

import { useState } from 'react';
import { useAuth } from '@/lib/user/hooks';
import { useLinkGoogleMutation } from '@/features/AccountPage/hooks/useAccountMutations';
import { isServiceUnavailableError } from '@/lib/api';

interface GoogleLinkingFlowProps {
  onSuccess?: () => void;
  onCancel?: () => void;
  standalone?: boolean;
}

export default function GoogleLinkingFlow({
  onSuccess,
  onCancel,
  standalone = false
}: GoogleLinkingFlowProps) {
  const { user } = useAuth();
  const linkGoogleMutation = useLinkGoogleMutation();
  const [step, setStep] = useState<'intro' | 'linking' | 'success' | 'error'>('intro');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLinkGoogle = async () => {
    setError(null);
    
    try {
      setLoading(true);
      setStep('linking');
      
      const result = await linkGoogleMutation.mutateAsync();
      
      if (result.authUrl) {
        window.location.href = result.authUrl;
      } else {
        setStep('success');
        if (onSuccess) {
          setTimeout(onSuccess, 2000);
        }
      }
    } catch (error) {
      // Check if it's a service unavailability error for more specific message
      if (isServiceUnavailableError(error)) {
        setError('Service is unavailable. Please try again later.');
      } else {
        setError(error instanceof Error ? error.message : 'Failed to link Google account');
      }
      setStep('error');
    } finally {
      setLoading(false);
    }
  };

  if (!user || user.hasGoogleOAuth) {
    return (
      <div className="text-center p-6">
        <div className="text-green-600 mb-4">
          <svg className="mx-auto h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          Google Account Already Linked
        </h3>
        <p className="text-gray-600">
          Your account is already connected to Google authentication.
        </p>
      </div>
    );
  }

  const containerClasses = standalone 
    ? "min-h-screen bg-gray-50 flex items-center justify-center p-4"
    : "bg-white";

  const contentClasses = standalone
    ? "max-w-md w-full bg-white rounded-lg shadow-lg p-6"
    : "p-6";

  return (
    <div className={containerClasses}>
      <div className={contentClasses}>
        {step === 'intro' && (
          <>
            <div className="text-center mb-6">
              <div className="text-blue-600 mb-4">
                <svg className="mx-auto h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                Link Your Google Account
              </h2>
              <p className="text-gray-600">
                You currently sign in with password only. Linking your Google account gives you an alternative way to access your account.
              </p>
            </div>

            <div className="bg-blue-50 rounded-lg p-4 mb-6">
              <h3 className="text-sm font-medium text-blue-900 mb-2">Benefits of linking Google:</h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• Faster sign-in with one click</li>
                <li>• No need to remember another password</li>
                <li>• Enhanced security with Google&apos;s protection</li>
                <li>• Backup access method if you forget your password</li>
              </ul>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-yellow-800">Important</h3>
                  <p className="text-sm text-yellow-700 mt-1">
                    Make sure to use the same email address ({user?.email}) for your Google account.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={handleLinkGoogle}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-colors flex items-center justify-center cursor-pointer"
              >
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Link with Google
              </button>
              {onCancel && (
                <button
                  onClick={onCancel}
                  className="flex-1 border border-gray-300 text-gray-700 font-medium py-2 px-4 rounded-md hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              )}
            </div>
          </>
        )}

        {step === 'linking' && (
          <>
            <div className="text-center">
              <div className="text-blue-600 mb-4">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                Redirecting to Google...
              </h2>
              <p className="text-gray-600 mb-6">
                You&apos;ll be redirected to Google to authorize the connection. Please wait...
              </p>
              
              <div className="bg-blue-50 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  If you&apos;re not redirected automatically, please check if popups are blocked and try again.
                </p>
              </div>
            </div>
          </>
        )}

        {step === 'success' && (
          <>
            <div className="text-center">
              <div className="text-green-600 mb-4">
                <svg className="mx-auto h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                Google Account Linked Successfully!
              </h2>
              <p className="text-gray-600 mb-6">
                You can now sign in using either your password or your Google account.
              </p>

              <div className="bg-green-50 rounded-lg p-4 mb-6">
                <h3 className="text-sm font-medium text-green-900 mb-2">What&apos;s next?</h3>
                <ul className="text-sm text-green-800 space-y-1">
                  <li>• You&apos;ll be automatically redirected</li>
                  <li>• Your next login can use either method</li>
                  <li>• Manage your authentication methods in settings</li>
                </ul>
              </div>

              {onSuccess && (
                <button
                  onClick={onSuccess}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-md transition-colors cursor-pointer"
                >
                  Continue
                </button>
              )}
            </div>
          </>
        )}

        {step === 'error' && (
          <>
            <div className="text-center">
              <div className="text-red-600 mb-4">
                <svg className="mx-auto h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5C2.962 18.333 3.924 20 5.464 20z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                Failed to Link Google Account
              </h2>
              
              {error && (
                <div className="mb-6 bg-red-50 border border-red-200 rounded-md p-4">
                  <div className="text-sm text-red-700">{error}</div>
                </div>
              )}

              <div className="flex space-x-3">
                <button
                  onClick={handleLinkGoogle}
                  disabled={loading}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-md transition-colors cursor-pointer"
                >
                  Try Again
                </button>
                <button
                  onClick={() => setStep('intro')}
                  className="flex-1 border border-gray-300 text-gray-700 font-medium py-2 px-4 rounded-md hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  Back
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}