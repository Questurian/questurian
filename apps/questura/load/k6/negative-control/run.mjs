#!/usr/bin/env node
// Negative controls: prove each proof gate can fail.
//
// For every fault mode, start the fake target, run the probe, and require a
// nonzero k6 exit. A mode that comes back green means the corresponding gate
// does not check what it says it checks — which is exactly the state L13
// found the harness in.
//
//   node negative-control/run.mjs
//
// No network beyond loopback, no k6 cloud, nothing billed.

import { spawn } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const PORT = 3199

/** `none` must pass; every other mode must fail. */
const MODES = [
  ['none', 'pass'],
  ['wrong-content', 'fail'],
  ['wrong-redirect', 'fail'],
  ['identity-lies', 'fail'],
  ['member-body-to-anonymous', 'fail'],
  ['private-is-cacheable', 'fail'],
  ['cacheable-with-cookie', 'fail'],
  ['reader-throttled', 'fail'],
]

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function startTarget(fault) {
  const child = spawn(process.execPath, [resolve(here, 'fake-target.mjs')], {
    env: { ...process.env, FAULT: fault, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  await new Promise((done) => child.stdout.once('data', done))
  await sleep(100)
  return child
}

function runK6() {
  return new Promise((done) => {
    const child = spawn('k6', ['run', '--quiet', resolve(here, 'probe.js')], {
      env: {
        ...process.env,
        WORKLOAD: resolve(here, '..', 'workloads', 'negative-control.json'),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    child.stdout.on('data', (chunk) => (output += chunk))
    child.stderr.on('data', (chunk) => (output += chunk))
    child.on('exit', (code) => done({ code: code ?? 1, output }))
  })
}

const results = []

for (const [fault, expected] of MODES) {
  const target = await startTarget(fault)
  const { code, output } = await runK6()
  target.kill('SIGTERM')
  await sleep(100)

  const actual = code === 0 ? 'pass' : 'fail'
  const ok = actual === expected
  results.push({ fault, expected, actual, ok })
  process.stdout.write(`${ok ? '  ok  ' : ' FAIL '} ${fault.padEnd(26)} expected ${expected}, k6 exited ${code}\n`)
  if (!ok) process.stdout.write(output.split('\n').slice(-25).join('\n') + '\n')
}

// ---------------------------------------------------------------------------
// Preflight controls: settings that must be refused before any load starts.
// Each of these used to produce a run that looked like a pass.
// ---------------------------------------------------------------------------

const WORKLOAD_PATH = resolve(here, '..', 'workloads', 'negative-control.json')

const PREFLIGHT = [
  ['SCALE=abc', { SCALE: 'abc', WORKLOAD: WORKLOAD_PATH }, 'probe.js'],
  ['SCALE=0', { SCALE: '0', WORKLOAD: WORKLOAD_PATH }, 'probe.js'],
  ['TIME_SCALE=-1', { TIME_SCALE: '-1', WORKLOAD: WORKLOAD_PATH }, 'probe.js'],
  ['no workload manifest', { WORKLOAD: '' }, 'probe.js'],
  ['empty URL list', { WORKLOAD: WORKLOAD_PATH, URLS: '  ' }, 'probe.js'],
  ['path without a leading slash', { WORKLOAD: WORKLOAD_PATH, URLS: 'peru/lima' }, 'probe.js'],
  ['signed-in share with no session', { WORKLOAD: WORKLOAD_PATH }, '../signed-in-mix.js'],
  ['cold corpus too small', { WORKLOAD: WORKLOAD_PATH }, '../cold-heavy.js'],
]

function runScript(script, env) {
  return new Promise((done) => {
    const child = spawn('k6', ['run', '--quiet', resolve(here, script)], {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    child.stdout.on('data', (chunk) => (output += chunk))
    child.stderr.on('data', (chunk) => (output += chunk))
    child.on('exit', (code) => done({ code: code ?? 1, output }))
  })
}

process.stdout.write('\nPreflight refusals (no load should start):\n')
const target = await startTarget('none')
for (const [label, env, script] of PREFLIGHT) {
  const { code } = await runScript(script, env)
  const ok = code !== 0
  results.push({ fault: `preflight: ${label}`, expected: 'fail', actual: ok ? 'fail' : 'pass', ok })
  process.stdout.write(`${ok ? '  ok  ' : ' FAIL '} ${label.padEnd(34)} k6 exited ${code}\n`)
}
target.kill('SIGTERM')
await sleep(100)

// ---------------------------------------------------------------------------
// Supervisor controls (surge plan L08): each stop reason must fire for the
// reason it names — exact exit code — and stop within a bounded time. One
// benign control must NOT stop.
// ---------------------------------------------------------------------------

function runSupervised(env) {
  return new Promise((done) => {
    const started = Date.now()
    const summary = resolve(here, `.summary-${process.pid}.json`)
    const child = spawn(process.execPath, [resolve(here, '..', 'supervise.mjs'), resolve(here, 'probe-supervised.js'), '--', '--quiet'], {
      env: {
        ...process.env,
        WORKLOAD: WORKLOAD_PATH,
        TELEMETRY_INSTANCES: `fake-1=http://127.0.0.1:${PORT}/api/internal/db-stats`,
        ABORT_GRACE_MS: '5000',
        ABORT_TELEMETRY_GAP_MS: '2000',
        ABORT_QUEUE_SUSTAIN_MS: '3000',
        TELEMETRY_INTERVAL_MS: '500',
        ABORT_MIN_SAMPLES: '50',
        SUPERVISOR_SUMMARY: summary,
        ...env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    child.stdout.on('data', (chunk) => (output += chunk))
    child.stderr.on('data', (chunk) => (output += chunk))
    child.on('exit', (code) => {
      let parsed = null
      try {
        parsed = JSON.parse(readFileSync(summary, 'utf8'))
      } catch {
        // No summary: the settings were refused before a run existed.
      }
      rmSync(summary, { force: true })
      done({ code: code ?? 1, output, elapsedMs: Date.now() - started, summary: parsed })
    })
  })
}

const SUPERVISED = [
  // [label, fault, env, expected exit, reason fragment]
  ['wrong 200 body', 'wrong-content', {}, 91, 'wrong_content'],
  ['leaked member marker', 'member-body-to-anonymous', {}, 91, 'privacy'],
  ['identity that lies', 'identity-lies', { PROBE_SIGNED_IN: '1' }, 91, 'identity'],
  ['private response marked cacheable', 'private-is-cacheable', {}, 91, 'cache_policy'],
  ['refusal without Retry-After', 'refusal-without-retry-after', {}, 91, 'refusal_policy'],
  ['queue growth on the instance', 'queue-growth', {}, 92, 'queue'],
  ['telemetry that stops answering', 'telemetry-missing', {}, 93, 'no telemetry'],
  ['telemetry from a stranger', 'unknown-instance', {}, 93, 'answered as stranger'],
  ['invalid abort setting', 'none', { ABORT_FAILURE_RATE: 'abc' }, 64, null],
  ['all-503 claimed as capacity', 'all-503', { RUN_KIND: 'capacity', SUCCESS_FLOOR_RPS: '5', PROBE_DURATION: '6s', ABORT_FAILURE_RATE: '1' }, 97, 'below the declared floor'],
  ['generator saturation', 'slow', { RUN_KIND: 'capacity', SUCCESS_FLOOR_RPS: '1', PROBE_RATE: '30', PROBE_VUS: '2' }, 95, 'dropped'],
  ['benign short spike (must not stop)', 'benign-spike', { PROBE_DURATION: '8s' }, 0, null],
]

process.stdout.write('\nSupervisor stops (exact reason, bounded stop):\n')
for (const [label, fault, env, expectedCode, fragment] of SUPERVISED) {
  const target = await startTarget(fault)
  const { code, output, summary } = await runSupervised(env)
  target.kill('SIGTERM')
  await sleep(100)

  const reason = summary && summary.stop ? summary.stop.reason : ''
  const reasonOk = fragment === null || reason.includes(fragment) || output.includes(fragment)
  const stopLatency = summary ? summary.stopLatencyMs : null
  const boundedOk = stopLatency === null || stopLatency < 5_000 + 5_000
  const ok = code === expectedCode && reasonOk && boundedOk
  results.push({ fault: `supervisor: ${label}`, expected: String(expectedCode), actual: String(code), ok })
  process.stdout.write(
    `${ok ? '  ok  ' : ' FAIL '} ${label.padEnd(36)} exit ${code} (want ${expectedCode})` +
      `${stopLatency !== null ? `, stopped ${stopLatency}ms after the decision` : ''}${reason ? ` — ${reason}` : ''}\n`,
  )
  if (!ok) process.stdout.write(output.split('\n').slice(-15).join('\n') + '\n')
}

const broken = results.filter((result) => !result.ok)
process.stdout.write(`\n${results.length - broken.length}/${results.length} negative controls behaved as required.\n`)
if (broken.length > 0) {
  process.stdout.write(`Gates that do not detect what they claim: ${broken.map((r) => r.fault).join(', ')}\n`)
  process.exit(1)
}
