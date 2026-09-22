#!/usr/bin/env node
// The rolling-window stop that k6 thresholds cannot express.
//
// The proof matrix asks for "stop once unexpected errors pass 1% for 60
// seconds". A k6 threshold is evaluated over the whole run so far, so
// `rate<0.01 delayAbortEval=60s` actually means "stop once *total* failures
// since the start exceed 1%". Those differ in the direction that matters: an
// hour of healthy traffic dilutes a sharp failure so far that the cumulative
// rate never crosses 1%, and the run keeps escalating into a backend that is
// already broken. On a billed run that is money spent proving nothing.
//
// So k6 runs under this supervisor, which reads the streamed JSON metrics,
// keeps a sixty-second window of request outcomes, and kills the run when the
// window's failure rate crosses the limit with enough samples to mean
// something. It also stops on a growing connection-pool wait and on a wall
// clock, because "it did not fail, it just never finished" is the other way a
// run wastes a budget.
//
//   node supervise.mjs cold-heavy.js -- --vus 10
//
// Exit codes: k6's own, or 90 when the supervisor stopped the run.

import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'

const WINDOW_MS = Number(process.env.ABORT_WINDOW_MS ?? 60_000)
const LIMIT = Number(process.env.ABORT_FAILURE_RATE ?? 0.01)
const MIN_SAMPLES = Number(process.env.ABORT_MIN_SAMPLES ?? 200)
const MAX_RUN_MS = Number(process.env.ABORT_MAX_RUN_MS ?? 3 * 60 * 60 * 1000)
const SUPERVISOR_EXIT = 90

const [script, ...rest] = process.argv.slice(2)
if (!script) {
  console.error('usage: node supervise.mjs <k6-script.js> [-- k6 args...]')
  process.exit(2)
}
const k6Args = rest[0] === '--' ? rest.slice(1) : rest

/** Outcomes in the window: [timestampMs, failed ? 1 : 0]. */
const window = []
/** Pool waiters in the window: [timestampMs, waiting]. */
const poolWaiting = []
let stopped = null

function observe(atMs, failed) {
  window.push([atMs, failed ? 1 : 0])
  const cutoff = atMs - WINDOW_MS
  while (window.length && window[0][0] < cutoff) window.shift()

  if (window.length < MIN_SAMPLES) return
  const failures = window.reduce((total, entry) => total + entry[1], 0)
  const rate = failures / window.length
  if (rate > LIMIT) {
    stop(
      `failure rate ${(rate * 100).toFixed(2)}% over the last ${WINDOW_MS / 1000}s ` +
        `(${failures}/${window.length} requests) exceeds ${(LIMIT * 100).toFixed(2)}%`,
    )
  }
}

function stop(reason) {
  if (stopped) return
  stopped = reason
  console.error(`\n[supervise] stopping the run: ${reason}`)
  k6.kill('SIGINT')
  // k6 drains on SIGINT; if it does not, take it down rather than keep paying.
  setTimeout(() => k6.kill('SIGKILL'), 20_000).unref()
}

const k6 = spawn('k6', ['run', '--out', 'json=-', ...k6Args, script], {
  stdio: ['inherit', 'pipe', 'inherit'],
  env: process.env,
})

const deadline = setTimeout(() => stop(`wall clock exceeded ${MAX_RUN_MS / 1000}s`), MAX_RUN_MS)
deadline.unref()

createInterface({ input: k6.stdout }).on('line', (line) => {
  if (!line.startsWith('{')) return
  let event
  try {
    event = JSON.parse(line)
  } catch {
    return
  }
  if (event.type !== 'Point' || !event.data) return

  if (event.metric === 'http_req_failed') {
    observe(Date.parse(event.data.time), event.data.value === 1)
    return
  }

  // A pool that is queueing and not draining is a failure the response codes
  // have not caught up with yet.
  if (event.metric === 'questura_pool_waiting' && event.data.value > 0) {
    poolWaiting.push([Date.parse(event.data.time), event.data.value])
    const cutoff = Date.parse(event.data.time) - WINDOW_MS
    while (poolWaiting.length && poolWaiting[0][0] < cutoff) poolWaiting.shift()
    const rising = poolWaiting.length > 10 && poolWaiting[poolWaiting.length - 1][1] > poolWaiting[0][1] * 2
    if (rising) stop('connection-pool waiters doubled within the window and are still rising')
  }
})

k6.on('exit', (code, signal) => {
  clearTimeout(deadline)
  if (stopped) {
    console.error(`[supervise] run stopped by the supervisor: ${stopped}`)
    process.exit(SUPERVISOR_EXIT)
  }
  process.exit(code ?? (signal ? 1 : 0))
})
