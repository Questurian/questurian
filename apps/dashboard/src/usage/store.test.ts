import { describe, expect, test } from "bun:test";
import { MAX_ERROR_MESSAGE_CHARS, parseUsageEvent } from "./contract";
import { purgeExpired } from "./retention";
import { SqliteUsageStore } from "./store";
import type { UsageEvent } from "./contract";

const T0 = Date.UTC(2026, 8, 1, 12, 0, 0);

function store(): SqliteUsageStore {
  return new SqliteUsageStore(":memory:");
}

function event(overrides: Partial<UsageEvent> = {}): Record<string, unknown> {
  return {
    ts: T0,
    service: "abw-backend",
    provider: "google-vertex",
    feature: "prompt2blog",
    model: "gemini-3.1-pro-preview",
    durationMs: 1_000,
    status: "ok",
    tokens: { input: 100, output: 20, total: 120 },
    costUsd: 0.01,
    costBasis: "rate-table",
    ...overrides,
  };
}

describe("contract validation", () => {
  test("accepts the minimum required event", () => {
    const { event: parsed } = parseUsageEvent({
      ts: T0,
      service: "lm-server",
      provider: "serpapi",
      status: "ok",
    });
    expect(parsed.provider).toBe("serpapi");
    expect(parsed.model).toBeUndefined();
  });

  test("rejects a timestamp in seconds", () => {
    expect(() =>
      parseUsageEvent({ ts: Math.floor(T0 / 1000), service: "a", provider: "b", status: "ok" }),
    ).toThrow(/milliseconds/);
  });

  test("rejects an unknown status", () => {
    expect(() => parseUsageEvent({ ...event(), status: "maybe" })).toThrow();
  });

  test("keeps unknown fields in metadata instead of rejecting them", () => {
    const { event: parsed, unknownKeys } = parseUsageEvent({
      ...event(),
      region: "us-central1",
    });
    expect(unknownKeys).toEqual(["region"]);
    expect(parsed.metadata).toEqual({ _unknown: { region: "us-central1" } });
  });

  test("truncates a long error message", () => {
    const { event: parsed } = parseUsageEvent({
      ...event(),
      status: "error",
      errorMessage: "x".repeat(5_000),
    });
    expect(parsed.errorMessage).toHaveLength(MAX_ERROR_MESSAGE_CHARS);
  });

  test("treats explicit nulls as absent rather than as type errors", () => {
    const { event: parsed } = parseUsageEvent({ ...event(), model: null, costUsd: null });
    expect(parsed.model).toBeUndefined();
    expect(parsed.costUsd).toBeUndefined();
  });
});

describe("ingest", () => {
  test("reports per-event rejections by index and still writes the good ones", () => {
    const s = store();
    const result = s.ingest([event(), { ts: T0, service: "a" }, event({ eventId: "e2" })]);
    expect(result.accepted).toBe(2);
    expect(result.rejected).toBe(1);
    expect(result.errors[0]?.index).toBe(1);
    expect(result.errors[0]?.message).toContain("provider");
    s.close();
  });

  test("a replayed eventId is a duplicate, not a second row", () => {
    const s = store();
    expect(s.ingest([event({ eventId: "same" })]).accepted).toBe(1);
    const replay = s.ingest([event({ eventId: "same" })]);
    expect(replay.accepted).toBe(0);
    expect(replay.duplicates).toBe(1);
    expect(s.count()).toBe(1);
    s.close();
  });

  test("events without an eventId are never deduplicated against each other", () => {
    const s = store();
    s.ingest([event(), event(), event()]);
    expect(s.count()).toBe(3);
    s.close();
  });

  test("derives total tokens when the emitter omits the total", () => {
    const s = store();
    s.ingest([event({ tokens: { input: 10, output: 5, reasoning: 2 } })]);
    expect(s.summary({}).tokens.total).toBe(17);
    s.close();
  });

  test("trusts the emitter's own total over the sum of its parts", () => {
    const s = store();
    s.ingest([event({ tokens: { input: 10, output: 5, total: 99 } })]);
    expect(s.summary({}).tokens.total).toBe(99);
    s.close();
  });
});

