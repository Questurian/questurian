/**
 * Helper utilities for creating queries and mutations
 * These wrappers integrate with our existing API utilities
 */

import { UseMutationOptions, UseQueryOptions } from '@tanstack/react-query';
import { get, post, put, del } from '@/lib/api';

/**
 * Type-safe query options helper
 */
export type QueryOptions<TData, TError = Error> = Omit<
  UseQueryOptions<TData, TError>,
  'queryKey' | 'queryFn'
>;

/**
 * Type-safe mutation options helper
 */
export type MutationOptions<TData, TVariables, TError = Error> = UseMutationOptions<
  TData,
  TError,
  TVariables
>;

/**
 * Create a GET query function
 */
export function createQueryFn<TData>(endpoint: string) {
  return (): Promise<TData> => get<TData>(endpoint);
}

/**
 * Create a POST mutation function
 */
export function createPostMutation<TData, TVariables = Record<string, unknown>>(
  endpoint: string
) {
  return (variables: TVariables): Promise<TData> => post<TData>(endpoint, variables as Record<string, unknown>);
}

/**
 * Create a PUT mutation function
 */
export function createPutMutation<TData, TVariables = Record<string, unknown>>(
  endpoint: string
) {
  return (variables: TVariables): Promise<TData> => put<TData>(endpoint, variables as Record<string, unknown>);
}

/**
 * Create a DELETE mutation function
 */
export function createDeleteMutation<TData>(endpoint: string) {
  return (): Promise<TData> => del<TData>(endpoint);
}

/**
 * Error handler for queries/mutations
 * Handles auth errors (401/403) specially
 */
export function handleQueryError(error: unknown): void {
  if (error instanceof Error) {
    const errorMessage = error.message.toLowerCase();

    // If it's an auth error, redirect to login
    // Cookie is automatically cleared by backend
    if (errorMessage.includes('401') || errorMessage.includes('403') ||
        errorMessage.includes('unauthorized') || errorMessage.includes('forbidden')) {
      console.log('Auth error detected');

      // Only redirect if not already on home page
      if (typeof window !== 'undefined' && window.location.pathname !== '/') {
        window.location.href = '/?showLogin=true';
      }
    }
  }
}
