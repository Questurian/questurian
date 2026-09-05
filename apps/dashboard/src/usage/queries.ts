import type { Database } from "bun:sqlite";
import type { CostBasis, UsageStatus } from "./contract";
import type {
  GroupableDimension,
  SeriesBucket,
  SeriesMetric,
  UsageBreakdownRow,
  UsageEventPage,
  UsageEventRow,
  UsageFacets,
  UsageFilter,
  UsageSeries,
  UsageSummary,
} from "./types";

/**
 * Every read query lives here, as SQL.
 *
 * Aggregates are computed by SQLite, never in JavaScript: at a few thousand
 * events a day the difference is invisible, but pulling rows into JS to sum
 * them is the decision that stops working first, and it is easy to avoid now.
 */

const BUCKET_MS: Record<SeriesBucket, number> = {
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
};

/** Whitelist. A dimension name never reaches SQL as caller-supplied text. */
const DIMENSION_COLUMN: Record<GroupableDimension, string> = {
  provider: "provider",
  service: "service",
  feature: "feature",
  model: "model",
};

interface Where {
  clause: string;
  params: Record<string, string | number>;
}

function buildWhere(filter: UsageFilter): Where {
  const conditions: string[] = [];
  const params: Record<string, string | number> = {};

  if (filter.from !== undefined) {
    conditions.push("ts >= $from");
    params.$from = filter.from;
  }
  if (filter.to !== undefined) {
    conditions.push("ts < $to");
    params.$to = filter.to;
  }
  for (const field of ["service", "provider", "feature", "model", "status", "correlationId"] as const) {
    const value = filter[field];
    if (value === undefined) continue;
    const column = field === "correlationId" ? "correlation_id" : field;
    conditions.push(`${column} = $${field}`);
    params[`$${field}`] = value;
  }

  return {
    clause: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
    params,
  };
}

/**
 * One percentile, by offset into the ordered durations.
 *
 * SQLite has no percentile function without an extension, and a window
 * function over every matched row costs more than two cheap statements. Calls
 * with no recorded duration are excluded rather than counted as zero -- a
 * missing measurement is not a fast call.
 */
function percentile(
  db: Database,
  where: Where,
  fraction: number,
): number | null {
  const timed = where.clause
    ? `${where.clause} AND duration_ms IS NOT NULL`
    : "WHERE duration_ms IS NOT NULL";

  const counted = db
    .query<{ n: number }, typeof where.params>(
      `SELECT COUNT(*) AS n FROM api_events ${timed}`,
    )
    .get(where.params);

  const n = counted?.n ?? 0;
  if (n === 0) return null;

  // Nearest-rank, the convention latency dashboards use: p95 names a real
  // observed call that is at least as slow as 95% of them. Interpolating
  // between two samples would invent a duration nothing actually took.
  const offset = Math.min(n - 1, Math.max(0, Math.ceil(fraction * n) - 1));
  const row = db
    .query<{ duration_ms: number }, Record<string, string | number>>(
      `SELECT duration_ms FROM api_events ${timed}
       ORDER BY duration_ms ASC LIMIT 1 OFFSET $offset`,
    )
    .get({ ...where.params, $offset: offset });

  return row?.duration_ms ?? null;
}

export function querySummary(db: Database, filter: UsageFilter): UsageSummary {
  const where = buildWhere(filter);

  const row = db
    .query<
      {
        calls: number;
        errors: number;
        cost_usd: number | null;
        priced_calls: number;
        unpriced_calls: number;
        input_tokens: number | null;
        output_tokens: number | null;
        cached_input_tokens: number | null;
        reasoning_tokens: number | null;
        total_tokens: number | null;
        max_duration: number | null;
        seeded_calls: number;
        first_ts: number | null;
        last_ts: number | null;
      },
      typeof where.params
    >(
      `SELECT
         COUNT(*)                                            AS calls,
         SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END)   AS errors,
         SUM(cost_usd)                                       AS cost_usd,
         SUM(CASE WHEN cost_usd IS NOT NULL THEN 1 ELSE 0 END) AS priced_calls,
         SUM(CASE WHEN cost_usd IS NULL AND total_tokens > 0 THEN 1 ELSE 0 END)
                                                             AS unpriced_calls,
         SUM(input_tokens)                                   AS input_tokens,
         SUM(output_tokens)                                  AS output_tokens,
         SUM(cached_input_tokens)                            AS cached_input_tokens,
         SUM(reasoning_tokens)                               AS reasoning_tokens,
         SUM(total_tokens)                                   AS total_tokens,
         MAX(duration_ms)                                    AS max_duration,
         -- json_extract is built into SQLite, so identifying synthetic rows
         -- costs one expression rather than a column nothing else needs.
         SUM(CASE WHEN json_extract(metadata, '$.seeded') THEN 1 ELSE 0 END)
                                                             AS seeded_calls,
         MIN(ts)                                             AS first_ts,
         MAX(ts)                                             AS last_ts
       FROM api_events
       ${where.clause}`,
    )
    .get(where.params);

  const calls = row?.calls ?? 0;
  const errors = row?.errors ?? 0;

  return {
    calls,
    errors,
    errorRate: calls === 0 ? null : errors / calls,
    costUsd: row?.cost_usd ?? 0,
    pricedCalls: row?.priced_calls ?? 0,
    unpricedCalls: row?.unpriced_calls ?? 0,
    tokens: {
      input: row?.input_tokens ?? 0,
      output: row?.output_tokens ?? 0,
      cachedInput: row?.cached_input_tokens ?? 0,
      reasoning: row?.reasoning_tokens ?? 0,
      total: row?.total_tokens ?? 0,
    },
    durationMs: {
      p50: percentile(db, where, 0.5),
      p95: percentile(db, where, 0.95),
      max: row?.max_duration ?? null,
    },
    seededCalls: row?.seeded_calls ?? 0,
    firstEventTs: row?.first_ts ?? null,
    lastEventTs: row?.last_ts ?? null,
  };
}

