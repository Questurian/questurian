'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams, useParams } from 'next/navigation';
import { useProtectedRoute } from '@/lib/routing';
import { useLoginModalStore } from '@/lib/stores/loginModalStore';
import { useLocationStore } from '@/lib/stores/locationStore';

type CityMode = 'explore' | 'stay' | 'move';

function getParamValue(param: string | string[] | undefined): string | undefined {
  if (typeof param === 'string') {
    return param;
  }

  if (Array.isArray(param)) {
    return param[0];
  }

  return undefined;
}

function CityDashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams();
  const openLoginModal = useLoginModalStore((state) => state.openLoginModal);
  const setLastVisited = useLocationStore((state) => state.setLastVisited);

  const citySlug = getParamValue(params.city)?.toLowerCase();
  const countrySlug = getParamValue(params.country)?.toLowerCase();
  const modeSlug = getParamValue(params.mode)?.toLowerCase();
  const validModes: CityMode[] = ['explore', 'stay', 'move'];
  const activeMode: CityMode = validModes.includes(modeSlug as CityMode) ? (modeSlug as CityMode) : 'explore';

  useEffect(() => {
    if (!countrySlug || !citySlug) {
      return;
    }

    const canonicalPath = `/${countrySlug}/${citySlug}/${activeMode}`;
    const modeMissingOrInvalid = modeSlug !== activeMode;

    if (modeMissingOrInvalid) {
      router.replace(canonicalPath);
    }
  }, [router, countrySlug, citySlug, modeSlug, activeMode]);

  useEffect(() => {
    if (citySlug && countrySlug) {
      setLastVisited({ cityId: citySlug, country: countrySlug, mode: activeMode });
    }
  }, [citySlug, countrySlug, activeMode, setLastVisited]);

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
      console.log('📧 OAuth Error Query Params:', { error, email });

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
        title: "Sign In",
        subtitle: "Please sign in to continue",
        errorMessage,
        prefillEmail: email || undefined
      });

      const canonicalPath = `/${countrySlug}/${citySlug}/${activeMode}`;
      router.replace(canonicalPath);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, citySlug, countrySlug, activeMode]);

  return null;
}

export function CityDashboardPage() {
  return (
    <Suspense fallback={
      null
    }>
      <CityDashboardContent />
    </Suspense>
  );
}
