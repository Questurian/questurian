"use client";

import { useParams } from "next/navigation";
import { useAuth } from "@/lib/user/hooks";
import { useMembership } from "@/features/Payments/hooks/useMembership";
import { getParamValue } from "../utils/desktop-navbar.utils";

export function useDesktopNavbarState() {
  const { user, loading, isAuthenticated } = useAuth();
  const params = useParams();
  const { isActive } = useMembership(user);
  const shouldShowSubscribe = !isAuthenticated || !isActive;

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
