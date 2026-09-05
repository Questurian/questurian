import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  describeValidationError,
  parseUsageEvent,
  USAGE_SCHEMA_VERSION,
  type UsageEvent,
  type UsageIngestResult,
} from "./contract";
import { applyMigrations } from "./migrations";
import {
  queryBreakdown,
  queryEvents,
  queryFacets,
  querySeries,
  querySummary,
} from "./queries";
import type {
  GroupableDimension,
  SeriesBucket,
  SeriesMetric,
  UsageBreakdownRow,
  UsageEventPage,
  UsageFacets,
  UsageFilter,
  UsageSeries,
  UsageSummary,
} from "./types";

/**
 * What the routes are allowed to know about storage.
 *
 * The interface exists so that outgrowing SQLite -- rollup tables, DuckDB,
 * Postgres -- is a change to one file rather than to every route. Today's
 * volume does not need any of that; the seam is cheap enough to have anyway.
 */
export interface UsageStore {
  ingest(events: readonly unknown[]): UsageIngestResult;
  summary(filter: UsageFilter): UsageSummary;
  series(
    filter: UsageFilter,
    options: {
      bucket: SeriesBucket;
      metric: SeriesMetric;
      groupBy?: GroupableDimension;
      maxKeys?: number;
    },
  ): UsageSeries;
  breakdown(filter: UsageFilter, groupBy: GroupableDimension): UsageBreakdownRow[];
  events(filter: UsageFilter, options?: { limit?: number; cursor?: string | null }): UsageEventPage;
  facets(filter: UsageFilter): UsageFacets;
  /** Delete events older than `cutoffMs`. Returns how many rows went. */
  purgeOlderThan(cutoffMs: number): number;
  count(): number;
  close(): void;
}

/** `:memory:` is accepted, and is what the tests use. */
export function openUsageDatabase(path: string): Database {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }

  const db = new Database(path, { create: true });
  // WAL lets the ingest write while the UI reads, which is the whole access
  // pattern here. `normal` synchronous is the right trade for observability
  // data: a lost tail after a hard kill costs a few events, not correctness.
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA synchronous = NORMAL");
  db.run("PRAGMA busy_timeout = 5000");
  applyMigrations(db);
  return db;
}

const INSERT_SQL = `
  INSERT INTO api_events (
    event_id, ts, received_at, service, provider, feature, endpoint, model,
    duration_ms, status, http_status, error_kind, error_message,
    input_tokens, output_tokens, cached_input_tokens, reasoning_tokens, total_tokens,
    cost_usd, cost_basis, correlation_id, metadata, schema_version
  ) VALUES (
    $eventId, $ts, $receivedAt, $service, $provider, $feature, $endpoint, $model,
    $durationMs, $status, $httpStatus, $errorKind, $errorMessage,
    $inputTokens, $outputTokens, $cachedInputTokens, $reasoningTokens, $totalTokens,
    $costUsd, $costBasis, $correlationId, $metadata, $schemaVersion
  )
  -- The conflict target repeats the partial index's own WHERE clause, which
  -- SQLite requires: without it the statement matches no unique constraint
  -- and fails at prepare time.
  ON CONFLICT (event_id) WHERE event_id IS NOT NULL DO NOTHING
`;

type InsertParams = Record<string, string | number | null>;

/**
 * `tokens.total` is trusted when the emitter sends it and derived when it does
 * not, so that summing one column always answers "how many tokens". Providers
 * disagree about whether total includes reasoning or cached reads, so the
 * emitter's own figure wins -- it is the one that saw the provider's response.
 */
