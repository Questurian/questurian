import { create } from 'zustand';

export interface LocationInfo {
  cityId: string;
  country: string;
}

interface LocationState {
  lastVisited: LocationInfo | null;
}

interface LocationActions {
  setLastVisited: (location: LocationInfo) => void;
}

type LocationStore = LocationState & LocationActions;

const syncLastVisitedToCookie = (location: LocationInfo) => {
  if (typeof document === 'undefined') return;
  document.cookie = `questura-location-redirect=${encodeURIComponent(JSON.stringify(location))}; path=/; max-age=31536000`;
};

export const useLocationStore = create<LocationStore>((set) => ({
  lastVisited: null,

  setLastVisited: (location) => {
    set({ lastVisited: location });
    syncLastVisitedToCookie(location);
  },
}));
