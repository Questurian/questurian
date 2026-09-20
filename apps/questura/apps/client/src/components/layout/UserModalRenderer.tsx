"use client";

import dynamic from 'next/dynamic';

import { useUserModalStore } from '@/lib/stores/userModalStore';

// Closed, this modal was still running its user query and preparing a logout
// mutation before reaching its `return null`. Only a member who opens it needs
// either.
const UserModal = dynamic(() => import('@/components/layout/UserModal'), { ssr: false });

export default function UserModalRenderer() {
  const { isOpen, closeUserModal } = useUserModalStore();

  if (!isOpen) return null;

  return <UserModal isOpen onClose={closeUserModal} />;
}
