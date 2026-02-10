'use client';

import { MapPin } from 'lucide-react';
import { CitySelectionHero } from './CitySelectionHero';

interface CitySelectionTopSectionProps {
  children: JSX.Element;
}

export function CitySelectionTopSection({ children }: CitySelectionTopSectionProps) {
  return (
    <>
      <header className="px-4 480:px-6 768:px-10 1024:px-16 py-5 768:py-8 animate-fade-in-down">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 480:w-10 480:h-10 bg-[#C65D3B] rounded-full flex items-center justify-center">
              <MapPin className="w-4 h-4 480:w-5 480:h-5 text-white" />
            </div>
            <span className="text-xl 480:text-2xl font-semibold tracking-tight text-[#1A1A1A]">
              Questurian
            </span>
          </div>

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

      <main className="px-4 480:px-6 768:px-10 1024:px-16 pb-12 768:pb-20">
        <CitySelectionHero label="Choose your destination" animated />
        {children}
      </main>
    </>
  );
}
