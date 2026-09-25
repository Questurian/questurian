/**
 * Real readers' page speed, to the API's beacon (launch fix plan item 13).
 *
 * Next's built-in `useReportWebVitals` (no extra dependency) hands each metric
 * to `createVitalsBatcher`, which keeps the latest value per metric and posts
 * one small batch to `POST /api/web-vitals` when the page is hidden, the
 * moment LCP, INP and CLS are final. The API writes each batch as one log
 * line. Same transport as the error beacon (`errorReport.ts`): `text/plain`
 * so there is no preflight, `keepalive` so it survives the page closing, and
 * no cookies.
 *
 * Pure: no framework imports, so node:test covers it without an install.
 */

export const WEB_VITALS_PATH = '/api/web-vitals';

/** What the API accepts. Next also reports FID (retired by Google) and its own timings; they are dropped. */
export const REPORTED_VITALS = ['LCP', 'INP', 'CLS', 'FCP', 'TTFB'] as const;

/** At most this many batches per page load: a page hidden and shown over and over is not new data. */
export const MAX_VITALS_BATCHES = 3;

export type VitalMetric = {
  name: string;
  value: number;
  rating?: string;
  navigationType?: string;
};

export type VitalsBatch = {
  path: string;
  navigationType?: string;
  release?: string;
  metrics: Array<{ name: string; value: number; rating?: string }>;
};

type FetchLike = (url: string, init: Record<string, unknown>) => Promise<unknown>;

const REPORTED = new Set<string>(REPORTED_VITALS);

/** A pathname only: never the query string or fragment. */
function pathnameOf(path: string): string | undefined {
  const cut = path.search(/[?#]/);
  const out = cut === -1 ? path : path.slice(0, cut);
  return out.startsWith('/') && !out.startsWith('//') && out.length <= 300 ? out : undefined;
}

export function vitalsUrl(backendUrl: string): string {
  return `${backendUrl.replace(/\/+$/, '')}${WEB_VITALS_PATH}`;
}

/**
 * One batcher per page load. `path` is the page the reader landed on: the
 * metrics describe that load, even if they are sent after a client-side
 * navigation.
 */
export function createVitalsBatcher(options: {
  backendUrl: string;
  path: string;
  release?: string;
  fetch?: FetchLike;
}) {
  const path = pathnameOf(options.path);
  const pending = new Map<string, { name: string; value: number; rating?: string }>();
  let navigationType: string | undefined;
  let batches = 0;

  return {
    add(metric: VitalMetric): void {
      if (!REPORTED.has(metric.name) || typeof metric.value !== 'number' || !Number.isFinite(metric.value) || metric.value < 0) return;
      pending.set(metric.name, {
        name: metric.name,
        value: metric.value,
        ...(metric.rating ? { rating: metric.rating } : {}),
      });
      navigationType ??= metric.navigationType;
    },

    /** Sends what is pending, if anything. Never throws. */
    flush(): boolean {
      if (!path || pending.size === 0 || batches >= MAX_VITALS_BATCHES) return false;
      const batch: VitalsBatch = { path, metrics: [...pending.values()] };
      if (navigationType) batch.navigationType = navigationType;
      if (options.release && /^[A-Za-z0-9._-]{1,64}$/.test(options.release)) batch.release = options.release;
      pending.clear();
      batches += 1;

      try {
        const doFetch = options.fetch ?? (globalThis.fetch as unknown as FetchLike | undefined);
        if (!doFetch) return false;
        void Promise.resolve(
          doFetch(vitalsUrl(options.backendUrl), {
            method: 'POST',
            body: JSON.stringify(batch),
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
    },
  };
}
