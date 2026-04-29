"use client";

import { useParams } from "next/navigation";
import { useAuth } from "@/lib/user/hooks";
import { getParamValue } from "../utils/desktop-navbar.utils";

export function useDesktopNavbarState() {
  const { user, loading, isAuthenticated } = useAuth();
  const params = useParams();
  const shouldShowSubscribe =
    !isAuthenticated || user?.subscriptionStatus !== "active";

  const countrySlug = getParamValue(params?.country)?.toLowerCase();
  const citySlug = getParamValue(params?.city)?.toLowerCase();
  const hasCityContext = Boolean(countrySlug && citySlug);

  return {
    loading,
    isAuthenticated,
    shouldShowSubscribe,
    hasCityContext,
    countrySlug,
    citySlug,
  };
}
