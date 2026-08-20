"use client";

import Link from "next/link";
import {
  MenuIcon,
  Logo,
  SubscribeButton,
  SignInButton,
  UserIcon,
} from "../shared/components";
import { useDesktopNavbarState } from "./hooks/use-desktop-navbar-state";

export default function DesktopNavbar() {
  const {
    loading,
    isAuthenticated,
    isActive,
    shouldShowSubscribe,
  } = useDesktopNavbarState();

  return (
    <div
      className="w-full border-b"
      style={{
        borderBottomColor: "rgba(0, 0, 0, var(--navbar-border-alpha, 0.1))",
      }}
    >
      <div
        className="w-full bg-[#ece9e3] px-4"
        style={{
          // Padding interpolates from 24px (full) → 8px (compact) as
          // --navbar-collapse goes 0 → 1, driven by the scroll listener in Navbar.tsx.
          paddingTop: "calc(24px - var(--navbar-collapse, 0) * 16px)",
          paddingBottom: "calc(24px - var(--navbar-collapse, 0) * 16px)",
        }}
      >
        <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="justify-self-start">
            <MenuIcon iconClassName="!text-black h-6 w-6" />
          </div>
          <Link
            href="/"
            data-no-hover-underline
            className="cursor-pointer justify-self-center"
          >
            <Logo />
          </Link>
          <div className="flex items-center justify-self-end gap-4">
            {/* Auth unresolved: render nothing. No spinner -- the buttons either
                appear or they do not; a permanently empty slot is our bug to fix. */}
            {loading ? null : (
              <>
                {shouldShowSubscribe ? (
                  <Link href="/join">
                    <SubscribeButton />
                  </Link>
                ) : null}
                {isAuthenticated ? (
                  <UserIcon isMember={isActive} />
                ) : (
                  <SignInButton className="!text-black" />
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
