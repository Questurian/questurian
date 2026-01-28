"use client";

import { useState } from 'react';
import { useAuth } from '@/lib/user/hooks';
import { useAddPasswordMutation } from '@/features/AccountPage/hooks/useAccountMutations';

interface PasswordSetupFlowProps {
  onSuccess?: () => void;
  onCancel?: () => void;
  standalone?: boolean;
}

export default function PasswordSetupFlow({
  onSuccess,
  onCancel,
  standalone = false
}: PasswordSetupFlowProps) {
  const { user } = useAuth();
  const addPasswordMutation = useAddPasswordMutation();
  const [step, setStep] = useState<'intro' | 'form' | 'success'>('intro');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passwordData, setPasswordData] = useState({
    password: '',
    confirmPassword: ''
  });

  const handleAddPassword = async () => {
    setError(null);

    if (passwordData.password !== passwordData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (passwordData.password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    setLoading(true);
    addPasswordMutation.mutate(
      {
        password: passwordData.password,
        confirmPassword: passwordData.confirmPassword,
      },
      {
        onSuccess: () => {
          setStep('success');
          if (onSuccess) {
            setTimeout(onSuccess, 2000);
          }
          setLoading(false);
        },
        onError: (error) => {
          setError(error instanceof Error ? error.message : 'Failed to add password');
          setLoading(false);
        },
      }
    );
  };


  if (!user || user.hasLocalPassword) {
    return (
      <div className="text-center p-6">
        <div className="text-green-600 mb-4">
          <svg className="mx-auto h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          Password Already Set
        </h3>
        <p className="text-gray-600">
          Your account already has password authentication enabled.
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
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                Add Password Authentication
              </h2>
              <p className="text-gray-600">
                You currently sign in with Google only. Adding a password gives you an alternative way to access your account.
              </p>
            </div>

            <div className="bg-blue-50 rounded-lg p-4 mb-6">
              <h3 className="text-sm font-medium text-blue-900 mb-2">Benefits of dual authentication:</h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• Access your account even if Google is unavailable</li>
                <li>• More flexibility when signing in from different devices</li>
                <li>• Enhanced account security with multiple options</li>
              </ul>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={() => setStep('form')}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-colors cursor-pointer"
              >
                Continue
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

        {step === 'form' && (
          <>
            <div className="text-center mb-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                Create Your Password
              </h2>
              <p className="text-gray-600">
                Choose a strong password for your account
              </p>
            </div>

            {error && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded-md p-4">
                <div className="text-sm text-red-700">{error}</div>
              </div>
            )}

            <div className="space-y-4 mb-6">
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={passwordData.password}
                  onChange={(e) => setPasswordData(prev => ({ ...prev, password: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter your password"
                  disabled={loading}
                />
                <p className="mt-1 text-xs text-gray-500">
                  Must be at least 8 characters long
                </p>
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                  Confirm Password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={passwordData.confirmPassword}
                  onChange={(e) => setPasswordData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Confirm your password"
                  disabled={loading}
                />
              </div>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={handleAddPassword}
                disabled={loading || !passwordData.password || !passwordData.confirmPassword}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-md transition-colors cursor-pointer"
              >
                {loading ? 'Adding Password...' : 'Add Password'}
              </button>
              <button
                onClick={() => setStep('intro')}
                disabled={loading}
                className="flex-1 border border-gray-300 text-gray-700 font-medium py-2 px-4 rounded-md hover:bg-gray-50 disabled:bg-gray-100 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                Back
              </button>
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
                Password Added Successfully!
              </h2>
              <p className="text-gray-600 mb-6">
                You can now sign in using either your Google account or your email and password.
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
      </div>
    </div>
  );
}