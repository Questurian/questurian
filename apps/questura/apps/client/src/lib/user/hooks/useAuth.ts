/**
 * Convenience hook for auth state
 * Provides a clean API similar to the old authStore
 * but backed by React Query
 */

import { useUserQuery } from './useUserQuery';
import { User } from '../types';

export function useAuth() {
  const { data: user, isLoading, isError, error } = useUserQuery();

  return {
    user: (user ?? null) as User | null,
    loading: isLoading,
    isAuthenticated: !!user,
    isError,
    error,
  };
}
