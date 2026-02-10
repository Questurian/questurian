"use client";

import { Logo, MenuIcon, SignInButton, SubscribeButton, UserIcon } from "./components";
import Link from "next/link";
import { useAuth } from "@/lib/user/hooks";
import LoadingSpinner from "@/components/shared/ui/LoadingSpinner";

export default function MobileNavbar() {
  const { user, loading, isAuthenticated } = useAuth();
  const shouldShowSubscribe = !isAuthenticated || user?.subscriptionStatus !== "active";

  return (
    <nav className="w-full border-b border-black/10 bg-[#ece9e3] px-3 py-2.5 380:px-4 380:py-3">
      <div className="flex min-h-8 items-center justify-between gap-3">
        <div className="flex h-8 min-w-0 items-center gap-2">
          <MenuIcon
            buttonClassName="h-8 w-8 shrink-0"
            iconClassName="!text-black h-6 w-6"
          />
          <Link href="/" className="cursor-pointer flex h-8 min-w-0 items-center">
            <Logo className="whitespace-nowrap font-bold leading-none text-[0.92rem] tracking-[0.06em] 380:text-[1.02rem] 480:text-[1.12rem]" />
          </Link>
        </div>

        <div className="flex h-8 shrink-0 items-center gap-1.5 380:gap-2">
          {loading ? (
            <LoadingSpinner variant="inline" size="small" />
          ) : (
            <>
              {shouldShowSubscribe ? (
                <Link href="/join" className="flex h-8 items-center">
                  <div className="origin-right scale-90 380:scale-100">
                    <SubscribeButton />
                  </div>
                </Link>
              ) : null}
              {isAuthenticated ? (
                <UserIcon
                  buttonClassName="h-8 w-8"
                  iconClassName="!text-black h-6 w-6"
                />
              ) : (
                <SignInButton className="!text-black h-8 inline-flex items-center leading-none text-[0.63rem] 380:text-[0.69rem]" />
              )}
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
