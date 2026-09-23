import assert from 'node:assert/strict'
import test from 'node:test'

import { createPolicy, EXIT, queueDepth, readSettings } from './policy.mjs'

// Every stop rule, and the fluctuations that must not trip one (surge plan
// L08). Timestamps are explicit; nothing here reads a clock.

const T0 = Date.UTC(2026, 8, 22, 12, 0, 0)
const iso = (at) => new Date(at).toISOString()

function settings(env = {}) {
  const { settings: value, problems } = readSettings({
    TELEMETRY_INSTANCES: 'backend-1=http://127.0.0.1:4100/api/internal/db-stats,backend-2=http://127.0.0.1:4101/api/internal/db-stats',
    ABORT_MIN_SAMPLES: '20',
    ...env,
  })
  assert.deepEqual(problems, [])
  return value
}

function sample(id, at, depth = 0, startedAt = 'boot-1') {
  return {
    takenAt: iso(at),
    instance: { id, startedAt },
    payloadPool: { waiting: depth },
    visitorAuthPool: { waiting: 0 },
    admission: { query: { queued: 0 } },
  }
}

// --- settings --------------------------------------------------------------

test('refuses every malformed setting before anything starts', () => {
  const { problems } = readSettings({
    ABORT_FAILURE_RATE: 'NaN',
    ABORT_WINDOW_MS: '-5',
    ABORT_MAX_REQUESTS: '1.5',
    RUN_KIND: 'vibes',
    TELEMETRY_INSTANCES: 'no-equals-sign,backend-1=http://x/stats,backend-1=http://y/stats',
  })
  const text = problems.join(' | ')
  for (const expected of ['ABORT_FAILURE_RATE', 'ABORT_WINDOW_MS', 'ABORT_MAX_REQUESTS', 'RUN_KIND', 'no-equals-sign', 'twice']) {
    assert.ok(text.includes(expected), `missing ${expected} in ${text}`)
  }
})

test('a capacity run must declare a success floor and telemetry', () => {
  const { problems } = readSettings({ RUN_KIND: 'capacity' })
  assert.ok(problems.some((problem) => problem.includes('SUCCESS_FLOOR_RPS')))
  assert.ok(problems.some((problem) => problem.includes('TELEMETRY_INSTANCES')))
})

// --- HTTP failures ------------------------------------------------------------

test('stops on the rolling failure rate, not the cumulative one', () => {
  const policy = createPolicy(settings({ RUN_KIND: 'correctness', TELEMETRY_INSTANCES: '' }), T0)
  // An hour of health, then a sharp failure: the window sees it.
  for (let i = 0; i < 3_600; i += 1) policy.http(T0 + i * 1_000, false, 200)
  let decision = null
  for (let i = 0; i < 30 && !decision; i += 1) decision = policy.http(T0 + 3_600_000 + i * 100, true, 500)
  assert.equal(decision.code, EXIT.failures)
})

test('a containment run is not stopped by the refusals it expects', () => {
  const policy = createPolicy(settings({ RUN_KIND: 'containment' }), T0)
  for (let i = 0; i < 500; i += 1) assert.equal(policy.http(T0 + i, true, 503), null)
  assert.equal(policy.state.refusals, 500)
})

test('stops when the request budget is spent', () => {
  const policy = createPolicy(settings({ ABORT_MAX_REQUESTS: '10', TELEMETRY_INSTANCES: '' }), T0)
  let decision = null
  for (let i = 0; i < 11; i += 1) decision = policy.http(T0 + i, false, 200)
  assert.equal(decision.code, EXIT.budget)
})

// --- correctness ------------------------------------------------------------

test('one leaked member body stops the run at once, whatever the latency', () => {
  const policy = createPolicy(settings({ TELEMETRY_INSTANCES: '' }), T0)
  for (let i = 0; i < 100; i += 1) policy.http(T0 + i, false, 200)
  const decision = policy.correctness(T0 + 200, 'privacy')
  assert.equal(decision.code, EXIT.correctness)
  assert.match(decision.reason, /privacy/)
})

