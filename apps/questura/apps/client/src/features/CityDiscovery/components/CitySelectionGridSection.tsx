'use client';

import { useRouter } from 'next/navigation';
import { useFeaturedCityGrid } from '../hooks/useFeaturedCityGrid';
import {
  getLayoutSlotClassName,
  TOP_GRID_ANIMATION_DELAYS,
  TOP_GRID_CITIES,
} from '../lib/cityGridLayout';
import { CityCard } from './CityCard';

export function CitySelectionGridSection() {
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
    </>
  );
}
