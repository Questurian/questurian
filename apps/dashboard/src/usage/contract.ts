import { z } from "zod";

/**
 * The API-usage wire contract, version 1.
 *
 * This file is the single source of truth for what an emitter may send. Any
 * future shared client is generated from these types rather than importing
 * them -- nested monorepos in this repo do not import each other's code, so
 * the coupling stays HTTP plus this document.
 *
 * Two rules make the contract survivable:
 *  - Only `ts`, `service`, `provider` and `status` are required. Everything
 *    else is optional, because a non-AI call has no model and a failed call
 *    has no tokens.
 *  - Unknown keys are kept, not rejected (see `parseUsageEvent`). An emitter
 *    newer than the collector must never lose data on the floor.
 */

export const USAGE_SCHEMA_VERSION = 1;

/** Wire cap. A batch bigger than this is rejected whole. */
export const MAX_EVENTS_PER_BATCH = 500;

/** Error messages are stored for reading, not for archiving stack traces. */
export const MAX_ERROR_MESSAGE_CHARS = 1_000;

export const usageStatuses = ["ok", "error"] as const;
export type UsageStatus = (typeof usageStatuses)[number];

/**
 * How a cost figure was arrived at. Mirrors Prompt2Blog's vocabulary
 * (`COST_BASIS_MEASURED` / `COST_BASIS_RATE_TABLE`) on purpose: the same word
 * must mean the same thing on both sides of the wire.
 */
export const costBases = ["measured", "rate-table"] as const;
export type CostBasis = (typeof costBases)[number];

const tokensSchema = z
  .object({
    input: z.number().int().nonnegative().optional(),
    output: z.number().int().nonnegative().optional(),
    cachedInput: z.number().int().nonnegative().optional(),
    reasoning: z.number().int().nonnegative().optional(),
    total: z.number().int().nonnegative().optional(),
  })
  .strict();

export type UsageTokens = z.infer<typeof tokensSchema>;

/** Epoch milliseconds. Anything outside this window is a clock bug, not data. */
const TS_FLOOR_MS = Date.UTC(2020, 0, 1);
const TS_CEILING_SKEW_MS = 24 * 60 * 60 * 1000;

const timestampSchema = z
  .number()
  .int()
  .refine((value) => value >= TS_FLOOR_MS, {
    message: "ts is before 2020; it is probably seconds, not milliseconds",
  })
  .refine((value) => value <= Date.now() + TS_CEILING_SKEW_MS, {
    message: "ts is more than a day in the future",
  });

const identifier = (max: number) => z.string().trim().min(1).max(max);

export const usageEventSchema = z.object({
  /** Caller-supplied idempotency key. A replay of the same id is ignored. */
  eventId: identifier(128).optional(),
  ts: timestampSchema,
  /** Which of OUR apps made the call, e.g. "abw-backend". */
  service: identifier(64),
  /** The external service that was called, e.g. "google-vertex". */
  provider: identifier(64),
  /** What we were doing, e.g. "prompt2blog". */
  feature: identifier(64).optional(),
  /** For non-AI calls: the path or operation name. */
  endpoint: identifier(256).optional(),
  /** For AI calls: the model. */
  model: identifier(128).optional(),
  durationMs: z.number().int().nonnegative().max(24 * 60 * 60 * 1000).optional(),
  status: z.enum(usageStatuses),
  httpStatus: z.number().int().min(100).max(599).optional(),
  errorKind: identifier(64).optional(),
  errorMessage: z.string().max(20_000).optional(),
  tokens: tokensSchema.optional(),
  costUsd: z.number().nonnegative().optional(),
  costBasis: z.enum(costBases).optional(),
  /** Ties several calls to one unit of work, e.g. a Prompt2Blog run id. */
  correlationId: identifier(128).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type UsageEvent = z.infer<typeof usageEventSchema>;

export const usageBatchSchema = z.object({
  events: z.array(z.unknown()).min(1).max(MAX_EVENTS_PER_BATCH),
});

export interface UsageIngestRejection {
  index: number;
  message: string;
}

export interface UsageIngestResult {
  accepted: number;
  duplicates: number;
  rejected: number;
  errors: UsageIngestRejection[];
}

/**
 * Metadata key that marks an event as synthetic.
 *
 * The seed script sets it on every event it writes. Nothing else may: it is
 * the one thing that lets the UI say out loud that what you are reading did
 * not happen, which is worth more than any amount of care about remembering
 * which database you are looking at.
 */
export const SEEDED_METADATA_KEY = "seeded";

const knownEventKeys = new Set(Object.keys(usageEventSchema.shape));

export interface ParsedUsageEvent {
  event: UsageEvent;
  /** Keys the emitter sent that this collector version does not know. */
  unknownKeys: string[];
}

/**
 * Validate one event, folding anything unrecognised into `metadata._unknown`
 * instead of failing. A collector that rejects a newer emitter's payload turns
 * a schema addition into silent data loss on the producer side, where nobody
 * is watching.
 */
export function parseUsageEvent(input: unknown): ParsedUsageEvent {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("event must be an object");
  }

  const raw = input as Record<string, unknown>;
  const unknownKeys = Object.keys(raw).filter((key) => !knownEventKeys.has(key));
  const known: Record<string, unknown> = {};
  for (const key of knownEventKeys) {
    if (key in raw && raw[key] !== null && raw[key] !== undefined) {
      known[key] = raw[key];
    }
  }

  const parsed = usageEventSchema.parse(known);

  if (parsed.errorMessage && parsed.errorMessage.length > MAX_ERROR_MESSAGE_CHARS) {
    parsed.errorMessage = `${parsed.errorMessage.slice(0, MAX_ERROR_MESSAGE_CHARS - 1)}…`;
  }

  if (unknownKeys.length > 0) {
    const preserved: Record<string, unknown> = {};
    for (const key of unknownKeys) preserved[key] = raw[key];
    parsed.metadata = { ...(parsed.metadata ?? {}), _unknown: preserved };
  }

  return { event: parsed, unknownKeys };
}

/** Human-readable reason a validation failed, without a zod dump. */
export function describeValidationError(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues
      .map((issue) => {
        const path = issue.path.join(".");
        return path ? `${path}: ${issue.message}` : issue.message;
      })
      .join("; ");
  }
  return error instanceof Error ? error.message : String(error);
}
