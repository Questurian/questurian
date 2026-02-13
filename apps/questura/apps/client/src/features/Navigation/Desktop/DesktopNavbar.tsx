"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronRight, ArrowLeft, Star } from "lucide-react";
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
import { useLocationStore } from "@/lib/stores/locationStore";

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

type DropdownView = "main" | "cities" | "countries" | "country-cities";

interface CountryInfo {
  slug: string;
  name: string;
  countryCode: string;
}

interface LocationPillProps {
  cityName: string;
  countryName: string;
  countryCode?: string;
  currentCityId?: string;
  currentCountry?: string;
  currentMode: string;
}

function LocationPill({ cityName, countryName, countryCode, currentCityId, currentCountry, currentMode }: LocationPillProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<DropdownView>("main");
  const [selectedCountry, setSelectedCountry] = useState<CountryInfo | null>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const locationLabel = `${cityName}, ${countryName}`;

  const favoriteCity = useLocationStore((state) => state.favoriteCity);
  const setFavoriteCity = useLocationStore((state) => state.setFavoriteCity);
  const clearFavoriteCity = useLocationStore((state) => state.clearFavoriteCity);

  const isCurrentCityFavorite =
    favoriteCity !== null &&
    favoriteCity.cityId === currentCityId &&
    favoriteCity.country === currentCountry;

  // Cities in the current country (excluding current city)
  const sameCountryCities = useMemo(
    () => cities.filter((c) => c.country === currentCountry && c.id !== currentCityId),
    [currentCountry, currentCityId]
  );

  // Unique countries derived from cities data
  const countries = useMemo(() => {
    const seen = new Map<string, CountryInfo>();
    for (const city of cities) {
      if (!seen.has(city.country)) {
        seen.set(city.country, { slug: city.country, name: city.displayCountry, countryCode: city.countryCode });
      }
    }
    return Array.from(seen.values());
  }, []);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setDropdownPos({ top: rect.bottom + 8, left: rect.left });
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        !triggerRef.current?.contains(target) &&
        !dropdownRef.current?.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    const handleScrollOrResize = () => updatePosition();

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [isOpen, updatePosition]);

  const handleToggle = () => {
    if (!isOpen) {
      updatePosition();
      setView("main");
      setSelectedCountry(null);
    }
    setIsOpen((prev) => !prev);
  };

  const handleToggleFavorite = () => {
    if (!currentCityId || !currentCountry) return;

    if (isCurrentCityFavorite) {
      clearFavoriteCity();
    } else {
      setFavoriteCity({ cityId: currentCityId, country: currentCountry, mode: currentMode });
    }
  };

  const handleCityClick = (city: typeof cities[number]) => {
    setIsOpen(false);
    router.push(`/${city.country}/${city.id}/${currentMode}`);
  };

  const handleCountryClick = (country: CountryInfo) => {
    const countryCities = cities.filter((c) => c.country === country.slug);
    if (countryCities.length === 1) {
      setIsOpen(false);
      router.push(`/${countryCities[0].country}/${countryCities[0].id}/${currentMode}`);
      return;
    }
    setSelectedCountry(country);
    setView("country-cities");
  };

  const renderFlagImg = (code: string, alt: string) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://flagcdn.com/w40/${code}.png`}
      srcSet={`https://flagcdn.com/w40/${code}.png 1x, https://flagcdn.com/w80/${code}.png 2x`}
      alt={alt}
      className="h-full w-full object-cover"
    />
  );

  const renderCityList = (cityList: typeof cities) => (
    <>
      {cityList.map((city) => {
        const isCurrent = city.id === currentCityId && city.country === currentCountry;
        const isFavorite = favoriteCity?.cityId === city.id && favoriteCity?.country === city.country;

        return (
          <button
            key={city.id}
            type="button"
            role="menuitem"
            className={`flex w-full items-center gap-2.5 rounded px-3 py-2 text-left text-sm transition-colors ${
              isCurrent
                ? "bg-white/10 text-white"
                : "text-white/75 hover:bg-white/10 hover:text-white"
            }`}
            onClick={() => handleCityClick(city)}
          >
            <span className="inline-flex h-3 w-4.5 shrink-0 overflow-hidden rounded-[2px] border border-white/25 bg-white/10">
              {renderFlagImg(city.countryCode, `${city.displayCountry} flag`)}
            </span>
            <span className="flex-1 truncate">{city.name}</span>
            {isFavorite ? (
              <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />
            ) : null}
          </button>
        );
      })}
    </>
  );

  const renderDropdownContent = () => {
    switch (view) {
      case "main":
        return (
          <>
            {currentCityId && currentCountry ? (
              <div className="border-b border-white/10 p-1.5">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-white/90 hover:bg-white/10"
                  onClick={handleToggleFavorite}
                >
                  <Star
                    className={`h-3.5 w-3.5 ${isCurrentCityFavorite ? "fill-amber-400 text-amber-400" : "text-white/50"}`}
                  />
                  {isCurrentCityFavorite ? "Remove as home city" : "Set as home city"}
                </button>
              </div>
            ) : null}

            <div className="p-1.5">
              {sameCountryCities.length > 0 ? (
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm text-white/90 hover:bg-white/10"
                  onClick={() => setView("cities")}
                >
                  Change City
                  <ChevronRight className="h-3.5 w-3.5 text-white/40" />
                </button>
              ) : null}
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm text-white/90 hover:bg-white/10"
                onClick={() => setView("countries")}
              >
                Change Country
                <ChevronRight className="h-3.5 w-3.5 text-white/40" />
              </button>
            </div>
          </>
        );

      case "cities":
        return (
          <>
            <div className="border-b border-white/10 p-1.5">
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs text-white/50 hover:bg-white/10 hover:text-white/80"
                onClick={() => setView("main")}
              >
                <ArrowLeft className="h-3 w-3" />
                Back
              </button>
            </div>
            <div className="p-1.5">
              {renderCityList(sameCountryCities)}
            </div>
          </>
        );

      case "countries":
        return (
          <>
            <div className="border-b border-white/10 p-1.5">
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs text-white/50 hover:bg-white/10 hover:text-white/80"
                onClick={() => setView("main")}
              >
                <ArrowLeft className="h-3 w-3" />
                Back
              </button>
            </div>
            <div className="p-1.5">
              {countries.map((country) => {
                const isCurrent = country.slug === currentCountry;

                return (
                  <button
                    key={country.slug}
                    type="button"
                    role="menuitem"
                    className={`flex w-full items-center gap-2.5 rounded px-3 py-2 text-left text-sm transition-colors ${
                      isCurrent
                        ? "bg-white/10 text-white"
                        : "text-white/75 hover:bg-white/10 hover:text-white"
                    }`}
                    onClick={() => handleCountryClick(country)}
                  >
                    <span className="inline-flex h-3 w-4.5 shrink-0 overflow-hidden rounded-[2px] border border-white/25 bg-white/10">
                      {renderFlagImg(country.countryCode, `${country.name} flag`)}
                    </span>
                    <span className="flex-1 truncate">{country.name}</span>
                    <ChevronRight className="h-3.5 w-3.5 text-white/40" />
                  </button>
                );
              })}
            </div>
          </>
        );

      case "country-cities": {
        const countryCities = cities.filter((c) => c.country === selectedCountry?.slug);
        return (
          <>
            <div className="border-b border-white/10 p-1.5">
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs text-white/50 hover:bg-white/10 hover:text-white/80"
                onClick={() => setView("countries")}
              >
                <ArrowLeft className="h-3 w-3" />
                {selectedCountry?.name}
              </button>
            </div>
            <div className="p-1.5">
              {renderCityList(countryCities)}
            </div>
          </>
        );
      }
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="inline-flex items-center gap-1.5 text-white/95 hover:text-white transition-colors"
        aria-label={`Current location: ${locationLabel}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={handleToggle}
      >
        <span className="inline-flex h-3 w-4.5 overflow-hidden rounded-[2px] border border-white/35 bg-white/10">
          {countryCode ? (
            <>{renderFlagImg(countryCode, `${countryName} flag`)}</>
          ) : (
            <span className="h-full w-full bg-white/30" />
          )}
        </span>
        <span className="text-[0.78rem] font-medium tracking-[0.02em]">{locationLabel}</span>
        <ChevronDown
          className={`h-3 w-3 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen
        ? createPortal(
            <div
              ref={dropdownRef}
              role="menu"
              className="fixed z-[9999] w-56 rounded-md border border-white/15 bg-[#2d2f33] shadow-lg"
              style={{ top: dropdownPos.top, left: dropdownPos.left }}
            >
              {renderDropdownContent()}
            </div>,
            document.body
          )
        : null}
    </>
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
            currentCityId={citySlug}
            currentCountry={countrySlug}
            currentMode={activeMode}
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
          <Link href={hasCityContext ? `/${countrySlug}/${citySlug}/${activeMode}` : "/"} className="cursor-pointer justify-self-center">
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
