"use client";

import { useUserModalStore } from '@/lib/stores/userModalStore';
import UserModal from '@/components/layout/UserModal';

export default function UserModalRenderer() {
  const { isOpen, closeUserModal } = useUserModalStore();

  return (
    <UserModal
      isOpen={isOpen}
      onClose={closeUserModal}
    />
  );
}
