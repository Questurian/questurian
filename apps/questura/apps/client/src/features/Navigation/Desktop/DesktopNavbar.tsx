"use client";

import { MenuIcon, Logo, SubscribeButton, SignInButton, UserIcon } from "../shared/components";
import Link from "next/link";
import { useAuth } from "@/lib/user/hooks";
import LoadingSpinner from "@/components/shared/ui/LoadingSpinner";

export default function DesktopNavbar() {
  const { user, loading, isAuthenticated } = useAuth();

  return (
    <nav className="w-full h-[115px] bg-[rgb(31,31,31)] flex items-center px-8 relative">
      {/* Left side - Menu icon */}
      <div className="absolute left-8">
        <MenuIcon />
      </div>

      {/* Center - Logo */}
      <div className="flex-1 flex justify-center">
        <Link href="/" className="cursor-pointer">
          <Logo />
        </Link>
      </div>

      {/* Right side - Auth buttons and subscription */}
      <div className="absolute right-8 flex items-center gap-4">
        {loading ? (
          <LoadingSpinner variant="inline" size="small" />
        ) : (
          <>
            {!isAuthenticated || user?.subscriptionStatus !== "active" ? (
              <Link href="/join">
                <SubscribeButton />
              </Link>
            ) : null}
            {isAuthenticated ? (
              <UserIcon />
            ) : (
              <SignInButton />
            )}
          </>
        )}
      </div>
    </nav>
  );
}
