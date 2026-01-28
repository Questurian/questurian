"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/user/hooks';
import { useAddPasswordMutation } from '@/features/AccountPage/hooks/useAccountMutations';
import { isServiceUnavailableError } from '@/lib/api';
import LoadingSpinner from '@/components/shared/ui/LoadingSpinner';
import PasswordInput from '@/components/shared/ui/PasswordInput';
import PasswordStrengthIndicator from '@/features/Auth/components/PasswordStrengthIndicator';
import { validatePasswordRequirements, isPasswordValid } from '@/features/Auth/lib/auth-utils';

export default function AddPasswordPage() {
  const router = useRouter();
  const { loading, isAuthenticated, user } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [passwordRequirements, setPasswordRequirements] = useState(
    validatePasswordRequirements('')
  );

  // React Query mutation
  const addPasswordMutation = useAddPasswordMutation();

  // Update password requirements as user types
  useEffect(() => {
    setPasswordRequirements(validatePasswordRequirements(password));
  }, [password]);

  // Redirect to home with login modal if not authenticated
  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push('/?showLogin=true&redirect=/account/add-password');
    }
  }, [loading, isAuthenticated, router]);

  // Redirect if user already has a password
  useEffect(() => {
    if (user && (user.authProvider === 'local' || user.authProvider === 'dual')) {
      router.push('/account/change-password');
    }
  }, [user, router]);

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!isAuthenticated) {
    return null; // Will redirect via useEffect
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Client-side validation
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    // Validate password strength requirements
    if (!passwordRequirements.hasMinLength) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (!passwordRequirements.hasNumber) {
      setError('Password must contain at least one number');
      return;
    }

    if (!passwordRequirements.hasUppercase) {
      setError('Password must contain at least one uppercase letter');
      return;
    }

    if (!passwordRequirements.hasSymbol) {
      setError('Password must contain at least one symbol (!@#$%^&*() etc.)');
      return;
    }

    // Submit password addition
    addPasswordMutation.mutate(
      {
        password,
        confirmPassword,
      },
      {
        onSuccess: () => {
          // Redirect back to account page with success message
          router.push('/account?passwordAdded=true');
        },
        onError: (err) => {
          // Check if it's a service unavailability error
          if (isServiceUnavailableError(err)) {
            setError('Service is unavailable. Please try again later.');
          } else if (err instanceof Error) {
            setError(err.message);
          } else {
            setError('Failed to add password. Please try again.');
          }
        },
      }
    );
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
          Set Password
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Add password authentication to your account for additional security
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm p-6">
        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                You currently sign in with Google only. Adding a password gives you an alternative way to access your account.
              </p>
            </div>

            <PasswordInput
              label="Password"
              name="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter new password"
              autoComplete="new-password"
              required
              disabled={addPasswordMutation.isPending}
              autoFocus
            />

            {password && (
              <PasswordStrengthIndicator requirements={passwordRequirements} />
            )}

            <PasswordInput
              label="Confirm Password"
              name="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm password"
              autoComplete="new-password"
              required
              disabled={addPasswordMutation.isPending}
            />

            {confirmPassword && password && (
              <div className="mt-3">
                {password === confirmPassword ? (
                  <div className="flex items-center gap-2">
                    <div className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center bg-green-100 dark:bg-green-900/30">
                      <svg className="w-3 h-3 text-green-600 dark:text-green-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <span className="text-sm text-green-700 dark:text-green-300 font-medium">
                      Passwords match
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center bg-red-100 dark:bg-red-900/30">
                      <svg className="w-3 h-3 text-red-600 dark:text-red-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <span className="text-sm text-red-700 dark:text-red-300 font-medium">
                      Passwords do not match
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-3">
              <p className="text-xs text-blue-800 dark:text-blue-200">
                <strong>Password requirements:</strong>
              </p>
              <ul className="text-xs text-blue-700 dark:text-blue-300 mt-1 list-disc list-inside">
                <li>At least 8 characters long</li>
                <li>At least one number</li>
                <li>At least one uppercase letter</li>
                <li>At least one symbol (!@#$%^&* etc.)</li>
              </ul>
              <p className="text-xs text-blue-700 dark:text-blue-300 mt-2">
                You can sign in with either Google or your email and password.
              </p>
            </div>
          </div>

          <div className="flex space-x-3 mt-6">
            <button
              type="submit"
              disabled={
                addPasswordMutation.isPending ||
                !password ||
                !confirmPassword ||
                password !== confirmPassword ||
                !isPasswordValid(password)
              }
              className="flex-1 inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {addPasswordMutation.isPending ? 'Adding Password...' : 'Add Password'}
            </button>
            <button
              type="button"
              onClick={() => router.push('/account')}
              disabled={addPasswordMutation.isPending}
              className="flex-1 inline-flex justify-center items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
