"use client";

import { User } from "lucide-react";
import { useUserModalStore } from "@/lib/stores/userModalStore";

interface UserIconProps {
  buttonClassName?: string;
  iconClassName?: string;
}

export default function UserIcon({ buttonClassName = "", iconClassName = "" }: UserIconProps) {
  const { openUserModal } = useUserModalStore();

  return (
    <button
      onClick={openUserModal}
      className={`inline-flex items-center justify-center p-0 leading-none bg-transparent border-0 cursor-pointer focus:outline-none ${buttonClassName}`}
      aria-label="Open user modal"
    >
      <User
        aria-hidden
        strokeWidth={1.5}
        className={`shrink-0 text-white cursor-pointer ${iconClassName}`}
      />
    </button>
  );
}
