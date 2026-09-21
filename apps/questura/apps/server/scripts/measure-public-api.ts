/**
 * Load harness for Questura's public surface.
 *
 * Replaces the original sampler, which mixed every status into one latency
 * distribution (a fast 429 made p95 look better), excluded exactly one sample
 * as "cold" even when a concurrent batch sent several, had no request
 * deadline, and could only model callers waiting on each other.
 *
 * Now:
 *   - warmup requests are labelled and never enter a summary;
 *   - latency is reported for successful responses only, with every other
 *     outcome (throttled, 4xx, 5xx, invalid body, timeout, transport) counted;
 *   - every request has a deadline that also covers the body;
 *   - `--mode arrival` starts iterations on a schedule and counts arrivals it
 *     had to drop, so offered and completed throughput are both reported;
 *   - scenarios are JSON files in `scripts/measure/scenarios/`, and each step
 *     says what the intended content looks like.
 *
 * Counts from `Server-Timing` need `PUBLIC_API_DIAGNOSTICS=1` on the server,
 * or (outside production) the `x-questura-diagnostics` header this sends.
 * Pool occupancy is sampled from `/api/internal/db-stats` when
 * `DB_STATS_SECRET` is set in this process's environment.
 *
 * Usage (from apps/questura/apps/server):
 *   pnpm measure:api
 *   pnpm measure:api -- --scenario public-api --runs 20 --concurrent 4
 *   pnpm measure:api -- --scenario cold-content --cache cold --runs 1
 *   pnpm measure:api -- --scenario hot-pages --mode arrival --rate 50 --duration 60
 *   pnpm measure:api -- --json ../../docs/capacity/runs/x.json --label "prod build, local"
 *
 * Full guide: apps/questura/docs/capacity/README.md.
 */

import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { ArgumentError, parseArgs } from './measure/args'
import { startPoolSampler } from './measure/pool-sampler'
import { htmlReport, textReport, type Evidence } from './measure/report'
import { runArrival, runClosed, uniqueSteps } from './measure/run'
import { validateScenario } from './measure/scenario'
import { summarizeStep, throughput } from './measure/stats'

const here = path.dirname(fileURLToPath(import.meta.url))

function gitSha(): string {
  try {
    const sha = execSync('git rev-parse --short HEAD', { cwd: here, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
    const dirty = execSync('git status --porcelain', { cwd: here, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
    return dirty ? `${sha}-dirty` : sha
  } catch {
    return 'unknown'
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const scenarioPath = path.join(here, 'measure', 'scenarios', `${args.scenario}.json`)
  const scenario = validateScenario(JSON.parse(readFileSync(scenarioPath, 'utf8')), scenarioPath)

  const secret = process.env.DB_STATS_SECRET?.trim()
  const sampler = secret ? startPoolSampler(args.base, secret) : null

  const takenAt = new Date().toISOString()
  const result =
    args.mode === 'arrival'
      ? await runArrival(scenario, args, { log: console.log })
      : await runClosed(scenario, args, { log: console.log })

  const pool = sampler ? await sampler.stop() : null

  const evidence: Evidence = {
    meta: {
      takenAt,
      sha: gitSha(),
      scenario: scenario.name,
      scenarioDescription: scenario.description,
      node: process.version,
      generatorHost: `${os.platform()} ${os.arch()} ${os.cpus().length} cpus`,
      label: args.label || null,
      warmupSamples: result.samples.filter((sample) => sample.phase === 'warmup').length,
      poolScope: pool ? pool.scope : 'unavailable',
    },
    args,
    throughput: throughput({
      samples: result.samples,
      offered: result.offered,
      started: result.started,
      dropped: result.dropped,
      elapsedS: result.elapsedS,
    }),
    steps: uniqueSteps(scenario).map((step) => summarizeStep(step.name, result.samples)),
    pool,
    aborted: result.aborted,
  }

  console.log(textReport(evidence))

  if (args.jsonPath) {
    writeFileSync(args.jsonPath, JSON.stringify(evidence, null, 2))
    console.log(`\nJSON: ${args.jsonPath}`)
  }
  if (args.htmlPath) {
    writeFileSync(args.htmlPath, htmlReport(evidence))
    console.log(`HTML: ${args.htmlPath}`)
  }

  // A run that aborted, or where nothing succeeded, must not exit clean: a
  // script chaining this would otherwise record a failure as evidence.
  const anyOk = evidence.steps.some((step) => step.outcomes.ok > 0)
  if (result.aborted || !anyOk) process.exit(2)
}

main().catch((error) => {
  if (error instanceof ArgumentError) {
    console.error(`measure:api: ${error.message}`)
    process.exit(64)
  }
  console.error(error)
  process.exit(1)
})
