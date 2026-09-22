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

const broken = results.filter((result) => !result.ok)
process.stdout.write(`\n${results.length - broken.length}/${results.length} negative controls behaved as required.\n`)
if (broken.length > 0) {
  process.stdout.write(`Gates that do not detect what they claim: ${broken.map((r) => r.fault).join(', ')}\n`)
  process.exit(1)
}
