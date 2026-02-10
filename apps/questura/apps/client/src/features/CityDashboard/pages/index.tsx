'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams, useParams } from 'next/navigation';
import { useProtectedRoute } from '@/lib/routing';
import { useLoginModalStore } from '@/lib/stores/loginModalStore';
import { getCityBySlug } from '@/features/CityDiscovery';

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

  const citySlug = getParamValue(params.city)?.toLowerCase();
  const countrySlug = getParamValue(params.country)?.toLowerCase();
  const modeSlug = getParamValue(params.mode)?.toLowerCase();
  const validModes: CityMode[] = ['explore', 'stay', 'move'];
  const activeMode: CityMode = validModes.includes(modeSlug as CityMode) ? (modeSlug as CityMode) : 'explore';

  const city = getCityBySlug(countrySlug, citySlug);

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

  // If city not found, show error
  if (!city) {
    return (
      <div className="min-h-screen bg-[#f8f6f3] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-serif text-gray-900 mb-4">City not found</h1>
          <p className="text-gray-600 mb-6">We couldn&apos;t find this destination.</p>
          <button
            onClick={() => router.push('/')}
            className="bg-[#2d9d78] text-white px-6 py-3 rounded-xl font-medium hover:bg-[#248a68] transition-colors"
          >
            Explore destinations
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f6f3]">
      {/* Hero Section */}
      <div className="relative h-[60vh] min-h-[400px]">
        <div className="absolute inset-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={city.image}
            alt={city.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-8 md:p-12">
          <div className="max-w-6xl mx-auto">
            <span className="inline-block px-4 py-2 bg-[#2d9d78] text-white rounded-full text-sm font-medium mb-4">
              {city.tag}
            </span>
            <h1 className="text-5xl md:text-7xl font-serif text-white mb-2">
              {city.name}
            </h1>
            <p className="text-xl text-white/80 mb-4">{city.displayCountry}</p>
            <p className="text-lg text-white/70 max-w-xl">{city.description}</p>
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="max-w-6xl mx-auto px-8 md:px-12 py-12">
        <div className="bg-white rounded-2xl p-8 shadow-sm">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            Welcome to {city.name}
          </h2>
          <p className="text-gray-600 leading-relaxed">
            This is your personalized dashboard for {city.name}, {city.displayCountry}. 
            Here you&apos;ll find everything you need to explore, stay, or make this city your home.
          </p>
          
          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-6 bg-gray-50 rounded-xl">
              <h3 className="font-semibold text-gray-900 mb-2">Neighborhoods</h3>
              <p className="text-sm text-gray-600">Explore the best areas to stay and live</p>
            </div>
            <div className="p-6 bg-gray-50 rounded-xl">
              <h3 className="font-semibold text-gray-900 mb-2">Housing</h3>
              <p className="text-sm text-gray-600">Find apartments and coliving spaces</p>
            </div>
            <div className="p-6 bg-gray-50 rounded-xl">
              <h3 className="font-semibold text-gray-900 mb-2">Community</h3>
              <p className="text-sm text-gray-600">Connect with fellow nomads and locals</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CityDashboardPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#f8f6f3] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#2d9d78] border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <CityDashboardContent />
    </Suspense>
  );
}
