"use client";

/**
 * React Query Provider Component
 * Wraps the app with QueryClientProvider and DevTools
 */

import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { queryClient } from '@/lib/react-query';
import type { JSX } from 'react';

interface QueryProviderProps {
  children: unknown;
}

export function QueryProvider({ children }: QueryProviderProps) {
  const TypedQueryClientProvider = QueryClientProvider as unknown as (props: {
    client: typeof queryClient;
    children: unknown;
  }) => JSX.Element;

  return (
    <TypedQueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools initialIsOpen={false} position="bottom" />
      )}
    </TypedQueryClientProvider>
  );
}
