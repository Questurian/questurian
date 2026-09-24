import { getBackendUrl } from '@/lib/api/api-config';

import { type ReportBoundary, buildErrorReport, createBrowserReporter } from './errorReport';

/**
 * What the error boundaries call. Production only: in development the error
 * overlay and the console already say everything, and a report would go to a
 * local API that does not need it.
 */

let send: ReturnType<typeof createBrowserReporter> | null = null;

export function reportBrowserError(error: unknown, boundary: ReportBoundary): void {
  if (process.env.NODE_ENV !== 'production' || typeof window === 'undefined') return;

  try {
    send ??= createBrowserReporter({ backendUrl: getBackendUrl() });
    send(
      buildErrorReport({
        source: 'browser',
        boundary,
        error,
        path: window.location.pathname,
        release: process.env.NEXT_PUBLIC_QUESTURA_RELEASE_SHA,
      }),
    );
  } catch {
    // Reporting must never be the second error on a page that already failed.
  }
}
