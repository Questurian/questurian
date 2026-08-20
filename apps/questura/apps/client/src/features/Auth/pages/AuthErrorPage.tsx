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
    <div className="min-h-screen flex items-center justify-center px-5 py-12">
      <div className="w-full max-w-md">
        <div className="bg-[#f7f6f2] border border-[#d7d4ce] rounded-sm p-8 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-[#fce4ec] rounded-full mb-4">
            <svg
              className="w-6 h-6 text-[#c62828]"
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

          <h2 className="font-display text-[1.35rem] text-[#1A1A1A] mb-4">
            Authentication Error
          </h2>

          <div className="mb-6 p-3 bg-[#fce4ec] border border-[#f8bbd0] rounded-sm text-left">
            <p className="text-[0.84rem] text-[#c62828] leading-[1.65]">
              {error}
            </p>
          </div>

          <div className="space-y-3">
            <button
              onClick={handleGoToLogin}
              className="
                w-full bg-[#2C2C2C] hover:bg-[#1A1A1A]
                text-white text-center py-3 rounded
                text-[0.88rem] font-medium transition-colors cursor-pointer
              "
            >
              Go to Sign In
            </button>

            <button
              onClick={handleGoToSignup}
              className="
                w-full bg-white border border-[#d7d4ce]
                text-[#4f4e4b] text-center py-3 rounded
                text-[0.88rem] font-medium transition-colors
                hover:bg-[#f0efeb] cursor-pointer
              "
            >
              Create New Account
            </button>

            <button
              onClick={handleGoHome}
              className="
                w-full text-[0.82rem] text-[#6b6a68] hover:text-[#1A1A1A]
                underline underline-offset-2 cursor-pointer transition-colors py-2
              "
            >
              Go to Homepage
            </button>
          </div>

          <p className="mt-6 text-[0.78rem] text-[#9a9894]">
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
      <div className="min-h-screen flex items-center justify-center px-5">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#9a9894] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="mt-4 text-[0.88rem] text-[#6b6a68]">Loading...</p>
        </div>
      </div>
    }>
      <AuthErrorContent />
    </SuspenseBoundary>
  );
}
