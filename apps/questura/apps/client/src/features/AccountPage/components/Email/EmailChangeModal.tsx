import { useState } from 'react';
import { User } from '@/lib/user/types';
import { isServiceUnavailableError } from '@/lib/api';
import { useVerifyPasswordMutation, useRequestEmailChangeMutation, useConfirmEmailChangeMutation } from '../../hooks/useEmailChangeMutations';

interface EmailChangeModalProps {
  show: boolean;
  user: User | null;
  onClose: () => void;
  onSuccess: () => void;
}

type Step = 'verifyPassword' | 'enterNewEmail' | 'verifyNewEmail';

export function EmailChangeModal({ show, user, onClose, onSuccess }: EmailChangeModalProps) {
  const [step, setStep] = useState<Step>('verifyPassword');
  const [password, setPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [willUnlinkGoogle, setWillUnlinkGoogle] = useState(false);

  // React Query mutations
  const verifyPasswordMutation = useVerifyPasswordMutation();
  const requestEmailChangeMutation = useRequestEmailChangeMutation();
  const confirmEmailChangeMutation = useConfirmEmailChangeMutation();

  if (!show) return null;

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
          if (isServiceUnavailableError(err)) {
            setError('Service is unavailable. Please try again later.');
          } else if (err instanceof Error) {
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
          if (isServiceUnavailableError(err)) {
            setError('Service is unavailable. Please try again later.');
          } else if (err instanceof Error) {
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
          // Show success message
          const successMsg = data.message + (data.wasGoogleUnlinked ? ' Your Google account was unlinked. You can re-link it after logging in.' : '');
          setSuccess(successMsg);

          // Trigger success callback after a brief delay to allow user to see the message
          setTimeout(() => {
            onSuccess();
          }, 2000);
        },
        onError: (err) => {
          if (isServiceUnavailableError(err)) {
            setError('Service is unavailable. Please try again later.');
          } else if (err instanceof Error) {
            setError(err.message);
          } else {
            setError('Failed to confirm email change. Please try again.');
          }
        },
      }
    );
  };

  const handleClose = () => {
    setStep('verifyPassword');
    setPassword('');
    setNewEmail('');
    setVerificationCode('');
    setError(null);
    setSuccess(null);
    setWillUnlinkGoogle(false);
    onClose();
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

  // Show success screen after confirmation
  if (success) {
    return (
      <div className="fixed inset-0 bg-gray-600 bg-opacity-50 dark:bg-gray-900 dark:bg-opacity-75 flex items-center justify-center p-4 z-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6 text-center">
          <div className="mx-auto h-12 w-12 bg-green-100 rounded-full flex items-center justify-center mb-4">
            <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            Success!
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            {success}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-500">
            Redirecting you now...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 dark:bg-gray-900 dark:bg-opacity-75 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
          {getStepTitle()}
        </h3>

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

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Current Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
                  placeholder="Enter your password"
                  required
                  disabled={verifyPasswordMutation.isPending}
                  autoFocus
                />
              </div>
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
                onClick={handleClose}
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
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-3">
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

              <p className="text-xs text-gray-500 dark:text-gray-400">
                We&apos;ll send a verification code to your new email address. The code will expire in 15 minutes.
              </p>
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
                onClick={handleClose}
                disabled={requestEmailChangeMutation.isPending}
                className="flex-1 inline-flex justify-center items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Cancel
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
                  <p className="text-sm text-yellow-800 dark:text-yellow-400">
                    ⚠️ Changing your email will unlink your Google account. You&apos;ll only be able to log in with your password after this change.
                  </p>
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

              <p className="text-xs text-gray-500 dark:text-gray-400">
                Code expires in 15 minutes. Didn&apos;t receive it? Go back and request a new code.
              </p>
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
                onClick={() => {
                  setStep('enterNewEmail');
                  setVerificationCode('');
                  setError(null);
                }}
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
