import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { APIError, get, isServiceUnavailableError, post } from '@/lib/api';
import { queryKeys } from '@/lib/react-query';
import type { CurrentPrincipalResponse, User } from '@/lib/user/types';

function principalToUser(response: CurrentPrincipalResponse): User | null {
  if (!response.authenticated || !response.principal) return null;

  const principal = response.principal;

  return {
    ...principal,
    membershipStatusSummary: principal.membership.active ? 'active' : principal.membership.status,
    subscriptionStatus: principal.membership.status,
    membershipExpiration: principal.membership.expiresAt,
    cancelAtPeriodEnd: principal.membership.cancelAtPeriodEnd,
  };
}

async function getCurrentUser(): Promise<User | null> {
  const response = await get<CurrentPrincipalResponse>('/api/me');
  return principalToUser(response);
}

export function useUserQuery() {
  const query = useQuery({
    queryKey: queryKeys.userMe(),
    queryFn: async (): Promise<User | null> => {
      try {
        return await getCurrentUser();
      } catch (error) {
        if (error instanceof APIError && (error.status === 401 || error.status === 403)) {
          return null;
        }

        throw error;
      }
    },
    retry: (failureCount, error) => {
      if (error instanceof APIError && error.status >= 400 && error.status < 500) {
        return false;
      }
      return failureCount < 3;
    },
    staleTime: 2 * 60 * 1000,
    refetchOnMount: (query) => query.isStale(),
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });

  const { isError, refetch } = query;

  useEffect(() => {
    const handleWindowFocus = () => {
      if (isError) {
        refetch();
      }
    };

    window.addEventListener('focus', handleWindowFocus);
    return () => window.removeEventListener('focus', handleWindowFocus);
  }, [isError, refetch]);

  return query;
}

interface LoginVariables {
  email: string;
  password: string;
}

interface LoginResponse {
  user: User;
}

export function useLoginMutation() {
  return useMutation({
    mutationFn: async (variables: LoginVariables): Promise<LoginResponse> => {
      try {
        await post('/api/visitor-auth/sign-in/email', {
          email: variables.email,
          password: variables.password,
        });
        const user = await getCurrentUser();
        if (!user) throw new Error('Sign in succeeded but no session was returned.');
        return { user };
      } catch (error) {
        if (isServiceUnavailableError(error)) {
          throw new Error('Service is unavailable. Please try again later.');
        }
        throw error;
      }
    },
  });
}

export function useLogoutMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      try {
        await post('/api/visitor-auth/sign-out', {});
      } catch (error) {
        if (isServiceUnavailableError(error)) {
          console.warn('[LOGOUT] Service unavailable during logout, proceeding with local cleanup');
        } else {
          console.warn('[LOGOUT] Logout request failed, proceeding with local cleanup:', error);
        }
      }
    },
    onSettled: () => {
      queryClient.clear();
      window.location.href = '/';
    },
  });
}

interface SignupVariables {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

interface SignupResponse {
  message?: string;
  user?: User;
}

export function useSignupMutation() {
  return useMutation({
    mutationFn: async (variables: SignupVariables): Promise<SignupResponse> => {
      try {
        const name = [variables.firstName, variables.lastName].filter(Boolean).join(' ');
        const callbackURL = new URL('/', window.location.origin).toString();
        await post('/api/visitor-auth/sign-up/email', {
          email: variables.email,
          password: variables.password,
          name,
          callbackURL,
        });
        const user = await getCurrentUser();
        return {
          message: 'Account created. Check your email to verify before checkout or paid access.',
          user: user ?? undefined,
        };
      } catch (error) {
        if (isServiceUnavailableError(error)) {
          throw new Error('Service is unavailable. Please try again later.');
        }
        throw error;
      }
    },
  });
}
