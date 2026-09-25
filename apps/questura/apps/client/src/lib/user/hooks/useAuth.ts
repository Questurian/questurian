/**
 * Convenience hook for auth state
 * Provides a clean API similar to the old authStore
 * but backed by React Query
 */

import { useSyncExternalStore } from 'react';

import { useUserQuery } from './useUserQuery';
import { User } from '../types';

const neverChanges = () => () => {};

/**
 * True only while React is hydrating server HTML (and on the server itself).
 *
 * The server never knows who is reading, so it renders every `useAuth`
 * consumer as "still loading". A Suspense boundary hydrates in its own pass,
 * and by then the navbar's `/api/me` may already have answered: `/account`
 * opened signed out then rendered `null` where the server had sent a spinner,
 * and React threw minified error #418 (hydration mismatch, launch fix plan
 * item 8). During hydration every consumer therefore sees the server's answer;
 * the real one follows in the next render. Components mounted after hydration
 * (client navigations) get the real answer at once.
 */
function useHydrating(): boolean {
  return useSyncExternalStore(neverChanges, () => false, () => true);
}

export function useAuth() {
  const { data: user, isLoading, isError, error } = useUserQuery();
  const hydrating = useHydrating();

  if (hydrating) {
    return { user: null, loading: true, isAuthenticated: false, isError: false, error: null };
  }

  return {
    user: (user ?? null) as User | null,
    loading: isLoading,
    isAuthenticated: !!user,
    isError,
    error,
  };
}
