'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CitySelectionPage } from '@/features/CityDiscovery';
import { useLocationStore } from '@/lib/stores/locationStore';

export default function HomePage() {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);

  const isOnboarded = useLocationStore((state) => state.isOnboarded);
  const favoriteCity = useLocationStore((state) => state.favoriteCity);
  const lastVisited = useLocationStore((state) => state.lastVisited);

  const redirectTarget = favoriteCity || lastVisited;

  useEffect(() => {
    // Wait for Zustand persist to hydrate from localStorage
    const unsubFinishHydration = useLocationStore.persist.onFinishHydration(() => {
      setHydrated(true);
    });

    // If already hydrated (e.g. store was created before this component mounted)
    if (useLocationStore.persist.hasHydrated()) {
      setHydrated(true);
    }

    return unsubFinishHydration;
  }, []);

  useEffect(() => {
    if (hydrated && isOnboarded && redirectTarget) {
      router.replace(`/${redirectTarget.country}/${redirectTarget.cityId}/${redirectTarget.mode}`);
    }
  }, [hydrated, isOnboarded, redirectTarget, router]);

  if (!hydrated || (isOnboarded && redirectTarget)) {
    return (
      <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-[#C65D3B] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <CitySelectionPage />;
}
