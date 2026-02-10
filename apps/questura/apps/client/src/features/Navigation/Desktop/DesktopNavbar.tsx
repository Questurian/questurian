"use client";

import { useEffect, useRef, useState } from "react";
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
import { useParams, usePathname, useRouter } from "next/navigation";
import { cities, getCityBySlug } from "@/features/CityDiscovery/lib/data";

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

function formatSlugLabel(value: string): string {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

interface LocationPillProps {
  cityName: string;
  countryName: string;
  countryCode?: string;
}

function LocationPill({ cityName, countryName, countryCode }: LocationPillProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const locationLabel = `${cityName}, ${countryName}`;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (!dropdownRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  const handleChangeCity = () => {
    setIsOpen(false);
  };

  const handleChangeCountry = () => {
    setIsOpen(false);
    router.push("/");
  };

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        className="inline-flex items-center gap-1.5 text-white/95 hover:text-white transition-colors"
        aria-label={`Current location: ${locationLabel}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((currentState) => !currentState)}
      >
        <span className="inline-flex h-3 w-4.5 overflow-hidden rounded-[2px] border border-white/35 bg-white/10">
          {countryCode ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://flagcdn.com/w40/${countryCode}.png`}
                srcSet={`https://flagcdn.com/w40/${countryCode}.png 1x, https://flagcdn.com/w80/${countryCode}.png 2x`}
                alt={`${countryName} flag`}
                className="h-full w-full object-cover"
              />
            </>
          ) : (
            <span className="h-full w-full bg-white/30" />
          )}
        </span>
        <span className="text-[0.78rem] font-medium tracking-[0.02em]">{locationLabel}</span>
        <ChevronDown
          className={`h-3 w-3 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen ? (
        <div
          role="menu"
          className="absolute left-0 top-full z-30 mt-2 min-w-40 rounded-md border border-white/15 bg-[#2d2f33] p-1.5 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            className="w-full cursor-pointer rounded px-3 py-2 text-left text-sm text-white/90 hover:bg-white/10"
            onClick={handleChangeCity}
          >
            Change City
          </button>
          <button
            type="button"
            role="menuitem"
            className="w-full cursor-pointer rounded px-3 py-2 text-left text-sm text-white/90 hover:bg-white/10"
            onClick={handleChangeCountry}
          >
            Change Country
          </button>
        </div>
      ) : null}
    </div>
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
  const selectedCity = hasCityContext ? getCityBySlug(countrySlug, citySlug) : undefined;
  const cityName = selectedCity?.name || (citySlug ? formatSlugLabel(citySlug) : "Lima");
  const countryName = selectedCity?.displayCountry || (countrySlug ? formatSlugLabel(countrySlug) : "Peru");
  const fallbackCountryCode = countrySlug
    ? cities.find((city) => city.country === countrySlug)?.countryCode
    : "pe";
  const countryCode = selectedCity?.countryCode || fallbackCountryCode;

  return (
    <div className="w-full overflow-hidden border-b border-black/10">
      <nav className="w-full bg-[#252629] px-6 py-1.5">
        <div className="flex w-full items-center justify-between gap-4">
          <LocationPill
            cityName={cityName}
            countryName={countryName}
            countryCode={countryCode}
          />
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
