"use client";

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { routeConfig } from './config';
import { getSafeRedirectPath, isValidRedirectPath } from '@/lib/validations';

export interface UseProtectedRouteOptions {
  onLoginRequired?: (redirectPath: string) => void;
}

/**
 * Hook to handle login modal triggering from URL params
 * Used when protected pages redirect to home with showLogin param
 */
export function useProtectedRoute(options?: UseProtectedRouteOptions) {
  const searchParams = useSearchParams();
  const hasTriggeredRef = useRef(false);

  const showLogin = searchParams.get(routeConfig.showLoginParam) === 'true';
  const redirectParam = searchParams.get(routeConfig.redirectParam);
  const safeRedirectPath = getSafeRedirectPath(redirectParam);
  const redirectPath = redirectParam && isValidRedirectPath(safeRedirectPath) ? safeRedirectPath : null;

  useEffect(() => {
    if (showLogin && redirectPath && !hasTriggeredRef.current) {
      hasTriggeredRef.current = true;

      // Clean up URL params
      const url = new URL(window.location.href);
      url.searchParams.delete(routeConfig.showLoginParam);
      url.searchParams.delete(routeConfig.redirectParam);
      window.history.replaceState({}, '', url.toString());

      // Trigger login modal
      if (options?.onLoginRequired) {
        options.onLoginRequired(redirectPath);
      }
    }
  }, [showLogin, redirectPath, options]);

  return {
    showLogin,
    redirectPath,
  };
}