// --- generator ----------------------------------------------------------------

test('dropped arrivals invalidate a capacity claim', () => {
  const policy = createPolicy(settings({ RUN_KIND: 'capacity', SUCCESS_FLOOR_RPS: '1' }), T0)
  assert.equal(policy.dropped(T0 + 1_000, 3).code, EXIT.generator)
})

test('dropped arrivals do not stop a correctness run, which claims no capacity', () => {
  const policy = createPolicy(settings({ TELEMETRY_INSTANCES: '' }), T0)
  assert.equal(policy.dropped(T0 + 1_000, 3), null)
})

// --- success floor ------------------------------------------------------------

test('an all-503 capacity run cannot pass', () => {
  const policy = createPolicy(settings({ RUN_KIND: 'capacity', SUCCESS_FLOOR_RPS: '5', ABORT_FAILURE_RATE: '1' }), T0)
  for (let i = 0; i < 1_000; i += 1) policy.http(T0 + i * 10, true, 503)
  const decision = policy.finish(T0 + 10_000)
  assert.equal(decision.code, EXIT.floor)
  assert.match(decision.reason, /0 successes, 1000 refusals/)
})

test('a capacity run with its declared success passes', () => {
  const policy = createPolicy(settings({ RUN_KIND: 'capacity', SUCCESS_FLOOR_RPS: '5' }), T0)
  for (let i = 0; i < 100; i += 1) policy.http(T0 + i * 100, false, 200)
  assert.equal(policy.finish(T0 + 10_000), null)
  const summary = policy.summary(T0 + 10_000)
  assert.equal(summary.successFraction, 1)
  assert.equal(summary.refusalFraction, 0)
})

// --- queue growth -----------------------------------------------------------

test('sustained queue growth on one instance stops the run', () => {
  const policy = createPolicy(settings({ ABORT_QUEUE_SUSTAIN_MS: '5000' }), T0)
  let decision = null
  for (let s = 0; s <= 10 && !decision; s += 1) {
    const at = T0 + s * 1_000
    policy.sample(at, 'backend-2', sample('backend-2', at, 0))
    decision = policy.sample(at, 'backend-1', sample('backend-1', at, 2 + s * 3))
  }
  assert.equal(decision.code, EXIT.queue)
  assert.match(decision.reason, /backend-1/)
})

// Averaged with a healthy neighbour, backend-1's growth would look like half
// of itself. It is judged alone.
test('one unhealthy instance is not hidden by a healthy fleet', () => {
  const policy = createPolicy(settings({ ABORT_QUEUE_SUSTAIN_MS: '3000', ABORT_QUEUE_MIN: '5' }), T0)
  let decision = null
  for (let s = 0; s <= 8 && !decision; s += 1) {
    const at = T0 + s * 1_000
    policy.sample(at, 'backend-2', sample('backend-2', at, 0))
    decision = policy.sample(at, 'backend-1', sample('backend-1', at, 4 + s * 2))
  }
  assert.equal(decision?.code, EXIT.queue)
})

test('a short benign spike that drains does not stop the run', () => {
  const policy = createPolicy(settings({ ABORT_QUEUE_SUSTAIN_MS: '5000' }), T0)
  const depths = [0, 6, 9, 12, 3, 0, 0, 7, 8, 2, 0]
  for (const [s, depth] of depths.entries()) {
    const at = T0 + s * 1_000
    policy.sample(at, 'backend-2', sample('backend-2', at, 0))
    assert.equal(policy.sample(at, 'backend-1', sample('backend-1', at, depth)), null, `stopped at ${s}`)
  }
})

