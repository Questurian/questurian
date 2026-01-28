"use client";

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useProtectedRoute } from '@/lib/routing';
import { useLoginModalStore } from '@/lib/stores/loginModalStore';

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const openLoginModal = useLoginModalStore((state) => state.openLoginModal);

  useProtectedRoute({
    onLoginRequired: (redirectPath) => {
      openLoginModal({
        title: "Sign in required",
        subtitle: "Please sign in to access your account",
        onSuccess: () => {
          router.push(redirectPath);
        },
      });
    },
  });

  useEffect(() => {
    const error = searchParams.get('error');
    const email = searchParams.get('email');

    if (error || email) {
      console.log('📧 OAuth Error Query Params:', {
        error,
        email,
        allParams: Object.fromEntries(searchParams.entries())
      });

      // Determine error message based on error type
      let errorMessage = '';
      if (error === 'account_exists_local') {
        errorMessage = 'This email has a password. You can link Google in account page.';
      } else if (error === 'oauth_failed') {
        errorMessage = 'Google sign-in failed. Please try again or use password login.';
      } else if (error === 'oauth_cancelled') {
        errorMessage = 'Google sign-in was cancelled.';
      } else if (error) {
        errorMessage = 'An authentication error occurred. Please try again.';
      }

      // Reopen login modal when OAuth error occurs
      openLoginModal({
        title: "Sign In",
        subtitle: "Please sign in to continue",
        errorMessage,
        prefillEmail: email || undefined
      });

      // Clean up URL query params
      router.replace('/');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  return (
    <div>
      Home Page
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <HomeContent />
    </Suspense>
  );
}
