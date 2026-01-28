'use client';

import { TextSearch } from 'lucide-react';
import { useMenuModalStore } from '@/lib/stores/menuModalStore';

export default function MenuIcon() {
  const { openMenuModal } = useMenuModalStore();

  return (
    <button
      onClick={openMenuModal}
      className="p-0 bg-transparent border-0 cursor-pointer focus:outline-none"
      aria-label="Open menu modal"
    >
      <TextSearch
        className={`
          /* Base styles */
          w-4 h-4
          text-white
          cursor-pointer
          /* 280px breakpoint */
          /* 320px breakpoint */
          /* 380px breakpoint */
          /* 480px breakpoint */
          480:w-5 480:h-5
          /* 550px breakpoint */
          550:w-6 550:h-6
        `}
      />
    </button>
  );
}
