'use client';

import { TextSearch } from 'lucide-react';
import { useMenuModalStore } from '@/lib/stores/menuModalStore';

interface MenuIconProps {
  buttonClassName?: string;
  iconClassName?: string;
}

export default function MenuIcon({ buttonClassName = '', iconClassName = '' }: MenuIconProps) {
  const { openMenuModal } = useMenuModalStore();

  return (
    <button
      onClick={openMenuModal}
      className={`inline-flex items-center justify-center p-0 leading-none bg-transparent border-0 cursor-pointer focus:outline-none ${buttonClassName}`}
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
          ${iconClassName}
        `}
      />
    </button>
  );
}
