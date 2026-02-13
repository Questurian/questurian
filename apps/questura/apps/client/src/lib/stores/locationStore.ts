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

export const useLocationStore = create<LocationStore>()(
  persist(
    (set) => ({
      isOnboarded: false,
      favoriteCity: null,
      lastVisited: null,

      completeOnboarding: (city) =>
        set({ isOnboarded: true, favoriteCity: city, lastVisited: city }),

      setFavoriteCity: (city) =>
        set({ favoriteCity: city }),

      clearFavoriteCity: () =>
        set({ favoriteCity: null }),

      setLastVisited: (location) =>
        set({ lastVisited: location }),
    }),
    { name: 'questura-location' }
  )
);