/** The SQL expression that produces one metric's value. */
const METRIC_EXPRESSION: Record<SeriesMetric, string> = {
  calls: "COUNT(*)",
  cost: "COALESCE(SUM(cost_usd), 0)",
  tokens: "COALESCE(SUM(total_tokens), 0)",
  errors: "SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END)",
};

/** Series rows carry this key when the grouping column is null for a row. */
export const UNSPECIFIED_GROUP = "(none)";
/** Series rows carry this key when nothing is being grouped by. */
export const TOTAL_GROUP = "total";

export function querySeries(
  db: Database,
  filter: UsageFilter,
  options: {
    bucket: SeriesBucket;
    metric: SeriesMetric;
    groupBy?: GroupableDimension;
    /** Series beyond this many (by total value) are folded into "other". */
    maxKeys?: number;
  },
): UsageSeries {
  const where = buildWhere(filter);
  const size = BUCKET_MS[options.bucket];
  const metric = METRIC_EXPRESSION[options.metric];
  const groupColumn = options.groupBy ? DIMENSION_COLUMN[options.groupBy] : null;
  const keyExpression = groupColumn
    ? `COALESCE(${groupColumn}, '${UNSPECIFIED_GROUP}')`
    : `'${TOTAL_GROUP}'`;

  const raw = db
    .query<{ bucket: number; key: string; value: number }, typeof where.params>(
      `SELECT (ts / ${size}) * ${size} AS bucket,
              ${keyExpression}        AS key,
              ${metric}               AS value
         FROM api_events
         ${where.clause}
        GROUP BY bucket, key
        ORDER BY bucket ASC`,
    )
    .all(where.params);

  // Rank series by total so the chart's stacking order is stable and the
  // legend is not dominated by a long tail of one-call providers.
  const totals = new Map<string, number>();
  for (const entry of raw) {
    totals.set(entry.key, (totals.get(entry.key) ?? 0) + entry.value);
  }
  // A series that is zero in every bucket is dropped rather than drawn: on a
  // cost chart most providers report no price at all, and a legend of eight
  // flat lines hides the two that carry the money.
  const ranked = [...totals.entries()]
    .filter(([, total]) => total !== 0)
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => key);
  const maxKeys = options.maxKeys ?? 8;
  const kept = new Set(ranked.slice(0, maxKeys));
  const foldsOther = ranked.length > maxKeys;

  const byBucket = new Map<number, Record<string, number>>();
  for (const entry of raw) {
    if (!kept.has(entry.key) && !foldsOther) continue;
    const key = kept.has(entry.key) ? entry.key : "other";
    const row = byBucket.get(entry.bucket) ?? {};
    row[key] = (row[key] ?? 0) + entry.value;
    byBucket.set(entry.bucket, row);
  }

  const keys = [...ranked.slice(0, maxKeys), ...(foldsOther ? ["other"] : [])];

  // Gaps are filled with zeros. A line chart that skips empty buckets implies
  // traffic continued at the previous level, which is the opposite of true.
  const buckets = [...byBucket.keys()].sort((a, b) => a - b);
  const rows: Array<{ bucket: number } & Record<string, number>> = [];
  if (buckets.length > 0) {
    const first = buckets[0]!;
    const last = buckets[buckets.length - 1]!;
    for (let bucket = first; bucket <= last; bucket += size) {
      const found = byBucket.get(bucket) ?? {};
      const row: { bucket: number } & Record<string, number> = { bucket };
      for (const key of keys) row[key] = found[key] ?? 0;
      rows.push(row);
    }
  }

  return { bucket: options.bucket, metric: options.metric, keys, rows };
}

