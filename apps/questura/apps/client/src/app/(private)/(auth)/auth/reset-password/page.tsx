"use client";

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';

import { post } from '@/lib/api';
import { isPasswordValid } from '@/features/Auth/lib/auth-utils';

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
    <div className="mx-auto flex min-h-[70vh] w-full max-w-md items-center px-4 py-12">
      <div className="w-full space-y-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div>
          <h1 className="text-2xl font-semibold text-black">Reset Password</h1>
          <p className="mt-2 text-sm text-gray-600">
            {complete ? 'Your password has been updated.' : 'Choose a new password for your account.'}
          </p>
        </div>

        {complete ? (
          <Link
            href="/?showLogin=true"
            className="block w-full rounded-lg bg-[#468BE6] px-4 py-3 text-center text-sm font-medium text-white hover:bg-[#1A5799]"
          >
            Sign in
          </Link>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <input
              type="password"
              autoComplete="new-password"
              placeholder="New password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-3 text-sm text-black"
              required
            />
            <input
              type="password"
              autoComplete="new-password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-3 text-sm text-black"
              required
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-lg bg-[#468BE6] px-4 py-3 text-sm font-medium text-white hover:bg-[#1A5799] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? 'Updating...' : 'Update password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
