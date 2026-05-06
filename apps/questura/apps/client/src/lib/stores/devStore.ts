import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface DevStore {
  membershipOverride: boolean;
  toggleMembershipOverride: () => void;
  mapsEnabled: boolean;
  toggleMapsEnabled: () => void;
}

export const useDevStore = create<DevStore>()(
  persist(
    (set) => ({
      membershipOverride: false,
      toggleMembershipOverride: () =>
        set((s) => ({ membershipOverride: !s.membershipOverride })),
      mapsEnabled: true,
      toggleMapsEnabled: () =>
        set((s) => ({ mapsEnabled: !s.mapsEnabled })),
    }),
    { name: 'dev-store' }
  )
);
