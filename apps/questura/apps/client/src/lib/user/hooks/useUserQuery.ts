/**
 * User query hooks using React Query
 * Core authentication queries and mutations used app-wide
 */

import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query';
import { User } from "@/lib/user/types";
import { get, post, isServiceUnavailableError, APIError } from '@/lib/api';

/**
 * Query the current authenticated user
 * Uses smart refetch strategy:
 * - Data is considered fresh for 2 minutes (no refetch)
 * - If previous request failed, refetch on window focus to detect recovery
 * - Data refetches on network reconnect
 * - Component mount respects stale time (no aggressive invalidation)
 */
export function useUserQuery() {
  const query = useQuery({
    queryKey: queryKeys.userMe(),
    queryFn: async (): Promise<User | null> => {
      try {
        const response = await get<{ authenticated: boolean; user: User | null }>('/api/user/me');
        console.log('[useUserQuery] Successfully fetched user:', response?.user?.email);
        return response?.user ?? null;
      } catch (error) {
        // Handle auth errors (401/403) - not a retriable condition, user just isn't logged in
        if (error instanceof APIError && (error.status === 401 || error.status === 403)) {
          console.log('[useUserQuery] Auth invalid - user is not logged in');
          return null;
        }

        // Re-throw other errors to trigger retry
        throw error;
      }
    },
    // Don't retry on auth errors (401/403) or other 4xx errors - they're not transient
    retry: (failureCount, error) => {
      if (error instanceof APIError) {
        // Don't retry 4xx errors (client errors) - these won't succeed on retry
        // Only retry 5xx errors (server errors) which might be transient
        if (error.status >= 400 && error.status < 500) {
          return false;
        }
      }
      return failureCount < 3;
    },
    // Consider data fresh for 2 minutes
    staleTime: 2 * 60 * 1000,
    // Only refetch stale data on mount (don't invalidate fresh data)
    refetchOnMount: (query) => query.isStale(),
    // Don't refetch on window focus (handled by smart logic below)
    refetchOnWindowFocus: false,
    // Refetch on reconnect to detect if backend is back online
    refetchOnReconnect: true,
  });

  // Smart window focus refetch: only refetch if previous request failed
  // This handles backend recovery without constant unnecessary API calls
  useEffect(() => {
    const handleWindowFocus = () => {
      // Only refetch if the query is in an error state
      // This detects when backend comes back online after being down
      if (query.isError) {
        query.refetch();
      }
    };

    window.addEventListener('focus', handleWindowFocus);
    return () => {
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [query.refetch, query.isError]);

  return query;
}

/**
 * Login mutation
 */
interface LoginVariables {
  email: string;
  password: string;
}

interface LoginResponse {
  user: User;
}

export function useLoginMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variables: LoginVariables): Promise<LoginResponse> => {
      try {
        return post<LoginResponse>('/api/auth/login', {
          email: variables.email,
          password: variables.password,
        });
      } catch (error) {
        // Check if it's a service unavailability error
        if (isServiceUnavailableError(error)) {
          throw new Error('Service is unavailable. Please try again later.');
        }

        // Re-throw other errors
        throw error;
      }
    },
    // Don't invalidate here - let useAuthSubmit handle it with proper timing
    // This prevents premature refetch before cookies are set
  });
}

/**
 * Logout mutation
 */
export function useLogoutMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      try {
        await post('/api/auth/logout', {});
      } catch (error) {
        // Check if it's a service unavailability error but proceed with cleanup anyway
        if (isServiceUnavailableError(error)) {
          console.warn('[LOGOUT] Service unavailable during logout, proceeding with local cleanup');
        } else {
          console.warn('[LOGOUT] Logout request failed, proceeding with local cleanup:', error);
        }
        // Don't re-throw - proceed with cleanup
      }
    },
    onSettled: () => {
      // Clear all queries to remove cached user data
      queryClient.clear();

      // Force full page reload to ensure clean state
      window.location.href = '/';
    },
  });
}

/**
 * Signup mutation
 */
interface SignupVariables {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

interface SignupResponse {
  requiresVerification?: boolean;
  message?: string;
  user?: User;
}

export function useSignupMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variables: SignupVariables): Promise<SignupResponse> => {
      try {
        return post<SignupResponse>('/api/auth/signup', {
          email: variables.email,
          password: variables.password,
          firstName: variables.firstName,
          lastName: variables.lastName,
        });
      } catch (error) {
        // Check if it's a service unavailability error
        if (isServiceUnavailableError(error)) {
          throw new Error('Service is unavailable. Please try again later.');
        }

        // Re-throw other errors
        throw error;
      }
    },
    // Don't invalidate here - let useAuthSubmit handle it with proper timing
    // This prevents premature refetch before cookies are set
  });
}
