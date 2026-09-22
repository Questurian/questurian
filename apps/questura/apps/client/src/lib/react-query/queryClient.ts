/**
 * React Query client configuration
 * Provides global defaults for queries and mutations
 */

import { QueryClient } from '@tanstack/react-query';

import { retryDecision } from '@/lib/api/request-policy';

/**
 * Note: The default queryFn that previously called user/me has been removed.
 * Each query hook now provides its own queryFn via useQuery().
 * This provides better flexibility and clearer separation of concerns.
 */

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Consider data fresh for 2 minutes
      staleTime: 2 * 60 * 1000,
      // Keep unused data in cache for 5 minutes
      gcTime: 5 * 60 * 1000,
      // Don't refetch on every window focus - implement smarter strategy in hooks
      refetchOnWindowFocus: false,
      // Refetch when network reconnects
      refetchOnReconnect: true,
      // One policy for every read (`lib/api/request-policy.ts`): at most three
      // attempts, full-jitter backoff so readers who failed together do not
      // return together, a valid Retry-After honoured, and no retry of 4xx
      // (other than 408/429), challenge pages or cancellations. Classified by
      // status and category, not by whether a message contains "401".
      retry: (failureCount, error) => retryDecision(error, failureCount + 1, 0).retry,
      retryDelay: (failureCount, error) => {
        const decision = retryDecision(error, failureCount + 1, 0);
        return decision.retry ? decision.delayMs : 0;
      },
    },
    mutations: {
      // Don't retry failed mutations - auth should fail fast
      retry: 0,
      // No retry delay for mutations (fail fast)
      retryDelay: 0,
    },
  },
});
