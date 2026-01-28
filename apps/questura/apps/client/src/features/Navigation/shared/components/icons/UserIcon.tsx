"use client";

import { User } from "lucide-react";
import { useUserModalStore } from "@/lib/stores/userModalStore";

export default function UserIcon() {
  const { openUserModal } = useUserModalStore();

  return (
    <button
      onClick={openUserModal}
      className="p-0 bg-transparent border-0 cursor-pointer focus:outline-none"
      aria-label="Open user modal"
    >
      <User
        className={`
     /* Base styles */
          w-5 h-5
          text-white
          cursor-pointer
          /* 280px breakpoint */
          /* 320px breakpoint */
          /* 380px breakpoint */
          /* 480px breakpoint */
          /* 550px breakpoint */
          550:w-6 550:h-6
        `}
      />
    </button>
  );
}
