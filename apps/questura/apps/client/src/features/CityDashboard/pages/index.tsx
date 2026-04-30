'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useProtectedRoute } from '@/lib/routing';
import { useLoginModalStore } from '@/lib/stores/loginModalStore';
import { useLocationStore } from '@/lib/stores/locationStore';
import type { CityDashboardProps } from '../types';

function CityDashboardContent({ citySlug, countrySlug }: CityDashboardProps) {
  const router = useRouter();
  const searchParams = useSearchParams() ?? new URLSearchParams();
  const openLoginModal = useLoginModalStore((state) => state.openLoginModal);
  const setLastVisited = useLocationStore((state) => state.setLastVisited);

  useEffect(() => {
    setLastVisited({ cityId: citySlug, country: countrySlug });
  }, [citySlug, countrySlug, setLastVisited]);

  useProtectedRoute({
    onLoginRequired: (redirectPath) => {
      openLoginModal({
        title: 'Sign in required',
        subtitle: 'Please sign in to access your account',
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

      openLoginModal({
        title: 'Sign In',
        subtitle: 'Please sign in to continue',
        errorMessage,
        prefillEmail: email || undefined,
      });

      router.replace(`/${countrySlug}/${citySlug}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, citySlug, countrySlug]);

  return null;
}

export function CityDashboardPage({ citySlug, countrySlug }: CityDashboardProps) {
  return (
    <Suspense fallback={null}>
      <CityDashboardContent citySlug={citySlug} countrySlug={countrySlug} />
    </Suspense>
  );
}
