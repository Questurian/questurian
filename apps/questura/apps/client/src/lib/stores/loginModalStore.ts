import { create } from 'zustand';

interface LoginModalOptions {
  title?: string;
  subtitle?: string;
  onSuccess?: () => void;
  errorMessage?: string;
  prefillEmail?: string;
}

interface LoginModalState {
  isOpen: boolean;
  options: LoginModalOptions;
}

interface LoginModalActions {
  openLoginModal: (options?: LoginModalOptions) => void;
  closeLoginModal: () => void;
}

type LoginModalStore = LoginModalState & LoginModalActions;

export const useLoginModalStore = create<LoginModalStore>((set) => ({
  // Initial state
  isOpen: false,
  options: {},

  // Actions
  openLoginModal: (modalOptions: LoginModalOptions = {}) => {
    set({ options: modalOptions, isOpen: true });
  },

  closeLoginModal: () => {
    set({ isOpen: false, options: {} });
  },
}));
