"use client";

import { ChevronDown } from "lucide-react";
import {
  Logo,
  MenuIcon,
  SubscribeButton,
  SignInButton,
  UserIcon,
} from "./components";
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
      <span className="text-[0.78rem] font-medium tracking-[0.02em]">Lima, Peru</span>
      <ChevronDown className="h-3.5 w-3.5" />
    </button>
  );
}

export default function MobileNavbar() {
  const { user, loading, isAuthenticated } = useAuth();

  return (
    <div className="w-full overflow-hidden border-b border-black/10">
      <nav className="w-full bg-[#252629] px-3 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <LocationPill />

          <div className="flex items-center gap-2">
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

        <div className="mt-2.5 flex justify-center">
          <SubNav />
        </div>
      </nav>

      <div className="w-full bg-[#ece9e3] px-4 py-3">
        <div className="grid grid-cols-[24px_1fr_24px] items-center">
          <MenuIcon iconClassName="!text-black" />
          <Link href="/" className="cursor-pointer justify-self-center">
            <Logo
              className="text-[1.25rem] tracking-[0.14em] 480:text-[1.45rem]"
              subtitleClassName="text-[0.8rem] 480:text-[0.92rem]"
            />
          </Link>
          <span aria-hidden="true" className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
