import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { isServiceUnavailableError, isUnauthenticated, post, retryDecision } from '@/lib/api';
import { queryKeys } from '@/lib/react-query';
import { identityStore, takeIdentityMaxAgeMs } from '@/lib/user/currentIdentity';
import { IdentitySuperseded } from '@/lib/user/identity';
import { writeHint } from '@/lib/user/identityHint';
import type { CurrentPrincipalResponse, User } from '@/lib/user/types';

function principalToUser(response: CurrentPrincipalResponse): User | null {
  if (!response.authenticated || !response.principal) return null;

  const principal = response.principal;
  const { cancelAtPeriodEnd, expiresAt } = principal.membership;

  return {
    ...principal,
    membershipStatusSummary: principal.membership.active ? 'active' : principal.membership.status,
    subscriptionStatus: principal.membership.status,
    // One server value, two meanings, resolved here: the paid-through date is
    // when access ends if the subscription is cancelling, and when the next
    // charge falls due if it is not.
    membershipExpiration: cancelAtPeriodEnd ? expiresAt : null,
    subscriptionRenewsAt: cancelAtPeriodEnd ? null : expiresAt,
    dunningGraceUntil: principal.membership.graceUntil,
    billingInterval: principal.membership.interval ?? null,
    cancelAtPeriodEnd,
  };
}

/**
 * Through the shared identity store: a lookup already in flight (the gated
 * body asking at the same moment, or `primeIdentity` from the navbar chunk) is
 * joined, not repeated. `maxAgeMs` is small — React Query's own `staleTime`
 * decides when the navbar re-asks — except for the first lookup after a
 * prime, which may reuse the primed answer on a slow hydration.
 */
async function getCurrentUser(options: { maxAgeMs?: number } = {}): Promise<User | null> {
  const response = await identityStore.read({ maxAgeMs: options.maxAgeMs ?? takeIdentityMaxAgeMs(1_000) });
  return principalToUser(response as unknown as CurrentPrincipalResponse);
}

/** After sign-in or sign-up: forget the previous reader, then ask fresh. */
async function getUserAfterSessionChange(): Promise<User | null> {
  identityStore.invalidate();
  return getCurrentUser({ maxAgeMs: 0 });
}

export function useUserQuery() {
  const query = useQuery({
    queryKey: queryKeys.userMe(),
    queryFn: async (): Promise<User | null> => {
      try {
        return await getCurrentUser();
      } catch (error) {
        // Only an explicit 401 means "no session". A 403 challenge page, a
        // 429 or a 503 means the question was not answered — the query stays
        // in error rather than showing a signed-in reader as signed out.
        if (isUnauthenticated(error)) {
          writeHint('anon');
          return null;
        }
        throw error;
      }
    },
    // Finite, jittered, and Retry-After aware (`request-policy.ts`). The
    // reader changing mid-lookup is not a failure: ask again at once.
    retry: (failureCount, error) =>
      error instanceof IdentitySuperseded || retryDecision(error, failureCount + 1, 0).retry,
    retryDelay: (failureCount, error) => {
      if (error instanceof IdentitySuperseded) return 0;
      const decision = retryDecision(error, failureCount + 1, 0);
      return decision.retry ? decision.delayMs : 0;
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
        const user = await getUserAfterSessionChange();
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

/**
 * Sign out of every device, this browser included: every session of the
 * reader ends on the server (`revoke-sessions`), and the other devices are
 * refused within about a second (`session-revocations.ts` on the server).
 * Unlike a plain sign-out, a failure is reported rather than papered over:
 * the reader asked for the other devices to be signed out, and cleaning up
 * this browser alone would claim that happened.
 */
export function useSignOutEverywhereMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      try {
        await post('/api/visitor-auth/revoke-sessions', {});
      } catch (error) {
        // This session had already ended elsewhere: nothing left to sign out.
        if (isUnauthenticated(error)) return;
        if (isServiceUnavailableError(error)) {
          throw new Error('Service is unavailable. Please try again later.');
        }
        throw error;
      }
    },
    onSuccess: () => {
      writeHint('anon');
      identityStore.invalidate();
      queryClient.clear();
      window.location.href = '/';
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
      writeHint('anon');
      identityStore.invalidate();
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
        const user = await getUserAfterSessionChange();
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
