"use client";

import { useMenuModalStore } from '@/lib/stores/menuModalStore';
import MenuModal from '@/components/layout/MenuModal';

export default function MenuModalRenderer() {
  const { isOpen, closeMenuModal } = useMenuModalStore();

  return (
    <MenuModal
      isOpen={isOpen}
      onClose={closeMenuModal}
    />
  );
}
