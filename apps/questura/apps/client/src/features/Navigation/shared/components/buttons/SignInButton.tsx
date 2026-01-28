"use client";
import { useLoginModalStore } from "@/lib/stores/loginModalStore";
interface SignInButtonProps {
  onClick?: () => void;
}

export default function SignInButton({ onClick }: SignInButtonProps) {
  const openLoginModal = useLoginModalStore((state) => state.openLoginModal);
  return (
    <button
      onClick={() => openLoginModal()}
      className={`
        /* Base styles */
        cursor-pointer
        text-[0.690rem] text-white font-bold font-[var(--font-geist-sans)]
        hover:underline hover:opacity-80 transition-opacity
        /* 280px breakpoint */
        /* 320px breakpoint */
        /* 380px breakpoint */
        /* 480px breakpoint */
        480:text-[0.850rem]
        /* 550px breakpoint */
      `}
    >
      Sign in
    </button>
  );
}
