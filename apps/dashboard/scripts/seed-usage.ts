#!/usr/bin/env bun
/**
 * Synthetic events, so the UI can be built and judged before any real
 * producer exists.
 *
 * The shapes here are deliberately uneven -- one expensive slow provider, one
 * chatty cheap one, a couple of non-AI services with no tokens at all, and a
 * burst of failures -- because a chart that only ever sees tidy data hides
 * the cases it needs to make readable.
 *
 * Usage: bun run scripts/seed-usage.ts [--events 4000] [--days 7] [--reset]
 */
import { randomUUID } from "node:crypto";
import { SEEDED_METADATA_KEY } from "../src/usage/contract";
import { SqliteUsageStore, usageDatabasePath } from "../src/usage/store";
import type { UsageEvent } from "../src/usage/contract";

interface ProviderProfile {
  provider: string;
  service: string;
  feature: string;
  model?: string;
  endpoint?: string;
  weight: number;
  durationMs: [number, number];
  /** Tokens per call, or undefined for a non-AI provider. */
  tokens?: [number, number];
  /** USD per 1k total tokens, or undefined when the provider reports no cost. */
  pricePerKTokens?: number;
  errorRate: number;
  errorKinds: string[];
}

const PROFILES: ProviderProfile[] = [
  {
    provider: "google-vertex",
    service: "abw-backend",
    feature: "prompt2blog",
    model: "gemini-3.1-pro-preview",
    weight: 30,
    durationMs: [4_000, 40_000],
    tokens: [8_000, 90_000],
    pricePerKTokens: 0.004,
    errorRate: 0.04,
    errorKinds: ["quota_exhausted", "deadline_exceeded", "safety_block"],
  },
  {
    provider: "google-vertex",
    service: "abw-backend",
    feature: "listicle",
    model: "gemini-3.7-flash",
    weight: 22,
    durationMs: [900, 9_000],
    tokens: [1_200, 18_000],
    pricePerKTokens: 0.0012,
    errorRate: 0.02,
    errorKinds: ["deadline_exceeded"],
  },
  {
    provider: "claude-cli",
    service: "abw-backend",
    feature: "prompt2blog",
    model: "claude-opus-5",
    weight: 8,
    durationMs: [20_000, 120_000],
    tokens: [20_000, 140_000],
    pricePerKTokens: 0.02,
    errorRate: 0.06,
    errorKinds: ["cli_refusal", "quota_exhausted"],
  },
  {
    // Tokens but no price: the case the UI has to be honest about rather than
    // rendering as $0. Grounded-search calls land here in real life too.
    provider: "anthropic",
    service: "abw-backend",
    feature: "editor-assist",
    model: "claude-sonnet-5",
    weight: 10,
    durationMs: [1_500, 25_000],
    tokens: [2_000, 40_000],
    errorRate: 0.03,
    errorKinds: ["overloaded", "rate_limited"],
  },
  {
    provider: "serpapi",
    service: "lm-server",
    feature: "reviews-fetch",
    endpoint: "/search?engine=tripadvisor",
    weight: 14,
    durationMs: [400, 3_500],
    errorRate: 0.03,
    errorKinds: ["rate_limited", "http_502"],
  },
  {
    provider: "google-places",
    service: "lm-server",
    feature: "place-details",
    endpoint: "/v1/places:searchText",
    weight: 16,
    durationMs: [120, 1_200],
    errorRate: 0.01,
    errorKinds: ["not_found"],
  },
  {
    provider: "stripe",
    service: "questura-server",
    feature: "payments",
    endpoint: "/v1/checkout/sessions",
    weight: 4,
    durationMs: [200, 2_500],
    errorRate: 0.02,
    errorKinds: ["card_declined"],
  },
  {
    provider: "bunny-cdn",
    service: "questura-server",
    feature: "media-upload",
    endpoint: "PUT /storage",
    weight: 6,
    durationMs: [300, 6_000],
    errorRate: 0.015,
    errorKinds: ["http_500"],
  },
];

