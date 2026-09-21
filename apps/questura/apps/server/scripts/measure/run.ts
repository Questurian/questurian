/**
 * The two ways to offer load.
 *
 * Closed: a fixed number of callers, each waiting for its answer before asking
 * again. Good for "what does one request cost", useless for capacity, because
 * a slower server receives fewer requests and so looks healthier than it is.
 *
 * Arrival: iterations start on a schedule whatever the server is doing. If
 * the server slows, work piles up in flight, which is what a campaign does to
 * it. When `maxInFlight` is reached the arrival is dropped and counted rather
 * than delayed, so the report can say "offered 100/s, completed 61/s, dropped
 * 39/s" instead of quietly offering less.
 */

import type { HarnessArgs } from './args'
import { takeSample, type FetchLike, type Sample } from './sample'
import { pickIteration, stepHeaders, stepUrl, type Scenario, type Step } from './scenario'

export type RunResult = {
  samples: Sample[]
  offered: number
  started: number
  dropped: number
  elapsedS: number
  aborted: string | null
}

type RunOptions = {
  fetchImpl?: FetchLike
  random?: () => number
  log?: (line: string) => void
}

/** Every distinct step in a scenario, first occurrence wins. */
export function uniqueSteps(scenario: Scenario): Step[] {
  const seen = new Map<string, Step>()
  for (const iteration of scenario.iterations) {
    for (const step of iteration.steps) {
      if (!seen.has(step.name)) seen.set(step.name, step)
    }
  }
  return [...seen.values()]
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Stop condition shared by both modes: once enough samples exist, the share of
 * failures over the trailing window exceeds the limit. Cumulative rates hide
 * a collapse that starts late in a long run; a window catches it.
 */
export class AbortGuard {
  private readonly events: Array<{ at: number; failed: boolean }> = []

  constructor(
    private readonly limit: number,
    private readonly minSamples: number,
    private readonly windowMs: number = 60_000,
    private readonly now: () => number = () => performance.now(),
  ) {}

  record(sample: Sample): string | null {
    if (sample.phase !== 'measure' || this.limit >= 1) return null

    const at = this.now()
    this.events.push({ at, failed: sample.outcome !== 'ok' })
    while (this.events.length > 0 && at - this.events[0]!.at > this.windowMs) this.events.shift()

    if (this.events.length < this.minSamples) return null
    const failed = this.events.filter((event) => event.failed).length
    const rate = failed / this.events.length
    return rate > this.limit
      ? `failure rate ${(rate * 100).toFixed(1)}% over the last ${this.events.length} requests exceeded ${(this.limit * 100).toFixed(1)}%`
      : null
  }
}

async function warm(steps: Step[], args: HarnessArgs, samples: Sample[], options: RunOptions) {
  for (const step of steps) {
    for (let index = 0; index < args.warmup; index += 1) {
      samples.push(
        await takeSample(stepUrl(step, args), step, {
          phase: 'warmup',
          timeoutMs: args.timeoutMs,
          headers: stepHeaders(step, args),
          fetchImpl: options.fetchImpl,
        }),
      )
    }
  }
}

export async function runClosed(
  scenario: Scenario,
  args: HarnessArgs,
  options: RunOptions = {},
): Promise<RunResult> {
  const steps = uniqueSteps(scenario)
  const samples: Sample[] = []
  const guard = new AbortGuard(args.abortErrorRate, args.abortMinSamples)
  let aborted: string | null = null

  await warm(steps, args, samples, options)

  const startedAt = performance.now()
  let started = 0

  outer: for (const step of steps) {
    const url = stepUrl(step, args)
    for (let run = 0; run < args.runs; run += 1) {
      const batch = await Promise.all(
        Array.from({ length: args.concurrent }, () =>
          takeSample(url, step, {
            phase: 'measure',
            timeoutMs: args.timeoutMs,
            headers: stepHeaders(step, args),
            fetchImpl: options.fetchImpl,
          }),
        ),
      )
      started += batch.length
      for (const sample of batch) {
        samples.push(sample)
        aborted ??= guard.record(sample)
      }
      if (aborted) break outer
    }
  }

  return {
    samples,
    offered: started,
    started,
    dropped: 0,
    elapsedS: (performance.now() - startedAt) / 1000,
    aborted,
  }
}

export async function runArrival(
  scenario: Scenario,
  args: HarnessArgs,
  options: RunOptions = {},
): Promise<RunResult> {
  const samples: Sample[] = []
  const guard = new AbortGuard(args.abortErrorRate, args.abortMinSamples)
  let aborted: string | null = null

  await warm(uniqueSteps(scenario), args, samples, options)

  const intervalMs = 1000 / args.rate
  const total = Math.round(args.rate * args.durationS)
  const running = new Set<Promise<void>>()
  let offered = 0
  let started = 0
  let dropped = 0

  const runIteration = async (scheduledAt: number) => {
    const iteration = pickIteration(scenario, options.random)
    let lateMs = Math.max(0, performance.now() - scheduledAt)

    for (const [index, step] of iteration.steps.entries()) {
      const sample = await takeSample(stepUrl(step, args), step, {
        phase: 'measure',
        timeoutMs: args.timeoutMs,
        lateMs,
        headers: stepHeaders(step, args),
        fetchImpl: options.fetchImpl,
      })
      samples.push(sample)
      aborted ??= guard.record(sample)
      // Only the first request of a visit is on the schedule; later ones
      // follow think time, so their lateness is not the generator's.
      lateMs = 0
      if (aborted) return
      const think = step.thinkMs ?? 0
      if (think > 0 && index < iteration.steps.length - 1) await sleep(think)
    }
  }

  const startedAt = performance.now()

  while (offered < total && !aborted) {
    const scheduledAt = startedAt + offered * intervalMs
    const wait = scheduledAt - performance.now()
    if (wait > 1) await sleep(wait)

    // Catch up on every arrival whose time has passed; each is either started
    // or dropped, never merged into a later one.
    while (offered < total && startedAt + offered * intervalMs <= performance.now() && !aborted) {
      const at = startedAt + offered * intervalMs
      offered += 1
      if (running.size >= args.maxInFlight) {
        dropped += 1
        continue
      }
      started += 1
      const task = runIteration(at).finally(() => running.delete(task))
      running.add(task)
    }
  }

  const offeringEndedAt = performance.now()
  if (aborted) options.log?.(`Aborting: ${aborted}. Waiting for ${running.size} in-flight iterations.`)
  await Promise.all(running)

  return {
    samples,
    offered,
    started,
    dropped,
    // Throughput is over the window load was offered in. Draining afterwards
    // is reported by the samples themselves, not by stretching the window.
    elapsedS: (offeringEndedAt - startedAt) / 1000,
    aborted,
  }
}
