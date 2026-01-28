/**
 * React Query client configuration
 * Provides global defaults for queries and mutations
 */

import { QueryClient } from '@tanstack/react-query';

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
      // Retry failed requests up to 3 times
      retry: (failureCount, error) => {
        // Don't retry on auth errors (401/403)
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('401') || errorMessage.includes('403')) {
          return false;
        }
        // Retry up to 3 times for other errors
        return failureCount < 3;
      },
      // Exponential backoff for retries
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
    mutations: {
      // Don't retry failed mutations - auth should fail fast
      retry: 0,
      // No retry delay for mutations (fail fast)
      retryDelay: 0,
    },
  },
});

/**
 * Create a new QueryClient instance
 * Useful for testing or creating isolated client instances
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: queryClient.getDefaultOptions(),
  });
}
