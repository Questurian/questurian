import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import "./index.css";

/**
 * Polling, not sockets.
 *
 * The collector is a local process and the questions this UI asks are
 * aggregates over a window; a 10-second refetch is indistinguishable from live
 * for a human watching, and it keeps the server a plain request/response
 * surface that curl can also drive.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchInterval: 10_000,
      refetchOnWindowFocus: true,
      staleTime: 5_000,
      retry: 1,
    },
  },
});

const container = document.getElementById("root");
if (!container) throw new Error("missing #root");

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