function toInsertParams(event: UsageEvent, receivedAt: number): InsertParams {
  const tokens = event.tokens ?? {};
  const derivedTotal =
    tokens.total ??
    (tokens.input === undefined && tokens.output === undefined
      ? undefined
      : (tokens.input ?? 0) + (tokens.output ?? 0) + (tokens.reasoning ?? 0));

  return {
    $eventId: event.eventId ?? null,
    $ts: event.ts,
    $receivedAt: receivedAt,
    $service: event.service,
    $provider: event.provider,
    $feature: event.feature ?? null,
    $endpoint: event.endpoint ?? null,
    $model: event.model ?? null,
    $durationMs: event.durationMs ?? null,
    $status: event.status,
    $httpStatus: event.httpStatus ?? null,
    $errorKind: event.errorKind ?? null,
    $errorMessage: event.errorMessage ?? null,
    $inputTokens: tokens.input ?? null,
    $outputTokens: tokens.output ?? null,
    $cachedInputTokens: tokens.cachedInput ?? null,
    $reasoningTokens: tokens.reasoning ?? null,
    $totalTokens: derivedTotal ?? null,
    $costUsd: event.costUsd ?? null,
    $costBasis: event.costBasis ?? null,
    $correlationId: event.correlationId ?? null,
    $metadata: event.metadata ? JSON.stringify(event.metadata) : null,
    $schemaVersion: USAGE_SCHEMA_VERSION,
  };
}

export class SqliteUsageStore implements UsageStore {
  private readonly db: Database;
  private readonly insert;

  constructor(pathOrDatabase: string | Database) {
    this.db =
      typeof pathOrDatabase === "string" ? openUsageDatabase(pathOrDatabase) : pathOrDatabase;
    this.insert = this.db.prepare(INSERT_SQL);
  }

  /**
   * One batch, one transaction, and one bad event does not sink the rest.
   *
   * A rejected event is reported by index with a readable reason. Producers
   * are fire-and-forget by design, so nobody is reading their local logs --
   * the rejection has to be legible in the response and in this app's log.
   */
  ingest(events: readonly unknown[]): UsageIngestResult {
    const receivedAt = Date.now();
    const valid: InsertParams[] = [];
    const result: UsageIngestResult = { accepted: 0, duplicates: 0, rejected: 0, errors: [] };

    events.forEach((candidate, index) => {
      try {
        const { event } = parseUsageEvent(candidate);
        valid.push(toInsertParams(event, receivedAt));
      } catch (error) {
        result.rejected += 1;
        result.errors.push({ index, message: describeValidationError(error) });
      }
    });

    if (valid.length > 0) {
      const before = this.count();
      const writeAll = this.db.transaction((rows: InsertParams[]) => {
        for (const row of rows) this.insert.run(row);
      });
      writeAll(valid);
      // `ON CONFLICT DO NOTHING` makes a replay silent, so the count of what
      // actually landed is the only way to tell an insert from a duplicate.
      const inserted = this.count() - before;
      result.accepted = inserted;
      result.duplicates = valid.length - inserted;
    }

    return result;
  }

  summary(filter: UsageFilter): UsageSummary {
    return querySummary(this.db, filter);
  }

  series(
    filter: UsageFilter,
    options: {
      bucket: SeriesBucket;
      metric: SeriesMetric;
      groupBy?: GroupableDimension;
      maxKeys?: number;
    },
  ): UsageSeries {
    return querySeries(this.db, filter, options);
  }

  breakdown(filter: UsageFilter, groupBy: GroupableDimension): UsageBreakdownRow[] {
    return queryBreakdown(this.db, filter, groupBy);
  }

  events(
    filter: UsageFilter,
    options: { limit?: number; cursor?: string | null } = {},
  ): UsageEventPage {
    return queryEvents(this.db, filter, options);
  }

  facets(filter: UsageFilter): UsageFacets {
    return queryFacets(this.db, filter);
  }

  purgeOlderThan(cutoffMs: number): number {
    const before = this.count();
    this.db.run("DELETE FROM api_events WHERE ts < ?", [cutoffMs]);
    return before - this.count();
  }

  count(): number {
    const row = this.db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM api_events").get();
    return row?.n ?? 0;
  }

  close(): void {
    this.db.close();
  }
}

let shared: UsageStore | null = null;

/** Where the events live. Overridable so tests never touch the real file. */
export function usageDatabasePath(): string {
  return process.env.USAGE_DB_PATH ?? `${process.cwd()}/data/usage.sqlite`;
}

/** The process-wide store. Opened on first use so imports stay side-effect free. */
export function getUsageStore(): UsageStore {
  shared ??= new SqliteUsageStore(usageDatabasePath());
  return shared;
}
