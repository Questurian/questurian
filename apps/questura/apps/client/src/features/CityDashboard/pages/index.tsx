'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams, useParams, notFound } from 'next/navigation';
import { useProtectedRoute } from '@/lib/routing';
import { useLoginModalStore } from '@/lib/stores/loginModalStore';
import { useLocationStore } from '@/lib/stores/locationStore';

function getParamValue(param: string | string[] | undefined): string | undefined {
  if (typeof param === 'string') {
    return param;
  }

  if (Array.isArray(param)) {
    return param[0];
  }

  return undefined;
}

const PRIMARY_COUNTRY = 'peru';
const PRIMARY_CITY = 'lima';

function CityDashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams() ?? new URLSearchParams();
  const params = (useParams() ?? {}) as Record<string, string | string[]>;
  const openLoginModal = useLoginModalStore((state) => state.openLoginModal);
  const setLastVisited = useLocationStore((state) => state.setLastVisited);

  const citySlug = getParamValue(params.city)?.toLowerCase();
  const countrySlug = getParamValue(params.country)?.toLowerCase();

  if (countrySlug && citySlug) {
    if (countrySlug !== PRIMARY_COUNTRY || citySlug !== PRIMARY_CITY) {
      notFound();
    }
  }

  useEffect(() => {
    if (citySlug && countrySlug) {
      setLastVisited({ cityId: citySlug, country: countrySlug });
    }
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

      if (countrySlug && citySlug) {
        router.replace(`/${countrySlug}/${citySlug}`);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, citySlug, countrySlug]);

  return null;
}

export function CityDashboardPage() {
  return (
    <Suspense fallback={null}>
      <CityDashboardContent />
    </Suspense>
  );
}
