import { create } from 'zustand';

interface UserModalState {
  isOpen: boolean;
}

interface UserModalActions {
  openUserModal: () => void;
  closeUserModal: () => void;
}

type UserModalStore = UserModalState & UserModalActions;

export const useUserModalStore = create<UserModalStore>((set) => ({
  // Initial state
  isOpen: false,

  // Actions
  openUserModal: () => {
    set({ isOpen: true });
  },

  closeUserModal: () => {
    set({ isOpen: false });
  },
}));
