import type { Instrumentation } from 'next';

import { getBackendUrl } from './lib/api/api-config';
import { renderHeaders } from './lib/cache/public-cache';
import { buildErrorReport, pickRequestId, sendWorkerReport, workerLogLine } from './lib/observability/errorReport';

/**
 * A page, route handler or middleware threw while the Worker was rendering.
 *
 * One JSON line to the console, which Workers Logs keeps (wrangler.jsonc
 * `observability`), and, in production, one report to the API's beacon so it
 * reaches Sentry with the API's own errors (lib/observability/errorReport.ts
 * says why the Worker does not run Sentry itself). Both carry the request id:
 * the caller's `x-request-id`, or Cloudflare's `cf-ray`.
 *
 * OpenNext's Cloudflare build wires this file in
 * (`patches/plugins/instrumentation.js` in @opennextjs/cloudflare).
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  try {
    const report = buildErrorReport({
      source: 'worker',
      boundary: 'request',
      error,
      path: request.path,
      requestId: pickRequestId(request.headers),
      release: process.env.NEXT_PUBLIC_QUESTURA_RELEASE_SHA,
    });

    console.error(
      workerLogLine(report, { method: request.method, routePath: context.routePath, routeType: context.routeType }),
    );

    if (process.env.NODE_ENV === 'production') {
      // The Worker's own headers, so the report passes the front door (ADR-0016).
      await sendWorkerReport(report, { backendUrl: getBackendUrl(), headers: renderHeaders() });
    }
  } catch {
    // The request has already failed; reporting it must not fail it twice.
  }
};
