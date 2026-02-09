'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { IntentCard } from '../components/IntentCard';
import { intents, getCityById } from '../lib/data';

function IntentSelectionContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const cityId = searchParams.get('city');
  const city = getCityById(cityId || '');

  if (!city) {
    if (typeof window !== 'undefined') {
      router.push('/');
    }
    return null;
  }

  const handleBack = () => {
    router.push('/');
  };

  const handleIntentSelect = (intentId: string) => {
    router.push(`/confirmation?city=${cityId}&intent=${intentId}`);
  };

  return (
    <div className="min-h-screen bg-[#F5F0E8]">
      {/* Header */}
      <header className="px-4 480:px-6 768:px-10 1024:px-16 py-4 768:py-5 animate-fade-in-down">
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          <div className="flex items-center gap-3 768:gap-6">
            <button
              onClick={handleBack}
              className="flex items-center gap-2 text-[#1A1A1A]/60 hover:text-[#C65D3B] transition-colors group"
            >
              <div className="w-9 h-9 rounded-full border border-[#1A1A1A]/20 flex items-center justify-center group-hover:border-[#C65D3B] transition-colors">
                <ArrowLeft className="w-4 h-4" />
              </div>
              <span className="text-sm tracking-wide hidden 550:block">Back</span>
            </button>

            <div className="w-px h-8 bg-[#1A1A1A]/10 hidden 768:block" />

            <div className="flex items-center gap-3">
              <div className="w-8 h-8 768:w-10 768:h-10 rounded-lg overflow-hidden flex-shrink-0 shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={city.image}
                  alt={city.name}
                  className="w-full h-full object-cover"
                />
              </div>
              <div>
                <p className="text-[#C65D3B] text-[9px] 768:text-[10px] tracking-[0.15em] uppercase leading-tight">
                  Destination
                </p>
                <h2 className="text-sm 768:text-base font-display text-[#1A1A1A] leading-tight">
                  {city.name}, {city.displayCountry}
                </h2>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-[#1A1A1A]/40 tracking-wider uppercase hidden 550:block">
              Step 2 of 3
            </span>
            <div className="w-16 550:w-24 h-1 bg-[#1A1A1A]/10 rounded-full overflow-hidden">
              <div className="h-full bg-[#C65D3B] rounded-full w-2/3 transition-all duration-500" />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content - centered */}
      <main className="px-4 480:px-6 768:px-10 1024:px-16 pb-12 768:pb-20">
        <div className="max-w-5xl mx-auto">
          {/* Title */}
          <div className="text-center mt-8 768:mt-14 mb-10 768:mb-14">
            <p
              className="text-[#C65D3B] text-xs tracking-[0.2em] uppercase mb-3 animate-slide-in-right"
              style={{ animationDelay: '0.15s' }}
            >
              Define your journey
            </p>
            <h1
              className="text-3xl 480:text-4xl 768:text-5xl font-display text-[#1A1A1A] leading-[0.95] tracking-tight mb-4 animate-text-reveal"
              style={{ animationDelay: '0.25s' }}
            >
              What brings <span className="italic">you here?</span>
            </h1>
            <p
              className="text-sm 768:text-base text-[#1A1A1A]/40 max-w-md mx-auto leading-relaxed animate-fade-in-up"
              style={{ animationDelay: '0.35s' }}
            >
              Your intent shapes your experience. Tell us how you want to connect with {city.name}.
            </p>
          </div>

          {/* Cards Grid */}
          <div className="grid grid-cols-1 768:grid-cols-3 gap-4 768:gap-5">
            {intents.map((intent, index) => (
              <IntentCard
                key={intent.id}
                intent={intent}
                index={index}
                onSelect={handleIntentSelect}
                cityName={city.name}
                style={{ animationDelay: `${0.4 + index * 0.12}s` }}
              />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

export function IntentSelectionPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-[#C65D3B] border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <IntentSelectionContent />
    </Suspense>
  );
}
