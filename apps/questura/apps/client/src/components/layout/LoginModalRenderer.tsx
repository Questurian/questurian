"use client";

import { useLoginModalStore } from '@/lib/stores/loginModalStore';
import LoginModal from '@/components/layout/LoginModal';

export default function LoginModalRenderer() {
  const { isOpen, options, closeLoginModal } = useLoginModalStore();

  return (
    <LoginModal
      isOpen={isOpen}
      onClose={closeLoginModal}
      onSuccess={options.onSuccess}
      title={options.title}
      subtitle={options.subtitle}
      errorMessage={options.errorMessage}
      prefillEmail={options.prefillEmail}
    />
  );
}
