"use client";
import { useLoginModalStore } from "@/lib/stores/loginModalStore";
interface SignInButtonProps {
  onClick?: () => void;
  className?: string;
}

export default function SignInButton({ onClick, className = "" }: SignInButtonProps) {
  const openLoginModal = useLoginModalStore((state) => state.openLoginModal);
  const handleClick = () => {
    if (onClick) {
      onClick();
      return;
    }

    openLoginModal();
  };

  return (
    <button
      onClick={handleClick}
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
        ${className}
      `}
    >
      Sign in
    </button>
  );
}
