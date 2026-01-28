"use client";

import { useResetPasswordModalStore } from '@/features/Auth/stores/resetPasswordModalStore';
import PasswordResetModal from '@/components/layout/PasswordResetModal';

export default function PasswordResetModalRenderer() {
  const { isOpen, email, closeModal } = useResetPasswordModalStore();

  return (
    <PasswordResetModal
      isOpen={isOpen}
      onClose={closeModal}
      email={email}
    />
  );
}
