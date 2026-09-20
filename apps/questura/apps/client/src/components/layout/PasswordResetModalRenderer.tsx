"use client";

import dynamic from 'next/dynamic';

import { useResetPasswordModalStore } from '@/features/Auth/stores/resetPasswordModalStore';

const PasswordResetModal = dynamic(() => import('@/components/layout/PasswordResetModal'), {
  ssr: false,
});

export default function PasswordResetModalRenderer() {
  const { isOpen, email, closeModal } = useResetPasswordModalStore();

  if (!isOpen) return null;

  return <PasswordResetModal isOpen onClose={closeModal} email={email} />;
}
