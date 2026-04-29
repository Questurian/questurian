"use client";

import { User, ChevronDown } from "lucide-react";
import { useUserModalStore } from "@/lib/stores/userModalStore";

interface UserIconProps {
  buttonClassName?: string;
  isMember?: boolean;
}

export default function UserIcon({ buttonClassName = "", isMember = false }: UserIconProps) {
  const { openUserModal } = useUserModalStore();

  return (
    <button
      onClick={openUserModal}
      className={`group inline-flex shrink-0 cursor-pointer items-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20 focus-visible:ring-offset-1 ${buttonClassName}`}
      aria-label="Open user menu"
    >
      <span className="flex h-8 items-center gap-2 rounded-full bg-[#e2ded8] pl-[5px] pr-3.5 transition-colors duration-150 group-hover:bg-[#d8d4cd] 480:h-10 480:pl-[6px] 480:pr-4">
        {isMember ? (
          <span
            className="relative flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full 480:h-[28px] 480:w-[28px]"
            style={{
              background: 'linear-gradient(160deg, #1e3599 0%, #05092e 100%)',
              boxShadow: '0 0 0 1px rgba(172,128,32,0.8)',
            }}
          >
            <span
              className="font-display text-[8px] font-semibold text-white/90 480:text-[10px]"
              style={{ lineHeight: 1 }}
            >
              Q
            </span>
            <span
              aria-hidden
              className="absolute -right-[2px] -top-[2px] text-[5px] leading-none 480:-right-[3px] 480:-top-[3px] 480:text-[6px]"
              style={{ color: '#c8921e' }}
            >
              ✦
            </span>
          </span>
        ) : (
          <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-[#f5f3ef] to-[#e0dcd6] ring-1 ring-black/[0.04] 480:h-[28px] 480:w-[28px]">
            <User
              aria-hidden
              strokeWidth={1.75}
              className="h-[9px] w-[9px] text-stone-900 480:h-[11px] 480:w-[11px]"
            />
          </span>
        )}
        <ChevronDown
          aria-hidden
          strokeWidth={2.5}
          className="h-[9px] w-[9px] shrink-0 text-stone-500/70 480:h-[10px] 480:w-[10px]"
        />
      </span>
    </button>
  );
}
