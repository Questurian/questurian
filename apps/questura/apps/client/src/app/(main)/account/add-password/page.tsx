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
            <h1 className="font-display text-[1.35rem] text-[#1A1A1A] 480:text-[1.55rem] 768:text-[1.75rem]">
              Set Password
            </h1>
            <p className="mt-2 text-[0.88rem] text-[#6b6a68] leading-[1.6]">
              Add password authentication to your account for additional security
            </p>
          </div>

          <div className="bg-[#f7f6f2] border border-[#d7d4ce] rounded-sm p-6 480:p-8">
            {error && (
              <div className="mb-5 p-3 bg-[#fce4ec] border border-[#f8bbd0] rounded-sm">
                <p className="text-[0.84rem] text-[#c62828]">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="space-y-4">
                <p className="text-[0.88rem] text-[#6b6a68] leading-[1.65] mb-1">
                  You currently sign in with Google only. Adding a password gives you an alternative way to access your account.
                </p>

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
                        <div className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center bg-[#e8f5e9]">
                          <svg className="w-3 h-3 text-[#2e7d32]" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                        <span className="text-[0.82rem] text-[#2e7d32] font-medium">
                          Passwords match
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center bg-[#fce4ec]">
                          <svg className="w-3 h-3 text-[#c62828]" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        </div>
                        <span className="text-[0.82rem] text-[#c62828] font-medium">
                          Passwords do not match
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <div className="bg-white border border-[#e5e2dc] rounded-sm p-3.5">
                  <p className="text-[0.78rem] text-[#9a9894] leading-[1.65]">
                    <strong className="text-[#6b6a68]">Password requirements:</strong>
                  </p>
                  <ul className="text-[0.78rem] text-[#9a9894] mt-1 list-disc list-inside leading-[1.75]">
                    <li>At least 8 characters long</li>
                    <li>At least one number</li>
                    <li>At least one uppercase letter</li>
                    <li>At least one symbol (!@#$%^&* etc.)</li>
                  </ul>
                  <p className="text-[0.78rem] text-[#9a9894] mt-2">
                    You can sign in with either Google or your email and password.
                  </p>
                </div>
              </div>

              <div className="flex gap-3 mt-7">
                <button
                  type="submit"
                  disabled={
                    addPasswordMutation.isPending ||
                    !password ||
                    !confirmPassword ||
                    password !== confirmPassword ||
                    !isPasswordValid(password)
                  }
                  className="
                    flex-1 bg-[#2C2C2C] hover:bg-[#1A1A1A]
                    text-white text-center py-3 rounded
                    text-[0.88rem] font-medium transition-colors
                    disabled:opacity-50 disabled:cursor-not-allowed
                  "
                >
                  {addPasswordMutation.isPending ? 'Adding Password...' : 'Add Password'}
                </button>
                <button
                  type="button"
                  onClick={() => router.push('/account')}
                  disabled={addPasswordMutation.isPending}
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
          </div>
        </div>
      </div>
    </div>
  );
}
