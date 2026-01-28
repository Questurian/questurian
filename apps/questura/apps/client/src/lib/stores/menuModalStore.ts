import { create } from 'zustand';

interface MenuModalState {
  isOpen: boolean;
}

interface MenuModalActions {
  openMenuModal: () => void;
  closeMenuModal: () => void;
}

type MenuModalStore = MenuModalState & MenuModalActions;

export const useMenuModalStore = create<MenuModalStore>((set) => ({
  // Initial state
  isOpen: false,

  // Actions
  openMenuModal: () => {
    set({ isOpen: true });
  },

  closeMenuModal: () => {
    set({ isOpen: false });
  },
}));
