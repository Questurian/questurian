import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

export function QueryProvider({ children }: { children: unknown }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children as any}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
