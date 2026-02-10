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
    <div className="min-h-screen">
      <div className="px-6 pt-8 pb-16 480:pt-10 768:pt-12">
        <div className="max-w-xl mx-auto">
          <div className="mb-8">
            <button
              onClick={() => router.push('/account')}
              className="
                text-[0.82rem] text-[#9a9894] hover:text-[#1A1A1A]
                flex items-center gap-1.5 mb-5 transition-colors
              "
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Account
            </button>
            <p className="text-[0.68rem] uppercase tracking-[0.18em] font-semibold text-[#9a9894] mb-2">
              {getStepDescription()}
            </p>
            <h1 className="font-display text-[1.35rem] text-[#1A1A1A] 480:text-[1.55rem] 768:text-[1.75rem]">
              {getStepTitle()}
            </h1>
          </div>

          <div className="bg-[#f7f6f2] border border-[#d7d4ce] rounded-sm p-6 480:p-8">
            {error && (
              <div className="mb-5 p-3 bg-[#fce4ec] border border-[#f8bbd0] rounded-sm">
                <p className="text-[0.84rem] text-[#c62828]">{error}</p>
              </div>
            )}

            {step === 'verifyPassword' ? (
              <form onSubmit={handleVerifyPassword}>
                <div className="space-y-4">
                  <p className="text-[0.88rem] text-[#6b6a68] leading-[1.65] mb-1">
                    For security, please enter your current password to continue.
                  </p>

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

                <div className="flex gap-3 mt-7">
                  <button
                    type="submit"
                    disabled={verifyPasswordMutation.isPending || !password}
                    className="
                      flex-1 bg-[#2C2C2C] hover:bg-[#1A1A1A]
                      text-white text-center py-3 rounded
                      text-[0.88rem] font-medium transition-colors
                      disabled:opacity-50 disabled:cursor-not-allowed
                    "
                  >
                    {verifyPasswordMutation.isPending ? 'Verifying...' : 'Continue'}
                  </button>
                  <button
                    type="button"
                    onClick={handleBack}
                    disabled={verifyPasswordMutation.isPending}
                    className="
                      flex-1 bg-white border border-[#d7d4ce]
                      text-[#4f4e4b] text-center py-3 rounded
                      text-[0.88rem] font-medium transition-colors
                      hover:bg-[#f0efeb]
                    "
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : step === 'enterNewEmail' ? (
              <form onSubmit={handleRequestChange}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-[0.82rem] font-medium text-[#4f4e4b] mb-1.5">
                      Current Email
                    </label>
                    <div className="text-[0.88rem] text-[#6b6a68] bg-white px-3.5 py-2.5 rounded-sm border border-[#e5e2dc]">
                      {user?.email}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[0.82rem] font-medium text-[#4f4e4b] mb-1.5">
                      New Email Address
                    </label>
                    <input
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      className="
                        w-full px-3.5 py-2.5 border border-[#d7d4ce] rounded-sm
                        text-[0.88rem] text-[#1A1A1A] placeholder-[#c4c2be]
                        focus:outline-none focus:border-[#1A1A1A]
                        bg-white transition-colors
                      "
                      placeholder="Enter new email address"
                      required
                      disabled={requestEmailChangeMutation.isPending}
                      autoFocus
                    />
                  </div>

                  <div className="bg-white border border-[#e5e2dc] rounded-sm p-3.5">
                    <p className="text-[0.78rem] text-[#9a9894] leading-[1.65]">
                      We&apos;ll send a verification code to your new email address. The code will expire in 15 minutes.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3 mt-7">
                  <button
                    type="submit"
                    disabled={requestEmailChangeMutation.isPending || !newEmail}
                    className="
                      flex-1 bg-[#2C2C2C] hover:bg-[#1A1A1A]
                      text-white text-center py-3 rounded
                      text-[0.88rem] font-medium transition-colors
                      disabled:opacity-50 disabled:cursor-not-allowed
                    "
                  >
                    {requestEmailChangeMutation.isPending ? 'Sending...' : 'Send Verification Code'}
                  </button>
                  <button
                    type="button"
                    onClick={handleBack}
                    disabled={requestEmailChangeMutation.isPending}
                    className="
                      flex-1 bg-white border border-[#d7d4ce]
                      text-[#4f4e4b] text-center py-3 rounded
                      text-[0.88rem] font-medium transition-colors
                      hover:bg-[#f0efeb]
                    "
                  >
                    Back
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleConfirmChange}>
                <div className="space-y-4">
                  <p className="text-[0.88rem] text-[#6b6a68] leading-[1.65] mb-1">
                    We&apos;ve sent a verification code to <strong className="text-[#1A1A1A]">{newEmail}</strong>. Please enter it below to confirm your email change.
                  </p>

                  {willUnlinkGoogle && (
                    <div className="p-3.5 bg-[#fff3e0] border border-[#ffe0b2] rounded-sm">
                      <div className="flex items-start">
                        <svg className="h-4.5 w-4.5 text-[#e65100] mt-0.5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        <p className="text-[0.84rem] text-[#e65100] leading-[1.55]">
                          <strong>Warning:</strong> Changing your email will unlink your Google account. You&apos;ll only be able to log in with your password after this change.
                        </p>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-[0.82rem] font-medium text-[#4f4e4b] mb-1.5">
                      Verification Code
                    </label>
                    <input
                      type="text"
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value)}
                      className="
                        w-full px-3.5 py-2.5 border border-[#d7d4ce] rounded-sm
                        text-[0.88rem] text-[#1A1A1A] placeholder-[#c4c2be]
                        focus:outline-none focus:border-[#1A1A1A]
                        bg-white transition-colors
                      "
                      placeholder="Enter 6-digit code"
                      maxLength={6}
                      required
                      disabled={confirmEmailChangeMutation.isPending}
                      autoFocus
                    />
                  </div>

                  <div className="bg-white border border-[#e5e2dc] rounded-sm p-3.5">
                    <p className="text-[0.78rem] text-[#9a9894] leading-[1.65]">
                      Code expires in 15 minutes. Didn&apos;t receive it? Go back and request a new code.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3 mt-7">
                  <button
                    type="submit"
                    disabled={confirmEmailChangeMutation.isPending || verificationCode.length !== 6}
                    className="
                      flex-1 bg-[#2C2C2C] hover:bg-[#1A1A1A]
                      text-white text-center py-3 rounded
                      text-[0.88rem] font-medium transition-colors
                      disabled:opacity-50 disabled:cursor-not-allowed
                    "
                  >
                    {confirmEmailChangeMutation.isPending ? 'Verifying...' : 'Verify & Change Email'}
                  </button>
                  <button
                    type="button"
                    onClick={handleBack}
                    disabled={confirmEmailChangeMutation.isPending}
                    className="
                      flex-1 bg-white border border-[#d7d4ce]
                      text-[#4f4e4b] text-center py-3 rounded
                      text-[0.88rem] font-medium transition-colors
                      hover:bg-[#f0efeb]
                    "
                  >
                    Back
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
