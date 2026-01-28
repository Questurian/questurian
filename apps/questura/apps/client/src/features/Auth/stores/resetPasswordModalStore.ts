/**
 * Zustand store for managing password reset modal state
 * Similar to loginModalStore but for the password reset flow
 */

import { create } from 'zustand';

interface ResetPasswordModalState {
  isOpen: boolean;
  email: string;
  openModal: (email: string) => void;
  closeModal: () => void;
}

export const useResetPasswordModalStore = create<ResetPasswordModalState>((set) => ({
  isOpen: false,
  email: '',
  openModal: (email: string) => {
    set({ isOpen: true, email });
  },
  closeModal: () => {
    set({ isOpen: false, email: '' });
  }
}));
