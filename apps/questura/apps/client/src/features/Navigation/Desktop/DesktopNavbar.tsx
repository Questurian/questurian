"use client";

import { ChevronDown } from "lucide-react";
import {
  MenuIcon,
  Logo,
  SubscribeButton,
  SignInButton,
  UserIcon,
} from "../shared/components";
import { SubNav } from "../components/SubNav";
import Link from "next/link";
import { useAuth } from "@/lib/user/hooks";
import LoadingSpinner from "@/components/shared/ui/LoadingSpinner";

function LocationPill() {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1.5 text-white/95 hover:text-white transition-colors"
      aria-label="Current location: Lima, Peru"
    >
      <span className="inline-flex h-3 w-4.5 overflow-hidden rounded-[2px] border border-white/35">
        <span className="w-1/3 bg-[#c61229]" />
        <span className="w-1/3 bg-[#f8f8f8]" />
        <span className="w-1/3 bg-[#c61229]" />
      </span>
      <span className="text-[0.78rem] font-medium tracking-[0.02em]">Lima, Peru</span>
      <ChevronDown className="h-3 w-3" />
    </button>
  );
}

export default function DesktopNavbar() {
  const { user, loading, isAuthenticated } = useAuth();
  const shouldShowSubscribe = !isAuthenticated || user?.subscriptionStatus !== "active";

  return (
    <div className="w-full overflow-hidden border-b border-black/10">
      <nav className="w-full bg-[#252629] px-6 py-1.5">
        <div className="flex w-full items-center justify-between gap-4">
          <LocationPill />
          <SubNav compact />
        </div>
      </nav>

      <div className="w-full bg-[#ece9e3] px-8 py-6">
        <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center">
          <div className="justify-self-start">
            <MenuIcon iconClassName="!text-black" />
          </div>
          <Link href="/" className="cursor-pointer justify-self-center">
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
                  <UserIcon iconClassName="!text-black" />
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