describe("summary", () => {
  test("counts calls, errors and the error rate", () => {
    const s = store();
    s.ingest([
      event(),
      event({ status: "error", errorKind: "quota_exhausted", costUsd: undefined }),
      event(),
      event(),
    ]);
    const summary = s.summary({});
    expect(summary.calls).toBe(4);
    expect(summary.errors).toBe(1);
    expect(summary.errorRate).toBeCloseTo(0.25);
    s.close();
  });

  test("an empty window reports a null error rate, not zero", () => {
    const s = store();
    expect(s.summary({}).errorRate).toBeNull();
    expect(s.summary({}).calls).toBe(0);
    s.close();
  });

  test("sums only reported costs and counts the unpriced calls separately", () => {
    const s = store();
    s.ingest([
      event({ costUsd: 0.5 }),
      event({ costUsd: 0.25 }),
      event({ costUsd: undefined, tokens: { input: 10, output: 1, total: 11 } }),
    ]);
    const summary = s.summary({});
    expect(summary.costUsd).toBeCloseTo(0.75);
    expect(summary.unpricedCalls).toBe(1);
    s.close();
  });

  test("reports how many calls carried a price at all", () => {
    const s = store();
    s.ingest([
      event({ costUsd: 0.5 }),
      event({ costUsd: undefined, tokens: undefined }),
      event({ costUsd: undefined, tokens: { input: 1, output: 1, total: 2 } }),
    ]);
    const summary = s.summary({});
    expect(summary.pricedCalls).toBe(1);
    expect(summary.unpricedCalls).toBe(1);
    s.close();
  });

  test("counts synthetic events so the UI can disown them", () => {
    const s = store();
    s.ingest([
      event({ metadata: { seeded: true } }),
      event({ metadata: { seeded: true } }),
      event(),
      event({ metadata: { stage: "compose" } }),
    ]);
    const summary = s.summary({});
    expect(summary.calls).toBe(4);
    expect(summary.seededCalls).toBe(2);
    s.close();
  });

  test("an empty database reports no synthetic events", () => {
    const s = store();
    s.ingest([event()]);
    expect(s.summary({}).seededCalls).toBe(0);
    s.close();
  });

  test("percentiles ignore calls with no recorded duration", () => {
    const s = store();
    s.ingest([
      event({ durationMs: 100 }),
      event({ durationMs: 200 }),
      event({ durationMs: 300 }),
      event({ durationMs: undefined }),
    ]);
    const summary = s.summary({});
    expect(summary.durationMs.p50).toBe(200);
    expect(summary.durationMs.p95).toBe(300);
    expect(summary.durationMs.max).toBe(300);
    s.close();
  });

  test("filters by time window, service and provider", () => {
    const s = store();
    s.ingest([
      event({ ts: T0 }),
      event({ ts: T0 + 60_000, provider: "anthropic" }),
      event({ ts: T0 + 120_000, service: "lm-server", provider: "serpapi" }),
    ]);
    expect(s.summary({ from: T0 + 60_000 }).calls).toBe(2);
    expect(s.summary({ to: T0 + 60_000 }).calls).toBe(1);
    expect(s.summary({ provider: "anthropic" }).calls).toBe(1);
    expect(s.summary({ service: "lm-server" }).calls).toBe(1);
    s.close();
  });
});

