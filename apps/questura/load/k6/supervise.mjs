#!/usr/bin/env node
// The stop controller k6 thresholds cannot be (surge plan L08).
//
// k6 thresholds are cumulative over the whole run, so "stop once failures
// pass 1%" really means "once total failures since the start pass 1%": an
// hour of healthy traffic dilutes a sharp failure and the run escalates into
// a broken backend. They also cannot see a wrong-but-200 page, a growing
// queue inside the server, or a telemetry feed that went quiet. A run that
// cannot be stopped for those reasons cannot be trusted to spend a budget.
//
// So k6 runs under this supervisor, which:
//
//  - validates every stop setting before anything starts (exit 64);
//  - reads k6's JSON metric stream: HTTP outcomes into a rolling window,
//    `questura_correctness` (tagged by class) as an immediate stop,
//    `dropped_iterations` as generator saturation;
//  - polls each declared backend instance's `/api/internal/db-stats`
//    directly — never through a balancer that could hide half the fleet —
//    and applies the queue-growth, missing-telemetry and restart rules per
//    instance, never to a fleet average;
//  - stops k6 with SIGINT, then SIGKILL after a grace period, and reports
//    one reason and one exit code (`supervisor/policy.mjs` lists them);
//  - writes a bounded JSON summary (`SUPERVISOR_SUMMARY`) with offered,
//    successful and refused counts and fractions, kept separate.
//
//   TELEMETRY_INSTANCES=backend-1=http://127.0.0.1:4100/api/internal/db-stats \
//   DB_STATS_SECRET=... RUN_KIND=capacity SUCCESS_FLOOR_RPS=20 \
//   node supervise.mjs launch-journeys.js -- -e RATE=30
//
// Run kinds: `correctness` (default; closed or open, no capacity claim),
// `capacity` (open arrivals, dropped arrivals and a missed success floor
// fail it), `containment` (deliberate overload: refusals are expected and
// reported, correctness and resource rules still stop it).

import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'

import { createPolicy, EXIT, readSettings } from './supervisor/policy.mjs'

const { settings, problems } = readSettings(process.env)
const [script, ...rest] = process.argv.slice(2)
if (!script) problems.push('usage: node supervise.mjs <k6-script.js> [-- k6 args...]')
if (problems.length > 0) {
  console.error(`[supervise] refusing to start:\n  - ${problems.join('\n  - ')}`)
  process.exit(EXIT.config)
}
const k6Args = rest[0] === '--' ? rest.slice(1) : rest

const startedAt = Date.now()
const policy = createPolicy(settings, startedAt)
let stopping = false
let stoppedAt = null

function halt(decision) {
  if (!decision || stopping) return
  stopping = true
  stoppedAt = Date.now()
  console.error(`\n[supervise] stopping the run (${decision.code}): ${decision.reason}`)
  k6.kill('SIGINT')
  setTimeout(() => {
    if (k6.exitCode === null) k6.kill('SIGKILL')
  }, settings.ABORT_GRACE_MS).unref()
}

const k6 = spawn('k6', ['run', '--out', 'json=-', ...k6Args, script], {
  stdio: ['inherit', 'pipe', 'inherit'],
  env: process.env,
})

createInterface({ input: k6.stdout }).on('line', (line) => {
  if (!line.startsWith('{')) return
  let event
  try {
    event = JSON.parse(line)
  } catch {
    return
  }
  if (event.type !== 'Point' || !event.data) return
  const at = Date.parse(event.data.time)
  const tags = event.data.tags || {}

  if (event.metric === 'http_req_failed') {
    halt(policy.http(at, event.data.value === 1, Number(tags.status)))
  } else if (event.metric === 'questura_correctness' && event.data.value > 0) {
    halt(policy.correctness(at, tags.class || 'unclassified', event.data.value))
  } else if (event.metric === 'dropped_iterations' && event.data.value > 0) {
    halt(policy.dropped(at, event.data.value))
  }
})

// Per-instance telemetry, fetched directly from each process.
const secret = process.env.DB_STATS_SECRET || ''
async function poll(instance) {
  try {
    const response = await fetch(instance.url, {
      headers: secret ? { authorization: `Bearer ${secret}` } : {},
      signal: AbortSignal.timeout(Math.max(500, settings.TELEMETRY_INTERVAL_MS)),
    })
    if (!response.ok) return // counted as missing by the gap rule
    halt(policy.sample(Date.now(), instance.id, await response.json()))
  } catch {
    // Unreachable or unparseable: the gap rule decides when that matters.
  }
}
const poller = setInterval(() => {
  for (const instance of settings.instances) void poll(instance)
}, settings.TELEMETRY_INTERVAL_MS)
const ticker = setInterval(() => halt(policy.tick(Date.now())), 250)

k6.on('exit', (code, signal) => {
  clearInterval(poller)
  clearInterval(ticker)
  const now = Date.now()
  const floor = stopping ? null : policy.finish(now)
  const summary = {
    ...policy.summary(now),
    k6Exit: code ?? (signal ? `signal ${signal}` : null),
    stopLatencyMs: stoppedAt ? now - stoppedAt : null,
    settings: Object.fromEntries(Object.entries(settings).filter(([name]) => name !== 'instances')),
    instancesDeclared: settings.instances.map((instance) => instance.id),
  }
  if (process.env.SUPERVISOR_SUMMARY) writeFileSync(process.env.SUPERVISOR_SUMMARY, JSON.stringify(summary, null, 2) + '\n')

  const decision = policy.state.stop
  if (decision) {
    console.error(`[supervise] run stopped (${decision.code}): ${decision.reason}`)
    process.exit(decision.code)
  }
  if (floor) {
    console.error(`[supervise] ${floor.reason}`)
    process.exit(floor.code)
  }
  process.exit(code ?? (signal ? 1 : 0))
})
