import { useState } from 'react';
import { User } from '@/lib/user/types';
import { isServiceUnavailableError } from '@/lib/api';
import { useVerifyPasswordMutation, useRequestPasswordChangeMutation, useConfirmPasswordChangeMutation } from '../../hooks/usePasswordChangeMutations';

interface PasswordChangeModalProps {
  show: boolean;
  user: User | null;
  onClose: () => void;
  onSuccess: () => void;
}

type Step = 'verifyPassword' | 'enterNewPassword';

export function PasswordChangeModal({ show, user, onClose, onSuccess }: PasswordChangeModalProps) {
  const [step, setStep] = useState<Step>('verifyPassword');
  const [currentPassword, setCurrentPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  // React Query mutations
  const verifyPasswordMutation = useVerifyPasswordMutation();
  const requestPasswordChangeMutation = useRequestPasswordChangeMutation();
  const confirmPasswordChangeMutation = useConfirmPasswordChangeMutation();

  if (!show) return null;

  const handleVerifyPassword = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Step 1: Verify current password
    verifyPasswordMutation.mutate(
      { password: currentPassword },
      {
        onSuccess: (verifyData) => {
          if (!verifyData.success) {
            setError('Incorrect password. Please try again.');
            return;
          }

          // Step 2: Request password change (sends code)
          requestPasswordChangeMutation.mutate(undefined, {
            onSuccess: () => {
              setStep('enterNewPassword');
            },
            onError: (err) => {
              if (isServiceUnavailableError(err)) {
                setError('Service is unavailable. Please try again later.');
              } else {
                setError('Failed to send verification code. Please try again.');
              }
            },
          });
        },
        onError: (err) => {
          if (isServiceUnavailableError(err)) {
            setError('Service is unavailable. Please try again later.');
          } else if (err instanceof Error) {
            if (err.message.includes('No password set')) {
              setError('You must add a password to your account first.');
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

  const handleConfirmPasswordChange = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate passwords match
    if (newPassword !== confirmNewPassword) {
      setError('New passwords do not match');
      return;
    }

    // Validate password length
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters long');
      return;
    }

    confirmPasswordChangeMutation.mutate(
      {
        code: verificationCode,
        currentPassword,
        newPassword,
        confirmNewPassword,
      },
      {
        onSuccess: () => {
          // Show success and trigger callback
          onSuccess();
        },
        onError: (err) => {
          if (isServiceUnavailableError(err)) {
            setError('Service is unavailable. Please try again later.');
          } else if (err instanceof Error) {
            setError(err.message);
          } else {
            setError('Failed to change password. Please try again.');
          }
        },
      }
    );
  };

  const handleClose = () => {
    setStep('verifyPassword');
    setCurrentPassword('');
    setVerificationCode('');
    setNewPassword('');
    setConfirmNewPassword('');
    setError(null);
    onClose();
  };

  const getStepTitle = () => {
    switch (step) {
      case 'verifyPassword':
        return 'Verify Your Password';
      case 'enterNewPassword':
        return 'Change Password';
      default:
        return 'Change Password';
    }
  };

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
                  For security, please enter your current password to continue. We&apos;ll send a verification code to your email.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Current Password
                </label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
                  placeholder="Enter your current password"
                  required
                  disabled={verifyPasswordMutation.isPending || requestPasswordChangeMutation.isPending}
                  autoFocus
                />
              </div>
            </div>

            <div className="flex space-x-3 mt-6">
              <button
                type="submit"
                disabled={verifyPasswordMutation.isPending || requestPasswordChangeMutation.isPending || !currentPassword}
                className="flex-1 inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {(verifyPasswordMutation.isPending || requestPasswordChangeMutation.isPending) ? 'Verifying...' : 'Continue'}
              </button>
              <button
                type="button"
                onClick={handleClose}
                disabled={verifyPasswordMutation.isPending || requestPasswordChangeMutation.isPending}
                className="flex-1 inline-flex justify-center items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleConfirmPasswordChange}>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  We&apos;ve sent a 6-digit verification code to <strong>{user?.email}</strong>. Enter it below along with your new password.
                </p>
              </div>

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
                  disabled={confirmPasswordChangeMutation.isPending}
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  New Password
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
                  placeholder="Enter new password"
                  required
                  disabled={confirmPasswordChangeMutation.isPending}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
                  placeholder="Confirm new password"
                  required
                  disabled={confirmPasswordChangeMutation.isPending}
                />
              </div>

              <p className="text-xs text-gray-500 dark:text-gray-400">
                Password must be at least 8 characters long. Code expires in 15 minutes.
              </p>
            </div>

            <div className="flex space-x-3 mt-6">
              <button
                type="submit"
                disabled={confirmPasswordChangeMutation.isPending || verificationCode.length !== 6 || !newPassword || !confirmNewPassword}
                className="flex-1 inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {confirmPasswordChangeMutation.isPending ? 'Changing...' : 'Change Password'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep('verifyPassword');
                  setVerificationCode('');
                  setNewPassword('');
                  setConfirmNewPassword('');
                  setError(null);
                }}
                disabled={confirmPasswordChangeMutation.isPending}
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
