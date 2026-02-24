"use client";

import Link from "next/link";
import LoadingSpinner from "@/components/shared/ui/LoadingSpinner";
import { SubNav } from "../components/SubNav";
import {
  MenuIcon,
  Logo,
  SubscribeButton,
  SignInButton,
  UserIcon,
} from "../shared/components";
import { LocationPill } from "./components/LocationPill";
import { useDesktopNavbarState } from "./hooks/use-desktop-navbar-state";

export default function DesktopNavbar() {
  const {
    loading,
    isAuthenticated,
    shouldShowSubscribe,
    hasCityContext,
    countrySlug,
    citySlug,
    activeMode,
    cityName,
    countryName,
    countryCode,
    activeCitySlug,
    activeCountrySlug,
    handleModeChange,
  } = useDesktopNavbarState();

  return (
    <div className="w-full overflow-hidden border-b border-black/10">
      <nav className="w-full bg-[#252629] px-6 py-1.5">
        <div className="flex w-full items-center justify-between gap-4">
          <LocationPill
            cityName={cityName}
            countryName={countryName}
            countryCode={countryCode}
            currentCityId={activeCitySlug}
            currentCountry={activeCountrySlug}
          />
          <SubNav
            compact
            activeMode={activeMode}
            getHref={
              hasCityContext
                ? (mode) => `/${countrySlug}/${citySlug}/${mode}`
                : undefined
            }
            onModeSelect={handleModeChange}
          />
        </div>
      </nav>

      <div className="w-full bg-[#ece9e3] px-8 py-6">
        <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center">
          <div className="justify-self-start">
            <MenuIcon iconClassName="!text-black" />
          </div>
          <Link
            href={hasCityContext ? `/${countrySlug}/${citySlug}/${activeMode}` : "/"}
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
