import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface DevStore {
  membershipOverride: boolean;
  toggleMembershipOverride: () => void;
}

export const useDevStore = create<DevStore>()(
  persist(
    (set) => ({
      membershipOverride: false,
      toggleMembershipOverride: () =>
        set((s) => ({ membershipOverride: !s.membershipOverride })),
    }),
    { name: 'dev-store' }
  )
);
