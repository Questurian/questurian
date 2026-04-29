"use client";

import { User, ChevronDown } from "lucide-react";
import { useUserModalStore } from "@/lib/stores/userModalStore";

interface UserIconProps {
  buttonClassName?: string;
}

export default function UserIcon({ buttonClassName = "" }: UserIconProps) {
  const { openUserModal } = useUserModalStore();

  return (
    <button
      onClick={openUserModal}
      className={`group inline-flex shrink-0 cursor-pointer items-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20 focus-visible:ring-offset-1 ${buttonClassName}`}
      aria-label="Open user menu"
    >
      <span className="flex h-8 items-center gap-2 rounded-full bg-[#e2ded8] pl-[5px] pr-3.5 transition-colors duration-150 group-hover:bg-[#d8d4cd] 480:h-10 480:pl-[6px] 480:pr-4">
        <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-[#f5f3ef] to-[#e0dcd6] ring-1 ring-black/[0.04] 480:h-[28px] 480:w-[28px]">
          <User
            aria-hidden
            strokeWidth={1.75}
            className="h-[9px] w-[9px] text-stone-900 480:h-[11px] 480:w-[11px]"
          />
        </span>
        <ChevronDown
          aria-hidden
          strokeWidth={2.5}
          className="h-[9px] w-[9px] shrink-0 text-stone-500/70 480:h-[10px] 480:w-[10px]"
        />
      </span>
    </button>
  );
}
