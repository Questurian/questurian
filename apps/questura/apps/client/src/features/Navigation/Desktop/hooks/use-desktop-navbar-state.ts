"use client";

import { usePathname, useParams } from "next/navigation";
import { useAuth } from "@/lib/user/hooks";
import { useLocationStore } from "@/lib/stores/locationStore";
import { getParamValue } from "../utils/desktop-navbar.utils";
import {
  resolveActiveMode,
  resolveLocationDisplay,
} from "../services/desktop-navbar-location.service";
import type { CityMode } from "../../components/SubNav";

export function useDesktopNavbarState() {
  const { user, loading, isAuthenticated } = useAuth();
  const params = useParams();
  const pathname = usePathname() ?? "";

  const shouldShowSubscribe =
    !isAuthenticated || user?.subscriptionStatus !== "active";
  const setCityMode = useLocationStore((state) => state.setCityMode);
  const lastVisited = useLocationStore((state) => state.lastVisited);

  const countrySlug = getParamValue(params?.country)?.toLowerCase();
  const citySlug = getParamValue(params?.city)?.toLowerCase();
  const modeSlugFromParams = getParamValue(params?.mode)?.toLowerCase();
  const hasCityContext = Boolean(countrySlug && citySlug);
  const fallbackLocation = !hasCityContext ? lastVisited : null;
  const activeCountrySlug = countrySlug ?? fallbackLocation?.country;
  const activeCitySlug = citySlug ?? fallbackLocation?.cityId;

  const pathnameSegments = pathname.split("/").filter(Boolean);
  const modeSlugFromPath = pathnameSegments[2]?.toLowerCase();
  const modeSlugFromFallback = !hasCityContext
    ? fallbackLocation?.mode?.toLowerCase()
    : undefined;

  const activeMode = resolveActiveMode(
    modeSlugFromParams,
    modeSlugFromPath,
    modeSlugFromFallback
  );

  const { cityName, countryName, countryCode } = resolveLocationDisplay(
    activeCountrySlug,
    activeCitySlug
  );

  const handleModeChange = (mode: CityMode) => {
    if (hasCityContext && countrySlug && citySlug) {
      setCityMode(citySlug, countrySlug, mode);
    }
  };

  return {
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
  };
}
