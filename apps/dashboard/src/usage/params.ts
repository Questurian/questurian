import { groupableDimensions, seriesBuckets, seriesMetrics } from "./types";
import type { GroupableDimension, SeriesBucket, SeriesMetric, UsageFilter } from "./types";
import { usageStatuses } from "./contract";
import type { UsageStatus } from "./contract";

/**
 * Query-string parsing for the read routes.
 *
 * Everything here fails loudly on bad input rather than falling back to a
 * default. A dashboard that silently ignores `provider=typo` and shows the
 * unfiltered total is worse than one that says the word was not understood.
 */

export class BadRequestError extends Error {}

const WINDOW_PATTERN = /^(\d+)(m|h|d)$/;
const WINDOW_UNIT_MS: Record<string, number> = { m: 60_000, h: 3_600_000, d: 86_400_000 };

/** `15m`, `24h`, `7d` — a window measured back from now. */
export function parseWindow(value: string): number {
  const match = WINDOW_PATTERN.exec(value.trim());
  if (!match) throw new BadRequestError(`window must look like 15m, 24h or 7d (got "${value}")`);
  return Number.parseInt(match[1]!, 10) * WINDOW_UNIT_MS[match[2]!]!;
}

function parseInstant(value: string, field: string): number {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && value.trim() !== "") return numeric;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new BadRequestError(`${field} must be epoch ms or an ISO date (got "${value}")`);
  }
  return parsed;
}

function oneOf<T extends string>(
  value: string,
  allowed: readonly T[],
  field: string,
): T {
  if ((allowed as readonly string[]).includes(value)) return value as T;
  throw new BadRequestError(`${field} must be one of ${allowed.join(", ")} (got "${value}")`);
}

export interface QueryReader {
  (key: string): string | undefined;
}

/**
 * `window` and `from` are mutually exclusive: two ways to say when, resolved
 * silently, is how a UI ends up showing a range nobody asked for.
 */
export function parseFilter(query: QueryReader, now: number = Date.now()): UsageFilter {
  const filter: UsageFilter = {};
  const window = query("window");
  const from = query("from");
  const to = query("to");

  if (window !== undefined && from !== undefined) {
    throw new BadRequestError("pass either window or from, not both");
  }

  if (window !== undefined) {
    filter.from = now - parseWindow(window);
  } else if (from !== undefined) {
    filter.from = parseInstant(from, "from");
  }
  if (to !== undefined) filter.to = parseInstant(to, "to");

  if (filter.from !== undefined && filter.to !== undefined && filter.from >= filter.to) {
    throw new BadRequestError("from must be earlier than to");
  }

  for (const field of ["service", "provider", "feature", "model", "correlationId"] as const) {
    const value = query(field);
    if (value !== undefined && value !== "") filter[field] = value;
  }

  const status = query("status");
  if (status !== undefined && status !== "") {
    filter.status = oneOf<UsageStatus>(status, usageStatuses, "status");
  }

  return filter;
}

export function parseGroupBy(
  query: QueryReader,
  field = "groupBy",
): GroupableDimension | undefined {
  const value = query(field);
  if (value === undefined || value === "") return undefined;
  return oneOf<GroupableDimension>(value, groupableDimensions, field);
}

export function parseBucket(query: QueryReader): SeriesBucket {
  const value = query("bucket");
  if (value === undefined || value === "") return "hour";
  return oneOf<SeriesBucket>(value, seriesBuckets, "bucket");
}

export function parseMetric(query: QueryReader): SeriesMetric {
  const value = query("metric");
  if (value === undefined || value === "") return "calls";
  return oneOf<SeriesMetric>(value, seriesMetrics, "metric");
}

export function parseLimit(query: QueryReader, fallback: number, max: number): number {
  const value = query("limit");
  if (value === undefined || value === "") return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new BadRequestError(`limit must be a positive integer (got "${value}")`);
  }
  return Math.min(parsed, max);
}
