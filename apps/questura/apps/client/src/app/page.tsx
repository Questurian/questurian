'use client';

import { CitySelectionPage } from '@/features/CityDiscovery';

export default function HomePage() {
  // Middleware handles redirects for onboarded users, so we only show onboarding here
  return <CitySelectionPage />;
}
