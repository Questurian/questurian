/**
 * How the website reports its errors: to the API's beacon, never to a vendor
 * directly.
 *
 * The API runs Sentry (launch fix plan, decision D1). The website is a
 * Cloudflare Worker built by OpenNext, where Sentry's Next.js SDK is
 * documented but has a history of production breakage (an AsyncLocalStorage
 * error in `onRequestError` took one Worker down, and a bundle-resolution
 * issue was closed unreproduced) and adds weight to a size-capped Worker. So,
 * as the plan's amendment allows, the website posts a small, redacted report
 * to `POST /api/client-errors`, and the API logs it and forwards it to Sentry.
 * Both apps then alert from one place. apps/questura/docs/procedures/sentry-setup.md.
 *
 * Pure: no framework imports, so node:test covers it without an install.
 *
 * What a report never carries: cookies, the query string, an email address, a
 * token. The browser sends it without credentials.
 */

export const CLIENT_ERRORS_PATH = '/api/client-errors';

export type ReportSource = 'browser' | 'worker';
export type ReportBoundary = 'global-error' | 'error' | 'request' | 'unhandled';

export type ErrorReport = {
  source: ReportSource;
  boundary: ReportBoundary;
  message: string;
  path?: string;
  digest?: string;
  requestId?: string;
  release?: string;
  stack?: string;
};

const RULES: Array<[RegExp, string]> = [
  [/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+(:[^\s/@]*)?@/gi, '$1[redacted]@'],
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]'],
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/g, '$1 [redacted]'],
  [/\b(sk|rk|pk)_(live|test)_[A-Za-z0-9]{8,}/g, '[redacted]'],
  [/\bwhsec_[A-Za-z0-9]{8,}/g, '[redacted]'],
  [/\b((?:__Secure-)?(?:better-auth|payload-token|questura)[A-Za-z0-9._-]*)=[^;\s]+/g, '$1=[redacted]'],
  // Query strings inside URLs in a message or stack: tokens travel there.
  [/(https?:\/\/[^\s?#]+)\?[^\s#)]*/gi, '$1'],
];

/** Same shapes the API's log redaction removes (server shared/observability/redact.ts). */
export function redactText(value: string): string {
  let out = value;
  for (const [pattern, replacement] of RULES) out = out.replace(pattern, replacement);
  return out;
}

function capped(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

/** A pathname only: never the query string or fragment. */
export function pathOnly(path: string | undefined | null): string | undefined {
  if (!path) return undefined;
  const cut = path.search(/[?#]/);
  const out = cut === -1 ? path : path.slice(0, cut);
  return out.startsWith('/') ? capped(out, 300) : undefined;
}

const ID = /^[A-Za-z0-9._:-]{8,128}$/;

type HeaderBag = Record<string, string | string[] | undefined> | Headers;

function header(headers: HeaderBag | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  const value =
    typeof (headers as Headers).get === 'function'
      ? (headers as Headers).get(name) ?? undefined
      : (headers as Record<string, string | string[] | undefined>)[name];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * The id that finds this request in the logs. `x-request-id` when a caller
 * sent one; otherwise Cloudflare's `cf-ray`, which Cloudflare also returns on
 * every response, so a reader can quote it from the browser.
 */
export function pickRequestId(headers: HeaderBag | undefined): string | undefined {
  for (const name of ['x-request-id', 'cf-ray']) {
    const value = header(headers, name)?.trim();
    if (value && ID.test(value)) return value;
  }
  return undefined;
}

export function buildErrorReport(input: {
  source: ReportSource;
  boundary: ReportBoundary;
  error: unknown;
  path?: string | null;
  requestId?: string;
  release?: string;
}): ErrorReport {
  const error = input.error as { message?: unknown; stack?: unknown; digest?: unknown } | null | undefined;
  const rawMessage =
    typeof error?.message === 'string' && error.message.trim() ? error.message : String(input.error ?? 'Unknown error');

  const report: ErrorReport = {
    source: input.source,
    boundary: input.boundary,
    message: capped(redactText(rawMessage.trim()), 500) || 'Unknown error',
  };

  const path = pathOnly(input.path);
  if (path) report.path = path;
  if (typeof error?.digest === 'string' && /^[A-Za-z0-9._-]{1,64}$/.test(error.digest)) report.digest = error.digest;
  if (input.requestId && ID.test(input.requestId)) report.requestId = input.requestId;
  if (input.release && /^[A-Za-z0-9._-]{1,64}$/.test(input.release)) report.release = input.release;
  if (typeof error?.stack === 'string' && error.stack) report.stack = capped(redactText(error.stack), 4000);

  return report;
}

export function reportUrl(backendUrl: string): string {
  return `${backendUrl.replace(/\/+$/, '')}${CLIENT_ERRORS_PATH}`;
}

/** At most this many reports per page load: an error boundary can re-render in a loop. */
export const MAX_BROWSER_REPORTS = 5;

type FetchLike = (url: string, init: Record<string, unknown>) => Promise<unknown>;

/**
 * From the browser. `text/plain` keeps it a simple request (no preflight),
 * `keepalive` lets it finish while the page unloads, and `credentials: omit`
 * keeps the reader's cookies out of it. Never throws.
 */
export function createBrowserReporter(options: { backendUrl: string; fetch?: FetchLike; max?: number }) {
  const seen = new Set<string>();
  let sent = 0;
  const max = options.max ?? MAX_BROWSER_REPORTS;

  return function send(report: ErrorReport): boolean {
    const key = `${report.boundary}|${report.digest ?? ''}|${report.message}`;
    if (seen.has(key) || sent >= max) return false;
    seen.add(key);
    sent += 1;

    try {
      const doFetch = options.fetch ?? (globalThis.fetch as unknown as FetchLike | undefined);
      if (!doFetch) return false;
      void Promise.resolve(
        doFetch(reportUrl(options.backendUrl), {
          method: 'POST',
          body: JSON.stringify(report),
          headers: { 'content-type': 'text/plain;charset=UTF-8' },
          credentials: 'omit',
          keepalive: true,
          mode: 'cors',
        }),
      ).catch(() => {});
      return true;
    } catch {
      return false;
    }
  };
}

/**
 * From the Worker, inside `onRequestError`. Bounded by a timeout so a slow
 * API never holds a failing request open. Never throws.
 */
export async function sendWorkerReport(
  report: ErrorReport,
  options: { backendUrl: string; fetch?: FetchLike; timeoutMs?: number },
): Promise<boolean> {
  const doFetch = options.fetch ?? (globalThis.fetch as unknown as FetchLike | undefined);
  if (!doFetch) return false;

  const controller = typeof AbortController === 'function' ? new AbortController() : undefined;
  const timer = setTimeout(() => controller?.abort(), options.timeoutMs ?? 2000);
  try {
    await doFetch(reportUrl(options.backendUrl), {
      method: 'POST',
      body: JSON.stringify(report),
      headers: { 'content-type': 'application/json' },
      signal: controller?.signal,
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The Worker's log line for a failed request: one JSON object, which Workers
 * Logs indexes by field. Same redaction as the report.
 */
export function workerLogLine(report: ErrorReport, extra: { method?: string; routePath?: string; routeType?: string }) {
  const { message: errorMessage, ...fields } = report;
  return JSON.stringify({
    level: 'error',
    message: 'Request failed',
    timestamp: new Date().toISOString(),
    ...fields,
    errorMessage,
    method: extra.method,
    routePath: extra.routePath,
    routeType: extra.routeType,
  });
}
