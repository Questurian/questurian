"use client";

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';

import { post } from '@/lib/api';
import { isPasswordValid } from '@/features/Auth/lib/auth-utils';
import PasswordInput from '@/components/shared/ui/PasswordInput';

export default function ResetPasswordPage() {
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get('token') ?? '');
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    if (!token) {
      setError('This password reset link is invalid or has expired.');
      return;
    }

    if (!isPasswordValid(newPassword)) {
      setError('Password must be at least 8 characters with uppercase, number, and symbol.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setPending(true);
    try {
      await post('/api/visitor-auth/reset-password', { token, newPassword });
      setComplete(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to reset password.');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="min-h-screen">
      <div className="px-6 pt-8 pb-16 480:pt-10 768:pt-12">
        <div className="max-w-xl mx-auto">
          <div className="mb-8">
            <h1 className="font-display text-[1.35rem] text-[#1A1A1A] 480:text-[1.55rem] 768:text-[1.75rem]">
              Reset Password
            </h1>
            <p className="mt-2 text-[0.88rem] text-[#6b6a68] leading-[1.6]">
              {complete ? 'Your password has been updated.' : 'Choose a new password for your account.'}
            </p>
          </div>

          <div className="bg-[#f7f6f2] border border-[#d7d4ce] rounded-sm p-6 480:p-8">
            {error ? (
              <div className="mb-5 p-3 bg-[#fce4ec] border border-[#f8bbd0] rounded-sm">
                <p className="text-[0.84rem] text-[#c62828]">{error}</p>
              </div>
            ) : null}

            {complete ? (
              <Link
                href="/?showLogin=true"
                className="
                  block w-full bg-[#2C2C2C] hover:bg-[#1A1A1A]
                  text-white text-center py-3.5 rounded
                  text-[0.88rem] font-medium transition-colors
                "
              >
                Sign in
              </Link>
            ) : (
              <form className="space-y-4" onSubmit={handleSubmit}>
                <PasswordInput
                  label="New Password"
                  name="newPassword"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="New password"
                  autoComplete="new-password"
                  required
                  disabled={pending}
                  autoFocus
                />
                <PasswordInput
                  label="Confirm New Password"
                  name="confirmPassword"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Confirm new password"
                  autoComplete="new-password"
                  required
                  disabled={pending}
                />
                <button
                  type="submit"
                  disabled={pending}
                  className="
                    w-full bg-[#2C2C2C] hover:bg-[#1A1A1A]
                    text-white text-center py-3 rounded
                    text-[0.88rem] font-medium transition-colors
                    disabled:opacity-50 disabled:cursor-not-allowed
                  "
                >
                  {pending ? 'Updating...' : 'Update password'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
