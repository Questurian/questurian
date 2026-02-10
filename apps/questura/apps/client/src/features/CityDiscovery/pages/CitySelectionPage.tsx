'use client';

import { Suspense, useState } from 'react';
import { CitySelectionGridSection } from '../components/CitySelectionGridSection';
import { CitySelectionTopSection } from '../components/CitySelectionTopSection';

function CitySelectionContent() {
  const [showDevReference, setShowDevReference] = useState(false);
  const isDevMode = process.env.NODE_ENV !== 'production';

  return (
    <div className="min-h-screen bg-[#F5F0E8]">
      <CitySelectionTopSection
        isDevMode={isDevMode}
        showDevReference={showDevReference}
        onToggleDevReference={() => setShowDevReference((current) => !current)}
      >
        <CitySelectionGridSection isDevMode={isDevMode} showDevReference={showDevReference} />
      </CitySelectionTopSection>
    </div>
  );
}

export function CitySelectionPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center">
          <div className="w-12 h-12 border-2 border-[#C65D3B] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <CitySelectionContent />
    </Suspense>
  );
}
