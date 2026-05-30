/**
 * Convenience hook for auth state
 * Provides a clean API similar to the old authStore
 * but backed by React Query
 */

import { useEffect } from 'react';
import { useUserQuery } from './useUserQuery';
import { User } from '../types';

export function useAuth() {
  const { data: user, isLoading, isError, error } = useUserQuery();

  useEffect(() => {
    if (user) {
      console.log(
        `Current principal authenticated - Kind: ${user.kind}, Email: ${user.email}, Membership: ${user.membershipStatusSummary}`
      );
    } else if (!isLoading && !user) {
      console.log('No user authenticated');
    }
  }, [user, isLoading]);

  return {
    user: (user ?? null) as User | null,
    loading: isLoading,
    isAuthenticated: !!user,
    isError,
    error,
  };
}
