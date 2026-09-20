"use client";

import dynamic from 'next/dynamic';

import { useMenuModalStore } from '@/lib/stores/menuModalStore';
import type { LocationMenuResponse } from '@/features/Navigation/lib/fetchLocationMenu';

const MenuModal = dynamic(() => import('@/components/layout/MenuModal'), { ssr: false });

type MenuModalRendererProps = {
  locationMenu?: LocationMenuResponse | null;
};

export default function MenuModalRenderer({ locationMenu = null }: MenuModalRendererProps) {
  const { isOpen, closeMenuModal } = useMenuModalStore();

  // With the menu data already in hand we know exactly which flags the modal
  // will ask for, so warm them at hydration instead of on the click. React
  // hoists these into <head>. A handful of ~1KB SVGs.
  //
  // These stay outside the open gate on purpose: they are the cheap half. The
  // modal's own code is the expensive half and waits for the click.
  const flagCodes = [
    ...new Set(
      (locationMenu?.countries ?? [])
        .map((country) => country.countryCode)
        .filter((code): code is string => Boolean(code)),
    ),
  ];

  return (
    <>
      {flagCodes.map((code) => (
        <link key={code} rel="preload" as="image" href={`/flags/${code}.svg`} />
      ))}
      {isOpen ? (
        <MenuModal isOpen onClose={closeMenuModal} initialLocationMenu={locationMenu} />
      ) : null}
    </>
  );
}
