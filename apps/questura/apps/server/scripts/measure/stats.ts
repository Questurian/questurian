import type { Outcome, Sample } from './sample'

export const OUTCOMES: Outcome[] = [
  'ok',
  'throttled',
  'client-error',
  'server-error',
  'invalid-body',
  'timeout',
  'transport',
]

export type Distribution = {
  n: number
  p50: number | null
  p95: number | null
  p99: number | null
  min: number | null
  max: number | null
}

/** A diagnostic the server never reported is `unavailable`, not zero. */
export type Observed = { median: number | null; max: number | null; reported: number }

export type StepSummary = {
  step: string
  /** Measured samples only; warmup never appears here. */
  measured: number
  outcomes: Record<Outcome, number>
  /** Fraction of measured samples that were not `ok`. */
  failureRate: number
  /** Latency of successful responses only. */
  okLatency: Distribution
  /** Latency of everything else, so a slow failure is visible without polluting `okLatency`. */
  failedLatency: Distribution
  bytes: Observed
  statements: Observed
  statementMs: Observed
  reads: Observed
  poolWaitMs: Observed
  cacheControl: string | null
  cacheStatuses: Record<string, number>
  errors: Record<string, number>
}

export function percentile(sorted: number[], fraction: number): number | null {
  if (sorted.length === 0) return null
  const index = Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)
  return sorted[Math.max(0, index)]!
}

export function distribution(values: number[]): Distribution {
  const sorted = [...values].sort((a, b) => a - b)
  return {
    n: sorted.length,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    min: sorted[0] ?? null,
    max: sorted[sorted.length - 1] ?? null,
  }
}

function observed(values: Array<number | null>): Observed {
  const present = values.filter((value): value is number => value !== null)
  const sorted = present.sort((a, b) => a - b)
  return {
    median: percentile(sorted, 0.5),
    max: sorted[sorted.length - 1] ?? null,
    reported: present.length,
  }
}

function emptyOutcomes(): Record<Outcome, number> {
  return Object.fromEntries(OUTCOMES.map((outcome) => [outcome, 0])) as Record<Outcome, number>
}

export function summarizeStep(step: string, samples: Sample[]): StepSummary {
  const measured = samples.filter((sample) => sample.phase === 'measure' && sample.step === step)
  const outcomes = emptyOutcomes()
  const cacheStatuses: Record<string, number> = {}
  const errors: Record<string, number> = {}

  for (const sample of measured) {
    outcomes[sample.outcome] += 1
    if (sample.cacheStatus) cacheStatuses[sample.cacheStatus] = (cacheStatuses[sample.cacheStatus] ?? 0) + 1
    if (sample.error) errors[sample.error] = (errors[sample.error] ?? 0) + 1
  }

  const ok = measured.filter((sample) => sample.outcome === 'ok')
  const failed = measured.filter((sample) => sample.outcome !== 'ok')

  return {
    step,
    measured: measured.length,
    outcomes,
    failureRate: measured.length === 0 ? 0 : failed.length / measured.length,
    okLatency: distribution(ok.map((sample) => sample.ms)),
    failedLatency: distribution(failed.map((sample) => sample.ms)),
    // Byte and cost counts come from successful responses: an error page's
    // size says nothing about what the content costs to serve.
    bytes: observed(ok.map((sample) => sample.bytes)),
    statements: observed(ok.map((sample) => sample.statements)),
    statementMs: observed(ok.map((sample) => sample.statementMs)),
    reads: observed(ok.map((sample) => sample.reads)),
    poolWaitMs: observed(ok.map((sample) => sample.poolWaitMs)),
    cacheControl: ok[ok.length - 1]?.cacheControl ?? null,
    cacheStatuses,
    errors,
  }
}

export type Throughput = {
  /** Iterations the schedule asked to start. */
  offered: number
  /** Iterations actually started. */
  started: number
  /** Arrivals refused because `maxInFlight` iterations were already running. */
  dropped: number
  /** Requests that finished (any outcome) in the measured window. */
  completedRequests: number
  okRequests: number
  elapsedS: number
  offeredPerS: number
  completedPerS: number
  okPerS: number
  /** Generator lateness: how far behind schedule iterations started. */
  lateness: Distribution
  /**
   * True when the generator itself could not keep up, so the server was
   * offered less than the schedule says. A run like that measured the
   * load generator.
   */
  generatorSaturated: boolean
}

export function throughput(input: {
  samples: Sample[]
  offered: number
  started: number
  dropped: number
  elapsedS: number
}): Throughput {
  const measured = input.samples.filter((sample) => sample.phase === 'measure')
  const ok = measured.filter((sample) => sample.outcome === 'ok')
  const lateness = distribution(measured.map((sample) => sample.lateMs))
  const elapsed = Math.max(input.elapsedS, 1e-9)

  return {
    offered: input.offered,
    started: input.started,
    dropped: input.dropped,
    completedRequests: measured.length,
    okRequests: ok.length,
    elapsedS: input.elapsedS,
    offeredPerS: input.offered / elapsed,
    completedPerS: measured.length / elapsed,
    okPerS: ok.length / elapsed,
    lateness,
    // 50 ms of p95 lag on a timer that should fire on time means the
    // generator's own event loop is the bottleneck.
    generatorSaturated: (lateness.p95 ?? 0) > 50,
  }
}