function argValue(flag: string, fallback: number): number {
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  const parsed = Number.parseInt(process.argv[index + 1] ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function between(low: number, high: number): number {
  return low + Math.random() * (high - low);
}

function pickProfile(): ProviderProfile {
  const total = PROFILES.reduce((sum, profile) => sum + profile.weight, 0);
  let roll = Math.random() * total;
  for (const profile of PROFILES) {
    roll -= profile.weight;
    if (roll <= 0) return profile;
  }
  return PROFILES[0]!;
}

/**
 * Traffic is not uniform: a working day has peaks, and pipeline runs arrive in
 * clusters. Weighting by hour keeps the hourly chart from looking like noise.
 */
function weightedTimestamp(startMs: number, spanMs: number): number {
  const raw = startMs + Math.random() * spanMs;
  const hour = new Date(raw).getHours();
  const busy = hour >= 9 && hour <= 22;
  if (busy || Math.random() < 0.25) return Math.round(raw);
  // Re-roll quiet hours once, which thins the small hours without emptying them.
  return Math.round(startMs + Math.random() * spanMs);
}

function buildEvent(profile: ProviderProfile, ts: number, correlationId: string): UsageEvent {
  const failed = Math.random() < profile.errorRate;
  const durationMs = Math.round(
    failed ? between(profile.durationMs[0], profile.durationMs[1]) * 0.4 : between(profile.durationMs[0], profile.durationMs[1]),
  );

  const event: UsageEvent = {
    eventId: randomUUID(),
    ts,
    service: profile.service,
    provider: profile.provider,
    feature: profile.feature,
    durationMs,
    status: failed ? "error" : "ok",
    correlationId,
    // Every seeded event says so. Fake data that cannot be told apart from
    // real data is worse than no data: it gets read, believed, and acted on.
    metadata: { [SEEDED_METADATA_KEY]: true },
  };

  if (profile.model) event.model = profile.model;
  if (profile.endpoint) event.endpoint = profile.endpoint;

  if (failed) {
    const kind = profile.errorKinds[Math.floor(Math.random() * profile.errorKinds.length)]!;
    event.errorKind = kind;
    event.errorMessage = `${profile.provider} call failed: ${kind.replace(/_/g, " ")}`;
    event.httpStatus = kind.startsWith("http_") ? Number.parseInt(kind.slice(5), 10) : 429;
    return event;
  }

  event.httpStatus = 200;

  if (profile.tokens) {
    const total = Math.round(between(profile.tokens[0], profile.tokens[1]));
    const output = Math.round(total * between(0.08, 0.3));
    event.tokens = {
      input: total - output,
      output,
      cachedInput: Math.random() < 0.3 ? Math.round((total - output) * 0.4) : 0,
      reasoning: 0,
      total,
    };
    if (profile.pricePerKTokens !== undefined) {
      // The CLI reports a real figure; everything else is priced from a table.
      event.costUsd = Number(((total / 1_000) * profile.pricePerKTokens).toFixed(6));
      event.costBasis = profile.provider === "claude-cli" ? "measured" : "rate-table";
    }
  }

  return event;
}

const eventCount = argValue("--events", 4_000);
const days = argValue("--days", 7);
const reset = process.argv.includes("--reset");

const store = new SqliteUsageStore(usageDatabasePath());

if (reset) {
  const removed = store.purgeOlderThan(Date.now() + 1);
  console.log(`Cleared ${removed} existing event(s).`);
}

const spanMs = days * 86_400_000;
const startMs = Date.now() - spanMs;

// One correlation id per ~6 calls, imitating a pipeline run's worth of work.
const events: UsageEvent[] = [];
let correlationId = `run-${randomUUID().slice(0, 8)}`;
for (let index = 0; index < eventCount; index += 1) {
  if (index % 6 === 0) correlationId = `run-${randomUUID().slice(0, 8)}`;
  const profile = pickProfile();
  events.push(buildEvent(profile, weightedTimestamp(startMs, spanMs), correlationId));
}

const BATCH = 500;
let accepted = 0;
for (let index = 0; index < events.length; index += BATCH) {
  accepted += store.ingest(events.slice(index, index + BATCH)).accepted;
}

const summary = store.summary({});
console.log(`Seeded ${accepted} event(s) across ${days} day(s) into ${usageDatabasePath()}`);
console.log(
  `Now holding ${summary.calls} call(s), ${summary.errors} error(s), ` +
    `$${summary.costUsd.toFixed(2)} priced, ${summary.unpricedCalls} unpriced, ` +
    `p95 ${summary.durationMs.p95} ms`,
);
store.close();
