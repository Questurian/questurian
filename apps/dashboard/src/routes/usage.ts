import { Hono } from "hono";
import {
  MAX_EVENTS_PER_BATCH,
  USAGE_SCHEMA_VERSION,
  usageBatchSchema,
  describeValidationError,
} from "../usage/contract";
import {
  BadRequestError,
  parseBucket,
  parseFilter,
  parseGroupBy,
  parseLimit,
  parseMetric,
} from "../usage/params";
import { getUsageStore, type UsageStore } from "../usage/store";
import { groupableDimensions, seriesBuckets, seriesMetrics } from "../usage/types";
import { ratesPayload } from "../usage/rates";

/**
 * The API-usage collector's HTTP surface.
 *
 * Ingest is one POST; everything else reads. Nothing here proxies or forwards
 * a provider call -- this is an observer, and an app whose external calls
 * depended on it would be worse off than one with no monitoring at all.
 */

const INGEST_KEY_HEADER = "x-usage-key";
const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1", "localhost"]);

interface UsageRouteOptions {
  /** Injected by the tests; production uses the process-wide store. */
  store?: UsageStore;
}

/**
 * Who may write events.
 *
 * With `DASHBOARD_INGEST_KEY` set, the key decides and nothing else does.
 * Without it, only loopback callers are accepted, so the default posture on a
 * laptop is "my own apps may write" rather than "anything that can reach the
 * port may write".
 */
function ingestRefusal(
  key: string | undefined,
  clientAddress: string | undefined,
): string | null {
  const expected = process.env.DASHBOARD_INGEST_KEY;
  if (expected !== undefined && expected !== "") {
    return key === expected ? null : "invalid or missing x-usage-key";
  }
  if (clientAddress === undefined) return null;
  return LOOPBACK_ADDRESSES.has(clientAddress)
    ? null
    : "ingest without DASHBOARD_INGEST_KEY accepts loopback callers only";
}

/** Bun hands the server object to Hono as `env`; it knows the peer address. */
function clientAddress(env: unknown, request: Request): string | undefined {
  const server = env as { requestIP?: (request: Request) => { address: string } | null };
  if (typeof server?.requestIP !== "function") return undefined;
  try {
    return server.requestIP(request)?.address;
  } catch {
    return undefined;
  }
}

export function createUsageRoutes(options: UsageRouteOptions = {}): Hono {
  const usage = new Hono();
  const store = () => options.store ?? getUsageStore();

  usage.onError((error, c) => {
    if (error instanceof BadRequestError) {
      return c.json({ error: error.message }, 400);
    }
    console.error("[usage] request failed:", error);
    return c.json({ error: "internal error" }, 500);
  });

  usage.get("/v1", (c) =>
    c.json({
      schemaVersion: USAGE_SCHEMA_VERSION,
      maxEventsPerBatch: MAX_EVENTS_PER_BATCH,
      ingest: "POST /api/usage/v1/events",
      reads: ["summary", "series", "breakdown", "events", "facets"].map(
        (name) => `GET /api/usage/v1/${name}`,
      ),
      dimensions: groupableDimensions,
      buckets: seriesBuckets,
      metrics: seriesMetrics,
    }),
  );

  usage.post("/v1/events", async (c) => {
    const refusal = ingestRefusal(
      c.req.header(INGEST_KEY_HEADER),
      clientAddress(c.env, c.req.raw),
    );
    if (refusal !== null) return c.json({ error: refusal }, 401);

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "body must be JSON" }, 400);
    }

    const batch = usageBatchSchema.safeParse(body);
    if (!batch.success) {
      return c.json({ error: describeValidationError(batch.error) }, 400);
    }

    const result = store().ingest(batch.data.events);
    if (result.rejected > 0) {
      // Emitters are fire-and-forget by design, so a producer never sees this
      // response. If the reason is not in the collector's own log it is lost.
      console.warn(
        `[usage] rejected ${result.rejected} event(s):`,
        result.errors.map((entry) => `#${entry.index} ${entry.message}`).join("; "),
      );
    }
    return c.json(result, 202);
  });

  usage.get("/v1/summary", (c) => c.json(store().summary(parseFilter(readQuery(c)))));

  usage.get("/v1/series", (c) => {
    const query = readQuery(c);
    return c.json(
      store().series(parseFilter(query), {
        bucket: parseBucket(query),
        metric: parseMetric(query),
        groupBy: parseGroupBy(query),
        maxKeys: parseLimit(query, 8, 24),
      }),
    );
  });

  usage.get("/v1/breakdown", (c) => {
    const query = readQuery(c);
    const groupBy = parseGroupBy(query) ?? "provider";
    return c.json({ groupBy, rows: store().breakdown(parseFilter(query), groupBy) });
  });

  usage.get("/v1/events", (c) => {
    const query = readQuery(c);
    return c.json(
      store().events(parseFilter(query), {
        limit: parseLimit(query, 100, 1_000),
        cursor: query("cursor") ?? null,
      }),
    );
  });

  usage.get("/v1/facets", (c) => c.json(store().facets(parseFilter(readQuery(c)))));

  // The published rate card. Static, and deliberately not derived from stored
  // events: this answers "what are we being charged" where every other route
  // answers "what did we spend". A rate nobody has checked is a number that
  // looks like evidence, so each one carries the date it was verified and the
  // page it was verified against.
  usage.get("/v1/rates", (c) => c.json(ratesPayload()));

  return usage;
}

function readQuery(c: { req: { query: (key: string) => string | undefined } }) {
  return (key: string) => c.req.query(key);
}

export default createUsageRoutes();
