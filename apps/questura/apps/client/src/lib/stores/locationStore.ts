import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface LocationInfo {
  cityId: string;
  country: string;
  mode: string;
}

interface LocationState {
  isOnboarded: boolean;
  favoriteCity: LocationInfo | null;
  lastVisited: LocationInfo | null;
}

interface LocationActions {
  completeOnboarding: (city: LocationInfo) => void;
  setFavoriteCity: (city: LocationInfo) => void;
  clearFavoriteCity: () => void;
  setLastVisited: (location: LocationInfo) => void;
}

type LocationStore = LocationState & LocationActions;

// Helper to sync favorite city to cookie for middleware
const syncFavoriteCityToCookie = (city: LocationInfo | null) => {
  if (typeof document === 'undefined') return;

  if (city) {
    document.cookie = `questura-location-redirect=${encodeURIComponent(JSON.stringify(city))}; path=/; max-age=31536000`;
  } else {
    document.cookie = 'questura-location-redirect=; path=/; max-age=0';
  }
};

export const useLocationStore = create<LocationStore>()(
  persist(
    (set) => ({
      isOnboarded: false,
      favoriteCity: null,
      lastVisited: null,

      completeOnboarding: (city) => {
        set({ isOnboarded: true, favoriteCity: city, lastVisited: city });
        syncFavoriteCityToCookie(city);
      },

      setFavoriteCity: (city) => {
        set({ favoriteCity: city });
        syncFavoriteCityToCookie(city);
      },

      clearFavoriteCity: () => {
        set({ favoriteCity: null });
        syncFavoriteCityToCookie(null);
      },

      setLastVisited: (location) =>
        set({ lastVisited: location }),
    }),
    { name: 'questura-location' }
  )
);
