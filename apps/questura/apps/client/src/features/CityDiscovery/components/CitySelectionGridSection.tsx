'use client';

import { useRouter } from 'next/navigation';
import { useFeaturedCityGrid } from '../hooks/useFeaturedCityGrid';
import {
  getLayoutSlotClassName,
  TOP_GRID_ANIMATION_DELAYS,
  TOP_GRID_CITIES,
} from '../lib/cityGridLayout';
import { cities } from '../lib/data';
import { CityCard } from './CityCard';
import { CitySelectionHero } from './CitySelectionHero';

interface CitySelectionGridSectionProps {
  isDevMode: boolean;
  showDevReference: boolean;
}

export function CitySelectionGridSection({ isDevMode, showDevReference }: CitySelectionGridSectionProps) {
  const router = useRouter();
  const { activeLayoutSlotsById, requestFeaturedCity, setTopCardRef } = useFeaturedCityGrid();

  const handleCitySelect = (cityId: string) => {
    router.push(`/step-2?city=${cityId}`);
  };

  return (
    <>
      <div className="grid grid-cols-1 380:grid-cols-2 1024:grid-cols-3 gap-3 480:gap-4 768:gap-5 1024:gap-6">
        {TOP_GRID_CITIES.map((city, index) => (
          <div
            key={city.id}
            ref={setTopCardRef(city.id)}
            className={getLayoutSlotClassName(activeLayoutSlotsById[city.id])}
            onMouseEnter={() => requestFeaturedCity(city.id, 'hover')}
          >
            <CityCard
              city={city}
              onSelect={handleCitySelect}
              variant={activeLayoutSlotsById[city.id].variant}
              style={{ animationDelay: TOP_GRID_ANIMATION_DELAYS[index] }}
            />
          </div>
        ))}
      </div>

      <p
        className="mt-10 768:mt-16 text-center text-[#1A1A1A]/40 text-xs 768:text-sm tracking-wide animate-fade-in"
        style={{ animationDelay: '1.1s' }}
      >
        More destinations launching soon
      </p>

      {isDevMode && showDevReference ? (
        <section className="mt-12 768:mt-20 pt-10 768:pt-14 border-t border-[#1A1A1A]/10">
          <CitySelectionHero
            label="Dev reference"
            headingLevel="h2"
            headingSize="reference"
          />

          <div className="grid grid-cols-1 380:grid-cols-2 1024:grid-cols-3 gap-3 480:gap-4 768:gap-5 1024:gap-6">
            <div className="1024:col-start-1 1024:row-start-1">
              <CityCard city={cities[0]} onSelect={handleCitySelect} />
            </div>

            <div className="1024:col-span-2 1024:row-span-2 1024:col-start-2 1024:row-start-1">
              <CityCard city={cities[1]} onSelect={handleCitySelect} variant="featured" />
            </div>

            <div className="1024:col-start-1 1024:row-start-2">
              <CityCard city={cities[2]} onSelect={handleCitySelect} />
            </div>

            <div className="1024:col-start-1 1024:row-start-3">
              <CityCard city={cities[3]} onSelect={handleCitySelect} />
            </div>

            <div className="1024:col-start-2 1024:row-start-3">
              <CityCard city={cities[4]} onSelect={handleCitySelect} />
            </div>

            <div className="1024:col-start-3 1024:row-start-3">
              <CityCard city={cities[5]} onSelect={handleCitySelect} />
            </div>
          </div>

          <p className="mt-10 768:mt-16 text-center text-[#1A1A1A]/40 text-xs 768:text-sm tracking-wide">
            More destinations launching soon
          </p>
        </section>
      ) : null}
    </>
  );
}