test('a queue that returns to zero clears its history', () => {
  const policy = createPolicy(settings({ ABORT_QUEUE_SUSTAIN_MS: '4000' }), T0)
  // Grows for 3 s, drains, then grows again for 3 s: neither run of growth is
  // sustained for 4 s, and the drain must reset the clock between them.
  const depths = [5, 8, 11, 14, 0, 5, 8, 11, 14]
  for (const [s, depth] of depths.entries()) {
    const at = T0 + s * 1_000
    policy.sample(at, 'backend-2', sample('backend-2', at, 0))
    assert.equal(policy.sample(at, 'backend-1', sample('backend-1', at, depth)), null, `stopped at ${s}`)
  }
})

test('queue depth sums pools and every gate queue', () => {
  assert.equal(
    queueDepth({ payloadPool: { waiting: 2 }, visitorAuthPool: { waiting: 1 }, admission: { a: { queued: 3 }, b: { queued: 4 } } }),
    10,
  )
})

// --- telemetry validity -------------------------------------------------------

test('missing telemetry stops the run', () => {
  const policy = createPolicy(settings({ ABORT_TELEMETRY_GAP_MS: '2000' }), T0)
  policy.sample(T0 + 500, 'backend-1', sample('backend-1', T0 + 500))
  policy.sample(T0 + 500, 'backend-2', sample('backend-2', T0 + 500))
  assert.equal(policy.tick(T0 + 2_000), null)
  policy.sample(T0 + 2_400, 'backend-1', sample('backend-1', T0 + 2_400))
  const decision = policy.tick(T0 + 3_000)
  assert.equal(decision.code, EXIT.telemetry)
  assert.match(decision.reason, /backend-2/)
})

test('an instance that never reports stops the run after the start-up allowance', () => {
  const policy = createPolicy(settings({ ABORT_TELEMETRY_GAP_MS: '1000' }), T0)
  policy.sample(T0 + 100, 'backend-1', sample('backend-1', T0 + 100))
  policy.sample(T0 + 1_000, 'backend-1', sample('backend-1', T0 + 1_000))
  assert.equal(policy.tick(T0 + 1_500), null)
  policy.sample(T0 + 1_900, 'backend-1', sample('backend-1', T0 + 1_900))
  const decision = policy.tick(T0 + 2_100)
  assert.equal(decision.code, EXIT.telemetry)
  assert.match(decision.reason, /backend-2/)
})

test('an answer from the wrong instance is invalid evidence', () => {
  const policy = createPolicy(settings(), T0)
  const decision = policy.sample(T0, 'backend-1', sample('backend-2', T0))
  assert.equal(decision.code, EXIT.telemetry)
  assert.match(decision.reason, /answered as backend-2/)
})

test('a sample with no instance identity is invalid', () => {
  const policy = createPolicy(settings(), T0)
  assert.equal(policy.sample(T0, 'backend-1', { takenAt: iso(T0), payloadPool: { waiting: 0 } }).code, EXIT.telemetry)
})

test('an undeclared endpoint is invalid', () => {
  const policy = createPolicy(settings(), T0)
  assert.equal(policy.sample(T0, 'backend-9', sample('backend-9', T0)).code, EXIT.telemetry)
})

test('a stale sample is invalid', () => {
  const policy = createPolicy(settings({ ABORT_TELEMETRY_GAP_MS: '2000' }), T0)
  assert.equal(policy.sample(T0 + 10_000, 'backend-1', sample('backend-1', T0)).code, EXIT.telemetry)
})

test('a restart mid-run is reported, not averaged in', () => {
  const policy = createPolicy(settings(), T0)
  policy.sample(T0, 'backend-1', sample('backend-1', T0, 0, 'boot-1'))
  const decision = policy.sample(T0 + 1_000, 'backend-1', sample('backend-1', T0 + 1_000, 0, 'boot-2'))
  assert.equal(decision.code, EXIT.telemetry)
  assert.match(decision.reason, /restarted/)
})

test('the wall clock is a budget', () => {
  const policy = createPolicy(settings({ ABORT_MAX_RUN_MS: '5000', TELEMETRY_INSTANCES: '' }), T0)
  assert.equal(policy.tick(T0 + 4_000), null)
  assert.equal(policy.tick(T0 + 6_000).code, EXIT.budget)
})
