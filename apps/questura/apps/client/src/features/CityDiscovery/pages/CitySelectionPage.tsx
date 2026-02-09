'use client';

import { Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin } from 'lucide-react';
import { CityCard } from '../components/CityCard';
import { cities } from '../lib/data';

function CitySelectionContent() {
  const router = useRouter();

  const handleCitySelect = (cityId: string) => {
    router.push(`/step-2?city=${cityId}`);
  };

  return (
    <div className="min-h-screen bg-[#F5F0E8]">
      {/* Header */}
      <header className="px-4 480:px-6 768:px-10 1024:px-16 py-5 768:py-8 animate-fade-in-down">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 480:w-10 480:h-10 bg-[#C65D3B] rounded-full flex items-center justify-center">
              <MapPin className="w-4 h-4 480:w-5 480:h-5 text-white" />
            </div>
            <span className="text-xl 480:text-2xl font-semibold tracking-tight text-[#1A1A1A]">
              Questurian
            </span>
          </div>

          {/* Progress Bar */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-[#1A1A1A]/40 tracking-wider uppercase hidden 550:block">
              Step 1 of 3
            </span>
            <div className="w-16 550:w-24 h-1 bg-[#1A1A1A]/10 rounded-full overflow-hidden">
              <div className="h-full bg-[#C65D3B] rounded-full w-1/3 transition-all duration-500" />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="px-4 480:px-6 768:px-10 1024:px-16 pb-12 768:pb-20">
        {/* Hero Text */}
        <div className="max-w-4xl mb-8 480:mb-10 768:mb-14 1024:mb-16">
          <p
            className="text-[#C65D3B] text-xs 480:text-sm tracking-[0.2em] uppercase mb-3 animate-slide-in-right"
            style={{ animationDelay: '0.1s' }}
          >
            Choose your destination
          </p>
          <h1
            className="text-4xl 480:text-5xl 768:text-6xl 1024:text-7xl font-display text-[#1A1A1A] leading-[0.95] tracking-tight animate-text-reveal"
            style={{ animationDelay: '0.2s' }}
          >
            Where to
            <br />
            <span className="italic">next?</span>
          </h1>
          <p
            className="mt-4 480:mt-5 768:mt-6 text-sm 480:text-base 768:text-lg text-[#1A1A1A]/60 max-w-lg leading-relaxed animate-fade-in-up"
            style={{ animationDelay: '0.4s' }}
          >
            Select a city that resonates with your rhythm. Each destination offers a unique way of life.
          </p>
        </div>

        {/* City Grid - Mobile-first progressive layout */}
        <div className="grid grid-cols-1 380:grid-cols-2 1024:grid-cols-3 gap-3 480:gap-4 768:gap-5 1024:gap-6">
          {/* Featured City */}
          <div className="380:col-span-2 1024:col-span-2 1024:row-span-2">
            <CityCard
              city={cities[0]}
              onSelect={handleCitySelect}
              variant="featured"
              style={{ animationDelay: '0.5s' }}
            />
          </div>

          {/* Regular Cities */}
          {cities.slice(1, 6).map((city, i) => (
            <CityCard
              key={city.id}
              city={city}
              onSelect={handleCitySelect}
              style={{ animationDelay: `${0.55 + i * 0.07}s` }}
            />
          ))}

        </div>

        {/* Footer Note */}
        <p
          className="mt-10 768:mt-16 text-center text-[#1A1A1A]/40 text-xs 768:text-sm tracking-wide animate-fade-in"
          style={{ animationDelay: '1.1s' }}
        >
          More destinations launching soon
        </p>
      </main>
    </div>
  );
}

export function CitySelectionPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-[#C65D3B] border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <CitySelectionContent />
    </Suspense>
  );
}
