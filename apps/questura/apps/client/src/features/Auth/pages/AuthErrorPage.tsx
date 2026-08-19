"use client";

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { SuspenseBoundary } from '@/components/shared/SuspenseBoundary';

function AuthErrorContent() {
  const searchParams = useSearchParams() ?? new URLSearchParams();
  const router = useRouter();
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const errorParam = searchParams.get('error');
    
    if (errorParam) {
      switch (errorParam) {
        case 'admin_oauth_disabled':
          setError('Admin accounts cannot use Google OAuth. Please sign in with your email and password.');
          break;
        case 'account_exists':
          setError('An account with this email already exists. Please sign in with your existing credentials.');
          break;
        // Google will not attach itself to an account that already exists under
        // the same address. Without this case the visitor gets the generic
        // "try again" and loops, because trying again does the same thing.
        case 'account_not_linked':
          setError('This email already has an account. Sign in the way you created it, then connect Google from your account settings.');
          break;
        case 'oauth_cancelled':
          setError('Google sign-in was cancelled. Please try again.');
          break;
        case 'oauth_failed':
          setError('Google sign-in failed. Please try again or use email/password login.');
          break;
        // The request never reached the server, so "sign-in failed" would be
        // misleading -- nothing was attempted and retrying the same way fails
        // the same way.
        case 'oauth_unreachable':
          setError('We could not reach the sign-in service. Check your connection and try again.');
          break;
        case 'invalid_credentials':
          setError('Invalid credentials provided. Please check your email and password.');
          break;
        default:
          setError('An authentication error occurred. Please try again.');
      }
    } else {
      setError('An unknown authentication error occurred.');
    }
  }, [searchParams]);

  const handleGoToLogin = () => {
    router.push('/');
  };

  const handleGoToSignup = () => {
    router.push('/');
  };

  const handleGoHome = () => {
    router.push('/');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 640:px-6 1024:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 dark:bg-red-900/20">
            <svg
              className="h-8 w-8 text-red-600 dark:text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
          </div>
          
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-white">
            Authentication Error
          </h2>
          
          <div className="mt-4 p-4 rounded-md bg-red-50 dark:bg-red-900/20">
            <p className="text-sm text-red-800 dark:text-red-200">
              {error}
            </p>
          </div>
        </div>

        <div className="mt-8 space-y-4">
          <button
            onClick={handleGoToLogin}
            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors cursor-pointer"
          >
            Go to Sign In
          </button>
          
          <button
            onClick={handleGoToSignup}
            className="w-full flex justify-center py-3 px-4 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors cursor-pointer"
          >
            Create New Account
          </button>
          
          <button
            onClick={handleGoHome}
            className="w-full flex justify-center py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors cursor-pointer"
          >
            Go to Homepage
          </button>
        </div>

        <div className="mt-6 text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            If you continue to experience issues, please contact support.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <SuspenseBoundary fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    }>
      <AuthErrorContent />
    </SuspenseBoundary>
  );
}
