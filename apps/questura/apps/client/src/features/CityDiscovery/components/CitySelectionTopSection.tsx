'use client';

import type { ReactNode } from 'react';

interface CitySelectionTopSectionProps {
  children: ReactNode;
}

export function CitySelectionTopSection({ children }: CitySelectionTopSectionProps) {
  return (
    <>
      <header className="animate-fade-in-down border-b border-[#1A1A1A]/10">
        <div className="h-16 768:h-20 px-4 480:px-6 768:px-10 1024:px-16 flex items-center justify-between">
          <div className="inline-flex flex-col leading-none">
            <span className="font-display text-[1.9rem] 480:text-[2.1rem] text-[#1A1A1A]">Questurian</span>
            <span className="mt-1 h-px w-full bg-[#1A1A1A]/45" />
          </div>

          <div className="flex items-center gap-3 768:gap-5">
            <span className="text-[10px] 480:text-xs tracking-[0.17em] uppercase text-[#1A1A1A]/45 whitespace-nowrap">
              Step 1 of 3
            </span>
            <div className="h-1 w-16 480:w-20 768:w-24 bg-[#1A1A1A]/12 overflow-hidden rounded-full">
              <div className="h-full w-[35%] bg-[#C65D3B] rounded-full" />
            </div>
          </div>
        </div>
      </header>

      <main className="px-4 480:px-6 768:px-10 1024:px-16 pb-12 768:pb-20">
        <section className="pt-6 480:pt-8 768:pt-10 max-w-[1400px] mx-auto">
          <div className="max-w-[62rem]">
            <p className="text-[#C65D3B] text-xs 480:text-sm tracking-[0.32em] uppercase mb-2 480:mb-3 768:mb-4 animate-slide-in-right">
              Choose your destination
            </p>

            <h1
              className="font-display text-[#1A1A1A] leading-[0.94] tracking-[-0.02em] text-[2rem] 480:text-[2.7rem] 768:text-[3.6rem] 1024:text-[4.3rem] animate-text-reveal"
              style={{ animationDelay: '0.1s' }}
            >
              Where to <span className="city-next-pop">next?</span>
            </h1>

            <p
              className="mt-3 480:mt-4 768:mt-5 max-w-[54rem] text-[#1A1A1A]/62 leading-[1.42] text-sm 480:text-[1.05rem] 768:text-[1.35rem] font-display animate-fade-in-up"
              style={{ animationDelay: '0.25s' }}
            >
              Select a city that resonates with your rhythm and pace. Every destination reveals a different way to
              live, work, and connect.
            </p>
          </div>
        </section>

        <div className="mt-8 768:mt-10 1024:mt-12">{children}</div>
      </main>
    </>
  );
}
