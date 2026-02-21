import { create } from 'zustand';

interface IntentModalState {
  isOpen: boolean;
  cityId: string | null;
  country: string | null;
  cityName: string | null;
}

interface IntentModalActions {
  openIntentModal: (cityId: string, country: string, cityName: string) => void;
  closeIntentModal: () => void;
}

type IntentModalStore = IntentModalState & IntentModalActions;

export const useIntentModalStore = create<IntentModalStore>((set) => ({
  isOpen: false,
  cityId: null,
  country: null,
  cityName: null,

  openIntentModal: (cityId, country, cityName) => {
    set({ isOpen: true, cityId, country, cityName });
  },

  closeIntentModal: () => {
    set({ isOpen: false, cityId: null, country: null, cityName: null });
  },
}));
