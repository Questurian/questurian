import type { CostBasis, UsageStatus } from "./contract";

/** Every read endpoint takes the same filter. Absent fields mean "no filter". */
export interface UsageFilter {
  /** Inclusive lower bound, epoch ms. */
  from?: number;
  /** Exclusive upper bound, epoch ms. */
  to?: number;
  service?: string;
  provider?: string;
  feature?: string;
  model?: string;
  status?: UsageStatus;
  correlationId?: string;
}

/** The dimensions a caller may group by. Anything else is rejected. */
export const groupableDimensions = ["provider", "service", "feature", "model"] as const;
export type GroupableDimension = (typeof groupableDimensions)[number];

export const seriesBuckets = ["minute", "hour", "day"] as const;
export type SeriesBucket = (typeof seriesBuckets)[number];

export const seriesMetrics = ["calls", "cost", "tokens", "errors"] as const;
export type SeriesMetric = (typeof seriesMetrics)[number];

export interface UsageSummary {
  calls: number;
  errors: number;
  /** Share of calls that failed, 0..1. `null` when there were no calls. */
  errorRate: number | null;
  costUsd: number;
  /** Calls that reported a price. Zero means the cost figure says nothing. */
  pricedCalls: number;
  /** Calls with token counts but no price. The cost figure excludes them. */
  unpricedCalls: number;
  tokens: {
    input: number;
    output: number;
    cachedInput: number;
    reasoning: number;
    total: number;
  };
  durationMs: {
    p50: number | null;
    p95: number | null;
    max: number | null;
  };
  /** Synthetic events from the seed script. Above zero, the UI says so. */
  seededCalls: number;
  /** Bounds of the data actually matched, not of the requested window. */
  firstEventTs: number | null;
  lastEventTs: number | null;
}

export interface UsageSeries {
  bucket: SeriesBucket;
  metric: SeriesMetric;
  /** Series names, in the order the UI should stack them. */
  keys: string[];
  /** One row per time bucket: `{ bucket, <key>: value, … }`. */
  rows: Array<{ bucket: number } & Record<string, number>>;
}

export interface UsageBreakdownRow {
  key: string;
  calls: number;
  errors: number;
  costUsd: number;
  pricedCalls: number;
  unpricedCalls: number;
  totalTokens: number;
  avgDurationMs: number | null;
  p95DurationMs: number | null;
  lastSeenTs: number;
}

export interface UsageEventRow {
  id: number;
  eventId: string | null;
  ts: number;
  receivedAt: number;
  service: string;
  provider: string;
  feature: string | null;
  endpoint: string | null;
  model: string | null;
  durationMs: number | null;
  status: UsageStatus;
  httpStatus: number | null;
  errorKind: string | null;
  errorMessage: string | null;
  tokens: {
    input: number | null;
    output: number | null;
    cachedInput: number | null;
    reasoning: number | null;
    total: number | null;
  };
  costUsd: number | null;
  costBasis: CostBasis | null;
  correlationId: string | null;
  metadata: Record<string, unknown> | null;
}

export interface UsageEventPage {
  rows: UsageEventRow[];
  /** Pass back as `cursor` for the next page. `null` when the page is last. */
  nextCursor: string | null;
}

export interface UsageFacets {
  services: string[];
  providers: string[];
  features: string[];
  models: string[];
}
