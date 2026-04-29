"use client";

import Link from "next/link";
import LoadingSpinner from "@/components/shared/ui/LoadingSpinner";
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
    hasCityContext,
    countrySlug,
    citySlug,
  } = useDesktopNavbarState();

  return (
    <div className="w-full overflow-hidden border-b border-black/10">
      <div className="w-full bg-[#ece9e3] px-6 py-5 1024:px-8 1024:py-6">
        <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="justify-self-start">
            <MenuIcon iconClassName="!text-black h-6 w-6" />
          </div>
          <Link
            href={hasCityContext ? `/${countrySlug}/${citySlug}` : "/"}
            className="cursor-pointer justify-self-center"
          >
            <Logo />
          </Link>
          <div className="flex items-center justify-self-end gap-4">
            {loading ? (
              <LoadingSpinner variant="inline" size="small" />
            ) : (
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