describe("series", () => {
  test("buckets by hour and fills empty buckets with zero", () => {
    const s = store();
    s.ingest([
      event({ ts: T0 }),
      event({ ts: T0 + 30 * 60_000 }),
      // Nothing in the second hour.
      event({ ts: T0 + 2 * 3_600_000 }),
    ]);
    const series = s.series({}, { bucket: "hour", metric: "calls" });
    expect(series.rows).toHaveLength(3);
    expect(series.rows[0]?.total).toBe(2);
    expect(series.rows[1]?.total).toBe(0);
    expect(series.rows[2]?.total).toBe(1);
    s.close();
  });

  test("groups by provider and ranks the keys by total", () => {
    const s = store();
    s.ingest([
      event({ provider: "anthropic" }),
      event({ provider: "google-vertex" }),
      event({ provider: "google-vertex" }),
    ]);
    const series = s.series({}, { bucket: "hour", metric: "calls", groupBy: "provider" });
    expect(series.keys).toEqual(["google-vertex", "anthropic"]);
    expect(series.rows[0]).toMatchObject({ "google-vertex": 2, anthropic: 1 });
    s.close();
  });

  test("folds series beyond maxKeys into one 'other' key", () => {
    const s = store();
    s.ingest([
      event({ provider: "p1" }),
      event({ provider: "p1" }),
      event({ provider: "p2" }),
      event({ provider: "p3" }),
    ]);
    const series = s.series({}, { bucket: "hour", metric: "calls", groupBy: "provider", maxKeys: 1 });
    expect(series.keys).toEqual(["p1", "other"]);
    expect(series.rows[0]).toMatchObject({ p1: 2, other: 2 });
    s.close();
  });

  test("drops a series that is zero in every bucket", () => {
    const s = store();
    s.ingest([
      event({ provider: "google-vertex", costUsd: 0.4 }),
      // Reports tokens but no price: it must not appear on a cost chart.
      event({ provider: "anthropic", costUsd: undefined }),
    ]);
    const calls = s.series({}, { bucket: "hour", metric: "calls", groupBy: "provider" });
    expect(calls.keys.sort()).toEqual(["anthropic", "google-vertex"]);
    const cost = s.series({}, { bucket: "hour", metric: "cost", groupBy: "provider" });
    expect(cost.keys).toEqual(["google-vertex"]);
    s.close();
  });

  test("a metric with nothing to show returns no keys and no rows", () => {
    const s = store();
    s.ingest([event({ costUsd: undefined })]);
    const cost = s.series({}, { bucket: "hour", metric: "cost", groupBy: "provider" });
    expect(cost.keys).toEqual([]);
    expect(cost.rows).toEqual([]);
    s.close();
  });

  test("labels rows with a null grouping column rather than dropping them", () => {
    const s = store();
    s.ingest([event({ feature: undefined })]);
    const series = s.series({}, { bucket: "hour", metric: "calls", groupBy: "feature" });
    expect(series.keys).toEqual(["(none)"]);
    s.close();
  });

  test("cost and error metrics use the same buckets", () => {
    const s = store();
    s.ingest([event({ costUsd: 1 }), event({ status: "error", costUsd: undefined })]);
    expect(s.series({}, { bucket: "day", metric: "cost" }).rows[0]?.total).toBeCloseTo(1);
    expect(s.series({}, { bucket: "day", metric: "errors" }).rows[0]?.total).toBe(1);
    s.close();
  });
});

