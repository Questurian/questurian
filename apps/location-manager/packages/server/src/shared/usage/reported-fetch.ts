/**
 * Report every outside call this server makes, without asking it to remember.
 *
 * This server calls eleven external services -- Google Places, Maps and
 * geocoding, SerpAPI, TripAdvisor, Viator, Foursquare, Geoapify, BigDataCloud,
 * Instagram through RapidAPI, and Unsplash -- through eleven separate client
 * classes, each with its own `fetch`. None of them reported anything, so none
 * of it appeared on the usage dashboard.
 *
 * The obvious fix is to wire reporting into each client. That is exactly how
 * ai-blog-writer ended up reporting five call paths out of thirty-nine: per
 * call site means the sites nobody remembers report nothing, and nobody can
 * tell the difference between a service that is quiet and a service that is
 * unwatched.
 *
 * So this wraps `fetch` once, at startup. Every client keeps calling `fetch`
 * exactly as it does today and a new client is covered the moment it is
 * written, including one added by someone who has never read this file.
 *
 * What it deliberately does not do
 * --------------------------------
 * * It reports **no cost and no tokens.** These are billed per request or per
 *   field group, not per token, and the bill only exists in each provider's
 *   own console. A confident zero would be worse than an obvious gap; the
 *   dashboard already knows these providers are unpriceable.
 * * It ignores anything not on the map below -- localhost, the Payload CMS,
 *   the alt-text service. Those are our own processes, and the alt-text
 *   service reports its own calls with far more detail than a URL can carry.
 * * It never changes, delays or fails a request. Every failure inside here is
 *   swallowed, for the same reason the Python emitter swallows its own: an
 *   observability bug must not become an outage.
 */

const COLLECTOR_URL =
  process.env.USAGE_MONITOR_URL?.trim() ||
  "http://localhost:4500/api/usage/v1/events";

const SERVICE = process.env.USAGE_MONITOR_SERVICE?.trim() || "lm-server";

const INGEST_KEY = process.env.USAGE_MONITOR_KEY?.trim();

/**
 * Which provider a hostname belongs to.
 *
 * Named rather than derived, so a host this server starts calling tomorrow is
 * reported as `unknown` and shows up as a gap to be named, rather than being
 * silently folded into whatever a URL happened to look like.
 */
const PROVIDER_BY_HOST: ReadonlyArray<readonly [RegExp, string]> = [
  [/(^|\.)places\.googleapis\.com$/, "google-places"],
  [/(^|\.)maps\.googleapis\.com$/, "google-maps"],
  [/(^|\.)serpapi\.com$/, "serpapi"],
  [/(^|\.)tripadvisor\.com$/, "tripadvisor"],
  [/(^|\.)viator\.com$/, "viator"],
  [/(^|\.)api\.foursquare\.com$/, "foursquare"],
  [/(^|\.)api\.geoapify\.com$/, "geoapify"],
  [/(^|\.)api\.bigdatacloud\.net$/, "bigdatacloud"],
  [/(^|\.)instagram\.com$/, "instagram"],
  [/rapidapi\.com$/, "rapidapi-instagram"],
  [/(^|\.)unsplash\.com$/, "unsplash"],
];

function providerFor(host: string): string | null {
  for (const [pattern, provider] of PROVIDER_BY_HOST) {
    if (pattern.test(host)) return provider;
  }
  return null;
}

/** A failure kind, in the vocabulary the collector already uses. */
function errorKindFor(status: number): string | undefined {
  if (status === 429) return "quota_exhausted";
  if (status === 401 || status === 403) return "not_connected";
  if (status >= 500) return "provider_unavailable";
  if (status >= 400) return "invalid_response";
  return undefined;
}

interface UsageEvent {
  eventId: string;
  ts: number;
  service: string;
  provider: string;
  status: "ok" | "error";
  durationMs: number;
  endpoint?: string;
  httpStatus?: number;
  errorKind?: string;
  errorMessage?: string;
}

function send(event: UsageEvent): void {
  // Fire and forget. The collector being down, slow or absent changes nothing
  // about the call it is describing.
  void fetch(COLLECTOR_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(INGEST_KEY ? { "x-usage-key": INGEST_KEY } : {}),
    },
    body: JSON.stringify({ events: [event] }),
    signal: AbortSignal.timeout(2000),
  }).catch(() => {
    // Deliberately silent. A collector that is unreachable is the normal case
    // on a machine running only this app, and a log line per call would be
    // noise that hides real problems.
  });
}

let installed = false;

/**
 * Wrap the global `fetch` so outside calls report themselves. Idempotent.
 */
export function installUsageReporting(): void {
  if (installed) return;
  installed = true;

  const original = globalThis.fetch;

  globalThis.fetch = async function reportedFetch(
    input: Parameters<typeof original>[0],
    init?: Parameters<typeof original>[1],
  ): ReturnType<typeof original> {
    let provider: string | null = null;
    let endpoint: string | undefined;

    // Reading the URL must never be the thing that breaks a request, so a
    // shape this does not understand is simply not reported.
    try {
      const raw =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : (input as Request).url;
      const url = new URL(raw);
      provider = providerFor(url.hostname);
      endpoint = `${url.hostname}${url.pathname}`;
    } catch {
      provider = null;
    }

    if (provider === null) return original(input, init);

    const startedAt = Date.now();
    try {
      const response = await original(input, init);
      send({
        eventId: crypto.randomUUID(),
        ts: startedAt,
        service: SERVICE,
        provider,
        status: response.ok ? "ok" : "error",
        durationMs: Date.now() - startedAt,
        endpoint,
        httpStatus: response.status,
        ...(response.ok ? {} : { errorKind: errorKindFor(response.status) }),
      });
      return response;
    } catch (error) {
      // A call that threw still happened and still took time. Recording it is
      // what makes the failure rate on the dashboard real rather than a count
      // of the failures somebody remembered to log.
      send({
        eventId: crypto.randomUUID(),
        ts: startedAt,
        service: SERVICE,
        provider,
        status: "error",
        durationMs: Date.now() - startedAt,
        endpoint,
        errorKind: "provider_unavailable",
        errorMessage:
          error instanceof Error ? error.message.slice(0, 1000) : "fetch failed",
      });
      throw error;
    }
  } as typeof original;
}

/** Exposed for the tests; not part of the runtime surface. */
export const __internals = { providerFor, errorKindFor };