export function queryBreakdown(
  db: Database,
  filter: UsageFilter,
  groupBy: GroupableDimension,
): UsageBreakdownRow[] {
  const where = buildWhere(filter);
  const column = DIMENSION_COLUMN[groupBy];

  const rows = db
    .query<
      {
        key: string;
        calls: number;
        errors: number;
        cost_usd: number | null;
        priced_calls: number;
        unpriced_calls: number;
        total_tokens: number | null;
        avg_duration: number | null;
        last_seen: number;
      },
      typeof where.params
    >(
      `SELECT COALESCE(${column}, '${UNSPECIFIED_GROUP}')              AS key,
              COUNT(*)                                                AS calls,
              SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END)        AS errors,
              SUM(cost_usd)                                           AS cost_usd,
              SUM(CASE WHEN cost_usd IS NOT NULL THEN 1 ELSE 0 END)    AS priced_calls,
              SUM(CASE WHEN cost_usd IS NULL AND total_tokens > 0 THEN 1 ELSE 0 END)
                                                                      AS unpriced_calls,
              SUM(total_tokens)                                       AS total_tokens,
              AVG(duration_ms)                                        AS avg_duration,
              MAX(ts)                                                 AS last_seen
         FROM api_events
         ${where.clause}
        GROUP BY key
        ORDER BY calls DESC`,
    )
    .all(where.params);

  return rows.map((row) => ({
    key: row.key,
    calls: row.calls,
    errors: row.errors,
    costUsd: row.cost_usd ?? 0,
    pricedCalls: row.priced_calls,
    unpricedCalls: row.unpriced_calls,
    totalTokens: row.total_tokens ?? 0,
    avgDurationMs: row.avg_duration === null ? null : Math.round(row.avg_duration),
    // The "(none)" bucket has no value to filter on, so a per-group percentile
    // cannot be asked for -- and reusing the unfiltered filter here would
    // quietly report the global p95 as that group's.
    p95DurationMs:
      row.key === UNSPECIFIED_GROUP
        ? null
        : percentile(db, buildWhere({ ...filter, [groupBy]: row.key }), 0.95),
    lastSeenTs: row.last_seen,
  }));
}

/**
 * Keyset pagination on `id`, which is monotonic in insertion order.
 *
 * `ts` would be the natural sort but it is the caller's clock and therefore
 * not unique or even monotonic; paging on it drops rows at page boundaries.
 */
export function queryEvents(
  db: Database,
  filter: UsageFilter,
  options: { limit?: number; cursor?: string | null } = {},
): UsageEventPage {
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 1_000);
  const where = buildWhere(filter);

  const conditions = [where.clause.replace(/^WHERE /, "")].filter(Boolean);
  const params: Record<string, string | number> = { ...where.params };

  if (options.cursor) {
    const cursorId = Number.parseInt(options.cursor, 10);
    if (!Number.isFinite(cursorId)) throw new Error("cursor is not a valid id");
    conditions.push("id < $cursorId");
    params.$cursorId = cursorId;
  }

  const clause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const raw = db
    .query<Record<string, never>, typeof params>(
      `SELECT * FROM api_events ${clause} ORDER BY id DESC LIMIT ${limit + 1}`,
    )
    .all(params) as unknown as SqliteEventRow[];

  const page = raw.slice(0, limit);
  const nextCursor = raw.length > limit ? String(page[page.length - 1]!.id) : null;

  return { rows: page.map(toUsageEventRow), nextCursor };
}

export function queryFacets(db: Database, filter: UsageFilter): UsageFacets {
  const where = buildWhere(filter);
  const distinct = (column: string): string[] =>
    db
      .query<{ value: string | null }, typeof where.params>(
        `SELECT DISTINCT ${column} AS value FROM api_events ${where.clause} ORDER BY value ASC`,
      )
      .all(where.params)
      .map((row) => row.value)
      .filter((value): value is string => typeof value === "string" && value.length > 0);

  return {
    services: distinct("service"),
    providers: distinct("provider"),
    features: distinct("feature"),
    models: distinct("model"),
  };
}

export interface SqliteEventRow {
  id: number;
  event_id: string | null;
  ts: number;
  received_at: number;
  service: string;
  provider: string;
  feature: string | null;
  endpoint: string | null;
  model: string | null;
  duration_ms: number | null;
  status: UsageStatus;
  http_status: number | null;
  error_kind: string | null;
  error_message: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cached_input_tokens: number | null;
  reasoning_tokens: number | null;
  total_tokens: number | null;
  cost_usd: number | null;
  cost_basis: CostBasis | null;
  correlation_id: string | null;
  metadata: string | null;
  schema_version: number;
}

export function toUsageEventRow(row: SqliteEventRow): UsageEventRow {
  let metadata: Record<string, unknown> | null = null;
  if (row.metadata) {
    try {
      const parsed: unknown = JSON.parse(row.metadata);
      metadata = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
    } catch {
      // Stored metadata that no longer parses is not worth failing a read for.
      metadata = null;
    }
  }

  return {
    id: row.id,
    eventId: row.event_id,
    ts: row.ts,
    receivedAt: row.received_at,
    service: row.service,
    provider: row.provider,
    feature: row.feature,
    endpoint: row.endpoint,
    model: row.model,
    durationMs: row.duration_ms,
    status: row.status,
    httpStatus: row.http_status,
    errorKind: row.error_kind,
    errorMessage: row.error_message,
    tokens: {
      input: row.input_tokens,
      output: row.output_tokens,
      cachedInput: row.cached_input_tokens,
      reasoning: row.reasoning_tokens,
      total: row.total_tokens,
    },
    costUsd: row.cost_usd,
    costBasis: row.cost_basis,
    correlationId: row.correlation_id,
    metadata,
  };
}
