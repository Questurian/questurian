'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { getCityById, getIntentById } from '../lib/data';

function ConfirmationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const cityId = searchParams.get('city');
  const intentId = searchParams.get('intent');

  const city = getCityById(cityId || '');
  const intent = getIntentById(intentId || '');

  if (!city || !intent) {
    if (typeof window !== 'undefined') {
      router.push('/');
    }
    return null;
  }

  const handleContinue = () => {
    router.push(`/${city.country}/${city.id}`);
  };

  const handleStartOver = () => {
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center px-4 480:px-6 768:px-8 py-10 768:py-16">
      <div className="w-full max-w-2xl">
        {/* Progress Bar */}
        <div className="flex justify-center mb-8 768:mb-10 animate-fade-in">
          <div className="flex items-center gap-3">
            <span className="text-xs text-[#1A1A1A]/40 tracking-wider uppercase hidden 550:block">
              Step 3 of 3
            </span>
            <div className="w-16 550:w-24 h-1 bg-[#1A1A1A]/10 rounded-full overflow-hidden">
              <div className="h-full bg-[#C65D3B] rounded-full w-full transition-all duration-500" />
            </div>
          </div>
        </div>

        {/* Success Mark */}
        <div className="flex justify-center mb-6 768:mb-10">
          <div className="w-16 h-16 768:w-20 768:h-20 bg-[#2D4A3E] rounded-full flex items-center justify-center animate-scale-in">
            <svg className="w-8 h-8 768:w-10 768:h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </div>

        {/* Heading */}
        <h1 className="text-4xl 768:text-5xl 1024:text-6xl font-display text-[#1A1A1A] text-center leading-[0.95] tracking-tight mb-4 768:mb-6 animate-text-reveal">
          Perfect
          <br />
          <span className="italic">choice</span>
        </h1>

        {/* Subtext */}
        <p
          className="text-base 768:text-lg text-[#1A1A1A]/60 text-center max-w-md mx-auto mb-8 768:mb-12 leading-relaxed animate-fade-in-up"
          style={{ animationDelay: '0.2s' }}
        >
          You&apos;re ready to <span className="text-[#C65D3B] font-medium">{intent.verb} {city.name}</span>.
          We&apos;re preparing your personalized experience.
        </p>

        {/* Summary Card */}
        <div
          className="bg-white rounded-2xl 768:rounded-3xl overflow-hidden shadow-xl mb-8 768:mb-10 animate-fade-in-up"
          style={{ animationDelay: '0.4s' }}
        >
          <div className="relative h-40 480:h-48 768:h-56">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={city.image}
              alt={city.name}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            <div className="absolute bottom-4 480:bottom-5 768:bottom-6 left-4 480:left-5 768:left-6">
              <p className="text-white/70 text-xs 768:text-sm mb-0.5 768:mb-1">{city.displayCountry}</p>
              <h2 className="text-2xl 480:text-3xl 768:text-4xl font-display text-white">{city.name}</h2>
            </div>
          </div>

          <div className="p-4 768:p-6 flex flex-wrap gap-2 768:gap-3">
            <span className="px-3 768:px-4 py-1.5 768:py-2 bg-[#C65D3B]/10 text-[#C65D3B] rounded-full text-xs 768:text-sm font-medium">
              {intent.title}
            </span>
            <span className="px-3 768:px-4 py-1.5 768:py-2 bg-[#F5F0E8] text-[#1A1A1A]/70 rounded-full text-xs 768:text-sm">
              {city.tag}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div
          className="flex flex-col gap-3 768:flex-row 768:gap-4 768:justify-center animate-fade-in-up"
          style={{ animationDelay: '0.6s' }}
        >
          <button
            onClick={handleContinue}
            className="group flex items-center justify-center gap-3 bg-[#1A1A1A] hover:bg-[#2D4A3E] text-white px-6 py-3.5 768:px-8 768:py-4 rounded-full font-medium transition-all duration-300"
          >
            Continue to {city.name}
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>
          <button
            onClick={handleStartOver}
            className="px-6 py-3.5 768:px-8 768:py-4 rounded-full font-medium text-[#1A1A1A]/60 hover:text-[#1A1A1A] hover:bg-[#1A1A1A]/5 transition-all"
          >
            Start over
          </button>
        </div>
      </div>
    </div>
  );
}

export function ConfirmationPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-[#C65D3B] border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <ConfirmationContent />
    </Suspense>
  );
}
