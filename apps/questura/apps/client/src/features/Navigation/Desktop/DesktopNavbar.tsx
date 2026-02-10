"use client";

import { ChevronDown } from "lucide-react";
import {
  MenuIcon,
  Logo,
  SubscribeButton,
  SignInButton,
  UserIcon,
} from "../shared/components";
import { SubNav, type CityMode } from "../components/SubNav";
import Link from "next/link";
import { useAuth } from "@/lib/user/hooks";
import LoadingSpinner from "@/components/shared/ui/LoadingSpinner";
import { useParams, usePathname } from "next/navigation";

const cityModes: CityMode[] = ["explore", "stay", "move"];

function getParamValue(param: string | string[] | undefined): string | undefined {
  if (typeof param === "string") {
    return param;
  }

  if (Array.isArray(param)) {
    return param[0];
  }

  return undefined;
}

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
  const params = useParams();
  const pathname = usePathname();
  const shouldShowSubscribe = !isAuthenticated || user?.subscriptionStatus !== "active";

  const countrySlug = getParamValue(params.country)?.toLowerCase();
  const citySlug = getParamValue(params.city)?.toLowerCase();
  const modeSlugFromParams = getParamValue(params.mode)?.toLowerCase();

  const pathnameSegments = pathname.split("/").filter(Boolean);
  const modeSlugFromPath = pathnameSegments[2]?.toLowerCase();
  const rawMode = modeSlugFromParams || modeSlugFromPath;
  const activeMode: CityMode = cityModes.includes(rawMode as CityMode) ? (rawMode as CityMode) : "explore";

  const hasCityContext = Boolean(countrySlug && citySlug);

  return (
    <div className="w-full overflow-hidden border-b border-black/10">
      <nav className="w-full bg-[#252629] px-6 py-1.5">
        <div className="flex w-full items-center justify-between gap-4">
          <LocationPill />
          <SubNav
            compact
            activeMode={activeMode}
            getHref={
              hasCityContext
                ? (mode) => `/${countrySlug}/${citySlug}/${mode}`
                : undefined
            }
          />
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