describe("breakdown", () => {
  test("one row per group, ordered by calls", () => {
    const s = store();
    s.ingest([
      event({ model: "gemini-3.1-pro-preview", durationMs: 100 }),
      event({ model: "gemini-3.1-pro-preview", durationMs: 300 }),
      event({ model: "claude-opus-5", durationMs: 200, status: "error", costUsd: undefined }),
    ]);
    const rows = s.breakdown({}, "model");
    expect(rows.map((row) => row.key)).toEqual(["gemini-3.1-pro-preview", "claude-opus-5"]);
    expect(rows[0]?.calls).toBe(2);
    expect(rows[0]?.avgDurationMs).toBe(200);
    expect(rows[1]?.errors).toBe(1);
    s.close();
  });

  test("separates a provider that reports no price from one that reports zero", () => {
    const s = store();
    s.ingest([
      event({ provider: "google-places", tokens: undefined, costUsd: undefined }),
      event({ provider: "google-vertex", costUsd: 0.2 }),
    ]);
    const rows = s.breakdown({}, "provider");
    const places = rows.find((row) => row.key === "google-places");
    expect(places?.pricedCalls).toBe(0);
    expect(places?.totalTokens).toBe(0);
    expect(rows.find((row) => row.key === "google-vertex")?.pricedCalls).toBe(1);
    s.close();
  });

  test("the '(none)' group reports no per-group percentile rather than the global one", () => {
    const s = store();
    s.ingest([event({ feature: undefined, durationMs: 100 }), event({ feature: "x", durationMs: 900 })]);
    const none = s.breakdown({}, "feature").find((row) => row.key === "(none)");
    expect(none?.p95DurationMs).toBeNull();
    s.close();
  });
});

describe("events page", () => {
  test("returns newest first and pages with the cursor", () => {
    const s = store();
    for (let index = 0; index < 5; index += 1) {
      s.ingest([event({ ts: T0 + index * 1_000, correlationId: `run-${index}` })]);
    }
    const first = s.events({}, { limit: 2 });
    expect(first.rows.map((row) => row.correlationId)).toEqual(["run-4", "run-3"]);
    expect(first.nextCursor).not.toBeNull();

    const second = s.events({}, { limit: 2, cursor: first.nextCursor });
    expect(second.rows.map((row) => row.correlationId)).toEqual(["run-2", "run-1"]);

    const last = s.events({}, { limit: 2, cursor: second.nextCursor });
    expect(last.rows.map((row) => row.correlationId)).toEqual(["run-0"]);
    expect(last.nextCursor).toBeNull();
    s.close();
  });

  test("round-trips metadata and the error fields", () => {
    const s = store();
    s.ingest([
      event({
        status: "error",
        errorKind: "timeout",
        errorMessage: "deadline exceeded",
        metadata: { attempt: 2, stage: "compose" },
      }),
    ]);
    const row = s.events({}).rows[0];
    expect(row?.errorKind).toBe("timeout");
    expect(row?.metadata).toEqual({ attempt: 2, stage: "compose" });
    s.close();
  });

  test("filters by correlation id", () => {
    const s = store();
    s.ingest([event({ correlationId: "run-a" }), event({ correlationId: "run-b" })]);
    expect(s.events({ correlationId: "run-a" }).rows).toHaveLength(1);
    s.close();
  });
});

describe("facets", () => {
  test("lists distinct values and skips the nulls", () => {
    const s = store();
    s.ingest([
      event({ provider: "anthropic", feature: undefined }),
      event({ provider: "google-vertex", feature: "listicle" }),
    ]);
    const facets = s.facets({});
    expect(facets.providers).toEqual(["anthropic", "google-vertex"]);
    expect(facets.features).toEqual(["listicle"]);
    s.close();
  });
});

describe("retention", () => {
  test("purges only events older than the cutoff", () => {
    const s = store();
    s.ingest([event({ ts: T0 - 10 * 86_400_000 }), event({ ts: T0 })]);
    expect(s.purgeOlderThan(T0 - 86_400_000)).toBe(1);
    expect(s.count()).toBe(1);
    s.close();
  });

  test("a retention of 0 days keeps everything", () => {
    const s = store();
    s.ingest([event({ ts: T0 - 1_000 * 86_400_000 })]);
    const previous = process.env.USAGE_RETENTION_DAYS;
    process.env.USAGE_RETENTION_DAYS = "0";
    try {
      expect(purgeExpired(s, T0)).toBe(0);
      expect(s.count()).toBe(1);
    } finally {
      if (previous === undefined) delete process.env.USAGE_RETENTION_DAYS;
      else process.env.USAGE_RETENTION_DAYS = previous;
    }
    s.close();
  });
});
