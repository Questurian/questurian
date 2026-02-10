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
      className="inline-flex items-center gap-2 text-white/95 hover:text-white transition-colors"
      aria-label="Current location: Lima, Peru"
    >
      <span className="inline-flex h-3.5 w-5 overflow-hidden rounded-[2px] border border-white/35">
        <span className="w-1/3 bg-[#c61229]" />
        <span className="w-1/3 bg-[#f8f8f8]" />
        <span className="w-1/3 bg-[#c61229]" />
      </span>
      <span className="text-sm font-medium tracking-[0.02em]">Lima, Peru</span>
      <ChevronDown className="h-3.5 w-3.5" />
    </button>
  );
}

export default function DesktopNavbar() {
  const { user, loading, isAuthenticated } = useAuth();

  return (
    <div className="w-full overflow-hidden border-b border-black/10">
      <nav className="w-full bg-[#252629] px-6 py-2.5">
        <div className="mx-auto flex max-w-[1320px] items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <LocationPill />
            <SubNav />
          </div>

          <div className="flex items-center gap-4">
            {loading ? (
              <LoadingSpinner variant="inline" size="small" />
            ) : (
              <>
                {!isAuthenticated || user?.subscriptionStatus !== "active" ? (
                  <Link href="/join">
                    <SubscribeButton />
                  </Link>
                ) : null}
                {isAuthenticated ? <UserIcon /> : <SignInButton />}
              </>
            )}
          </div>
        </div>
      </nav>

      <div className="w-full bg-[#ece9e3] px-8 py-5">
        <div className="mx-auto grid max-w-[1320px] grid-cols-[28px_1fr_28px] items-center">
          <MenuIcon iconClassName="!text-black" />
          <Link href="/" className="cursor-pointer justify-self-center">
            <Logo />
          </Link>
          <span aria-hidden="true" className="h-6 w-6" />
        </div>
      </div>
    </div>
  );
}
