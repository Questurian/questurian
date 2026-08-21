"use client";

import { useMenuModalStore } from '@/lib/stores/menuModalStore';
import MenuModal from '@/components/layout/MenuModal';
import type { LocationMenuResponse } from '@/features/Navigation/lib/fetchLocationMenu';

type MenuModalRendererProps = {
  locationMenu?: LocationMenuResponse | null;
};

export default function MenuModalRenderer({ locationMenu = null }: MenuModalRendererProps) {
  const { isOpen, closeMenuModal } = useMenuModalStore();

  // With the menu data already in hand we know exactly which flags the modal
  // will ask for, so warm them at hydration instead of on the click. React
  // hoists these into <head>. A handful of ~1KB SVGs.
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
      <MenuModal
        isOpen={isOpen}
        onClose={closeMenuModal}
        initialLocationMenu={locationMenu}
      />
    </>
  );
}
