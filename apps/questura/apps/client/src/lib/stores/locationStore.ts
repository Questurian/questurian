import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface LocationInfo {
  cityId: string;
  country: string;
  mode: string;
}

interface LocationState {
  isOnboarded: boolean;
  favoriteCity: LocationInfo | null;
  lastVisited: LocationInfo | null;
  visitedCities: Record<string, LocationInfo>;
}

interface LocationActions {
  completeOnboarding: (city: LocationInfo) => void;
  setFavoriteCity: (city: LocationInfo) => void;
  setLastVisited: (location: LocationInfo) => void;
  setCityMode: (cityId: string, country: string, mode: string) => void;
  getCityMode: (cityId: string, country: string) => string | null;
}

type LocationStore = LocationState & LocationActions;

function cityKey(cityId: string, country: string): string {
  return `${country}:${cityId}`;
}

const syncFavoriteCityToCookie = (city: LocationInfo) => {
  if (typeof document === 'undefined') return;
  document.cookie = `questura-location-redirect=${encodeURIComponent(JSON.stringify(city))}; path=/; max-age=31536000`;
};

export const useLocationStore = create<LocationStore>()(
  persist(
    (set, get) => ({
      isOnboarded: false,
      favoriteCity: null,
      lastVisited: null,
      visitedCities: {},

      completeOnboarding: (city) => {
        const key = cityKey(city.cityId, city.country);
        set((state) => ({
          isOnboarded: true,
          favoriteCity: city,
          lastVisited: city,
          visitedCities: { ...state.visitedCities, [key]: city },
        }));
        syncFavoriteCityToCookie(city);
      },

      setFavoriteCity: (city) => {
        set({ favoriteCity: city });
        syncFavoriteCityToCookie(city);
      },

      setLastVisited: (location) =>
        set({ lastVisited: location }),

      setCityMode: (cityId, country, mode) => {
        const key = cityKey(cityId, country);
        const info: LocationInfo = { cityId, country, mode };
        set((state) => ({
          visitedCities: { ...state.visitedCities, [key]: info },
        }));
      },

      getCityMode: (cityId, country) => {
        const key = cityKey(cityId, country);
        return get().visitedCities[key]?.mode ?? null;
      },
    }),
    { name: 'questura-location' }
  )
);
