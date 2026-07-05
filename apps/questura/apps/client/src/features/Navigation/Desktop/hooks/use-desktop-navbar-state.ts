"use client";

import { useAuth } from "@/lib/user/hooks";
import { useMembership } from "@/features/Payments/hooks/useMembership";

export function useDesktopNavbarState() {
  const { user, loading, isAuthenticated } = useAuth();
  const { isActive } = useMembership(user);
  const shouldShowSubscribe = !isAuthenticated || !isActive;

  return {
    loading,
    isAuthenticated,
    isActive,
    shouldShowSubscribe,
  };
}
