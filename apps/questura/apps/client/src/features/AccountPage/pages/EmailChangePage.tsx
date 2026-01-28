"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/user/hooks';
import { useVerifyPasswordMutation, useRequestEmailChangeMutation, useConfirmEmailChangeMutation } from '../hooks/useEmailChangeMutations';
import LoadingSpinner from '@/components/shared/ui/LoadingSpinner';
import PasswordInput from '@/components/shared/ui/PasswordInput';

type Step = 'verifyPassword' | 'enterNewEmail' | 'verifyNewEmail';

export default function EmailChangePage() {
  const router = useRouter();
  const { user, loading, isAuthenticated } = useAuth();
  const [step, setStep] = useState<Step>('verifyPassword');
  const [password, setPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [willUnlinkGoogle, setWillUnlinkGoogle] = useState(false);

  // React Query mutations
  const verifyPasswordMutation = useVerifyPasswordMutation();
  const requestEmailChangeMutation = useRequestEmailChangeMutation();
  const confirmEmailChangeMutation = useConfirmEmailChangeMutation();

  // Redirect to home with login modal if not authenticated
  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push('/?showLogin=true&redirect=/account/change-email');
    }
  }, [loading, isAuthenticated, router]);

  // Check if user has password (required for email change)
  useEffect(() => {
    if (user && !loading) {
      const hasPassword = user?.hasLocalPassword || user?.authProvider === 'local' || user?.authProvider === 'dual';
      if (!hasPassword) {
        // Redirect back to account with message
        router.push('/account');
      }
    }
  }, [user, loading, router]);

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!isAuthenticated) {
    return null; // Will redirect via useEffect
  }

  const handleVerifyPassword = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    verifyPasswordMutation.mutate(
      { password },
      {
        onSuccess: (data) => {
          if (data.success) {
            setStep('enterNewEmail');
          } else {
            setError('Incorrect password. Please try again.');
          }
        },
        onError: (err) => {
          if (err instanceof Error) {
            if (err.message.includes('No password set')) {
              setError('You must add a password to your account before changing your email.');
            } else {
              setError(err.message);
            }
          } else {
            setError('Failed to verify password. Please try again.');
          }
        },
      }
    );
  };

  const handleRequestChange = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    requestEmailChangeMutation.mutate(
      { newEmail },
      {
        onSuccess: (data) => {
          if (data.willUnlinkGoogle) {
            setWillUnlinkGoogle(true);
          }
          setStep('verifyNewEmail');
        },
        onError: (err) => {
          if (err instanceof Error) {
            setError(err.message);
          } else {
            setError('Failed to request email change. Please try again.');
          }
        },
      }
    );
  };

  const handleConfirmChange = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    confirmEmailChangeMutation.mutate(
      { code: verificationCode },
      {
        onSuccess: (data) => {
          // Email changed successfully - user is now logged out
          // Force a full page reload to clear all React Query cache and state
          const params = new URLSearchParams();
          params.append('newEmail', data.newEmail);
          params.append('googleUnlinked', String(data.wasGoogleUnlinked));
          window.location.href = `/account/email-changed-success?${params.toString()}`;
        },
        onError: (err) => {
          if (err instanceof Error) {
            setError(err.message);
          } else {
            setError('Failed to confirm email change. Please try again.');
          }
        },
      }
    );
  };

  const handleBack = () => {
    if (step === 'verifyNewEmail') {
      setStep('enterNewEmail');
      setVerificationCode('');
      setError(null);
    } else if (step === 'enterNewEmail') {
      setStep('verifyPassword');
      setNewEmail('');
      setError(null);
    } else {
      router.push('/account');
    }
  };

  const getStepTitle = () => {
    switch (step) {
      case 'verifyPassword':
        return 'Verify Your Password';
      case 'enterNewEmail':
        return 'Change Email Address';
      case 'verifyNewEmail':
        return 'Verify New Email';
      default:
        return 'Change Email Address';
    }
  };

  const getStepDescription = () => {
    switch (step) {
      case 'verifyPassword':
        return 'Step 1 of 3';
      case 'enterNewEmail':
        return 'Step 2 of 3';
      case 'verifyNewEmail':
        return 'Step 3 of 3';
      default:
        return '';
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-6">
        <button
          onClick={() => router.push('/account')}
          className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 flex items-center gap-2 mb-4"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Account
        </button>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          {getStepTitle()}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {getStepDescription()}
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm p-6">
        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {step === 'verifyPassword' ? (
          <form onSubmit={handleVerifyPassword}>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  For security, please enter your current password to continue.
                </p>
              </div>

              <PasswordInput
                label="Current Password"
                name="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
                required
                disabled={verifyPasswordMutation.isPending}
                autoFocus
              />
            </div>

            <div className="flex space-x-3 mt-6">
              <button
                type="submit"
                disabled={verifyPasswordMutation.isPending || !password}
                className="flex-1 inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {verifyPasswordMutation.isPending ? 'Verifying...' : 'Continue'}
              </button>
              <button
                type="button"
                onClick={handleBack}
                disabled={verifyPasswordMutation.isPending}
                className="flex-1 inline-flex justify-center items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : step === 'enterNewEmail' ? (
          <form onSubmit={handleRequestChange}>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Current Email
                </label>
                <div className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 px-3 py-2 rounded-md border border-gray-200 dark:border-gray-700">
                  {user?.email}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  New Email Address
                </label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
                  placeholder="Enter new email address"
                  required
                  disabled={requestEmailChangeMutation.isPending}
                  autoFocus
                />
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-3">
                <p className="text-xs text-blue-800 dark:text-blue-200">
                  We&apos;ll send a verification code to your new email address. The code will expire in 15 minutes.
                </p>
              </div>
            </div>

            <div className="flex space-x-3 mt-6">
              <button
                type="submit"
                disabled={requestEmailChangeMutation.isPending || !newEmail}
                className="flex-1 inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {requestEmailChangeMutation.isPending ? 'Sending...' : 'Send Verification Code'}
              </button>
              <button
                type="button"
                onClick={handleBack}
                disabled={requestEmailChangeMutation.isPending}
                className="flex-1 inline-flex justify-center items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Back
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleConfirmChange}>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  We&apos;ve sent a verification code to <strong>{newEmail}</strong>. Please enter it below to confirm your email change.
                </p>
              </div>

              {willUnlinkGoogle && (
                <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
                  <div className="flex items-start">
                    <svg className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mt-0.5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <p className="text-sm text-yellow-800 dark:text-yellow-400">
                      <strong>Warning:</strong> Changing your email will unlink your Google account. You&apos;ll only be able to log in with your password after this change.
                    </p>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Verification Code
                </label>
                <input
                  type="text"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
                  placeholder="Enter 6-digit code"
                  maxLength={6}
                  required
                  disabled={confirmEmailChangeMutation.isPending}
                  autoFocus
                />
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-3">
                <p className="text-xs text-blue-800 dark:text-blue-200">
                  Code expires in 15 minutes. Didn&apos;t receive it? Go back and request a new code.
                </p>
              </div>
            </div>

            <div className="flex space-x-3 mt-6">
              <button
                type="submit"
                disabled={confirmEmailChangeMutation.isPending || verificationCode.length !== 6}
                className="flex-1 inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {confirmEmailChangeMutation.isPending ? 'Verifying...' : 'Verify & Change Email'}
              </button>
              <button
                type="button"
                onClick={handleBack}
                disabled={confirmEmailChangeMutation.isPending}
                className="flex-1 inline-flex justify-center items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Back
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
