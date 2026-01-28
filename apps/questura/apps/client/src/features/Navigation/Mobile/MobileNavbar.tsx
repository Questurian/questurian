"use client";

import {
  Logo,
  MenuIcon,
  SubscribeButton,
  SignInButton,
  UserIcon,
} from "./components";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth, useLogoutMutation } from "@/lib/user/hooks";
import { useLoginModalStore } from "@/lib/stores/loginModalStore";
import LoadingSpinner from "@/components/shared/ui/LoadingSpinner";

export default function MobileNavbar() {
  const { user, loading, isAuthenticated } = useAuth();
  const logoutMutation = useLogoutMutation();
  const openLoginModal = useLoginModalStore((state) => state.openLoginModal);

  return (
    <nav className="w-full h-[55px]  bg-[rgb(31,31,31)] flex items-center px-4 justify-between">
      {/* // Right side of the navbar */}
      <div className="flex items-center gap-4 768:gap-5 1024:gap-6 1280:gap-8">
        <MenuIcon />
        <Link href="/" className="cursor-pointer">
          <Logo />
        </Link>
        
      </div>

      {/* // Left side of the navbar */}
      <div className="flex items-center gap-2 768:gap-3">
        {loading ? (
          // Fallback UI during loading: show a small inline spinner
          <LoadingSpinner variant="inline" size="small" />
        ) : (
          <>
            {!isAuthenticated || user?.subscriptionStatus !== "active" ? (
              <Link
                href="/join"
                className=" text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                <SubscribeButton />
              </Link>
            ) : null}
            {isAuthenticated ? (
              <>
                <UserIcon />
              </>
            ) : (
              <SignInButton />
            )}
          </>
        )}
      </div>
    </nav>
  );
}
