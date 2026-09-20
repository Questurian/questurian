"use client";

import dynamic from 'next/dynamic';

import { useLoginModalStore } from '@/lib/stores/loginModalStore';

// The store subscription has to stay mounted -- it is what hears the open --
// but the sign-in form behind it is only worth downloading once someone asks
// for it. A statically imported modal ships with the page even while it is
// returning null.
const LoginModal = dynamic(() => import('@/components/layout/LoginModal'), { ssr: false });

export default function LoginModalRenderer() {
  const { isOpen, options, closeLoginModal } = useLoginModalStore();

  if (!isOpen) return null;

  return (
    <LoginModal
      isOpen
      onClose={closeLoginModal}
      onSuccess={options.onSuccess}
      title={options.title}
      subtitle={options.subtitle}
      errorMessage={options.errorMessage}
      prefillEmail={options.prefillEmail}
    />
  );
}
