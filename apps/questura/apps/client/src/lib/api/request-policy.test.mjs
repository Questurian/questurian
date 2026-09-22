import assert from 'node:assert/strict'
import test from 'node:test'

import {
  errorFromResponse,
  executeRequest,
  isTemporaryFailure,
  isUnauthenticated,
  MAX_DETAIL,
  parseRetryAfter,
  RequestError,
  retryDecision,
} from './request-policy.ts'

/**
 * Discovery finding 7: status after body, no deadline, deterministic
 * retries, Retry-After discarded. Every case uses a controlled clock and
 * random source.
 */

const headers = (values = {}) => ({ get: (name) => values[name.toLowerCase()] ?? null })
const response = (status, text, values = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: headers(values),
  text: async () => text,
})

// --- Retry-After -----------------------------------------------------------

test('Retry-After: delta seconds', () => {
  assert.equal(parseRetryAfter('7', 0), 7_000)
  assert.equal(parseRetryAfter(' 0 ', 0), 0)
})

test('Retry-After: an HTTP-date, relative to now', () => {
  const now = Date.UTC(2026, 8, 22, 12, 0, 0)
  assert.equal(parseRetryAfter(new Date(now + 30_000).toUTCString(), now), 30_000)
  // A date in the past means "now", not a negative wait.
  assert.equal(parseRetryAfter(new Date(now - 30_000).toUTCString(), now), 0)
})

test('Retry-After: anything else is null, never zero', () => {
  for (const bad of ['', '-5', '1.5', 'soon', 'NaN', null, undefined, '99999999999999999999']) {
    assert.equal(parseRetryAfter(bad, 0), null, String(bad))
  }
})

// --- Classifying a response --------------------------------------------------

test('a JSON error keeps its message and status', () => {
  const error = errorFromResponse(response(503, '{"message":"Busy"}', { 'retry-after': '1' }), '{"message":"Busy"}', 0)
  assert.equal(error.category, 'http')
  assert.equal(error.status, 503)
  assert.equal(error.message, 'Busy')
  assert.equal(error.retryAfterMs, 1_000)
})

test('an HTML challenge page is a challenge, and its text is not echoed', () => {
  const page = '<!DOCTYPE html><html><body>Checking your browser… secret-ray-id</body></html>'
  const error = errorFromResponse(response(403, page, { 'content-type': 'text/html' }), page, 0)
  assert.equal(error.category, 'challenge')
  assert.equal(error.status, 403)
  assert.ok(!error.message.includes('secret-ray-id'))
})

test('a long error message is capped', () => {
  const text = JSON.stringify({ error: 'x'.repeat(5_000) })
  assert.equal(errorFromResponse(response(500, text), text, 0).message.length, MAX_DETAIL)
})

// --- Retry decisions ---------------------------------------------------------

const half = () => 0.5
const err = (status, category = 'http', retryAfterMs = null) =>
  new RequestError('x', { status, category, retryAfterMs })

test('never retries 401, 403, 404 or a challenge page', () => {
  for (const error of [err(401), err(403), err(404), err(403, 'challenge'), err(503, 'challenge')]) {
    assert.deepEqual(retryDecision(error, 1, 0, undefined, half), { retry: false, reason: 'permanent' })
  }
})

test('never retries a cancellation or a malformed success', () => {
  assert.deepEqual(retryDecision(err(0, 'aborted'), 1, 0), { retry: false, reason: 'cancelled' })
  assert.deepEqual(retryDecision(err(200, 'malformed'), 1, 0), { retry: false, reason: 'permanent' })
})

test('retries 503, a network failure and a timeout with growing, jittered delays', () => {
  for (const error of [err(503), err(0, 'network'), err(0, 'timeout')]) {
    const first = retryDecision(error, 1, 0, undefined, () => 0)
    const second = retryDecision(error, 2, 0, undefined, () => 0)
    assert.equal(first.retry, true)
    // Equal jitter: never zero, so never a tight loop.
    assert.ok(first.delayMs >= 250, `first ${first.delayMs}`)
    assert.ok(second.delayMs > first.delayMs)
  }
})

test('two readers who failed together do not come back together', () => {
  const a = retryDecision(err(503), 1, 0, undefined, () => 0.1)
  const b = retryDecision(err(503), 1, 0, undefined, () => 0.9)
  assert.notEqual(a.delayMs, b.delayMs)
})

test('attempts are finite', () => {
  assert.deepEqual(retryDecision(err(503), 3, 0), { retry: false, reason: 'exhausted' })
})

test('the whole sequence has a time budget', () => {
  assert.deepEqual(retryDecision(err(503), 1, 20_000), { retry: false, reason: 'exhausted' })
})

test('429 with a Retry-After inside the budget waits at least that long', () => {
  const decision = retryDecision(err(429, 'http', 5_000), 1, 0, undefined, () => 0)
  assert.deepEqual(decision, { retry: true, delayMs: 5_000 })
})

test('a Retry-After past the budget means "try later", never an earlier retry', () => {
  assert.deepEqual(retryDecision(err(503, 'http', 60_000), 1, 0), { retry: false, reason: 'retry-later' })
})

test('temporary versus answered', () => {
  assert.equal(isTemporaryFailure(err(503)), true)
  assert.equal(isTemporaryFailure(err(429)), true)
  assert.equal(isTemporaryFailure(err(0, 'network')), true)
  assert.equal(isTemporaryFailure(err(403, 'challenge')), true)
  assert.equal(isTemporaryFailure(err(401)), false)
  assert.equal(isTemporaryFailure(err(404)), false)
  // A challenge page with 401 is not the server saying "no session".
  assert.equal(isUnauthenticated(err(401)), true)
  assert.equal(isUnauthenticated(err(401, 'challenge')), false)
  assert.equal(isUnauthenticated(err(403)), false)
})

// --- One request: deadline, cancellation, body ----------------------------

test('a 200 with JSON resolves', async () => {
  const value = await executeRequest({ fetchImpl: async () => response(200, '{"a":1}'), url: 'x' })
  assert.deepEqual(value, { a: 1 })
})

test('a malformed 200 is malformed, not a network error', async () => {
  await assert.rejects(
    executeRequest({ fetchImpl: async () => response(200, '<html>'), url: 'x' }),
    (error) => error.category === 'malformed' && error.status === 200,
  )
})

test('status is read before the body: an HTML 503 is not "Invalid JSON"', async () => {
  await assert.rejects(
    executeRequest({
      fetchImpl: async () => response(503, '<html>overloaded</html>', { 'retry-after': '3' }),
      url: 'x',
    }),
    (error) => error.category === 'challenge' && error.status === 503 && error.retryAfterMs === 3_000,
  )
})

test('a stalled body times out', async () => {
  const stalled = { ...response(200, ''), text: () => new Promise(() => {}) }
  const started = Date.now()
  await assert.rejects(
    executeRequest({ fetchImpl: async () => stalled, url: 'x', timeoutMs: 50 }),
    (error) => error.category === 'timeout',
  )
  assert.ok(Date.now() - started < 1_000)
})

test('a stalled connection times out', async () => {
  await assert.rejects(
    executeRequest({ fetchImpl: () => new Promise(() => {}), url: 'x', timeoutMs: 30 }),
    (error) => error.category === 'timeout',
  )
})

test('a cancelled request is "aborted", not a timeout or a failure of identity', async () => {
  const controller = new AbortController()
  const pending = executeRequest({ fetchImpl: () => new Promise(() => {}), url: 'x', signal: controller.signal })
  controller.abort()
  await assert.rejects(pending, (error) => error.category === 'aborted' && !isUnauthenticated(error))
})

test('a network failure is "network"', async () => {
  await assert.rejects(
    executeRequest({
      fetchImpl: async () => {
        throw new TypeError('Failed to fetch')
      },
      url: 'x',
    }),
    (error) => error.category === 'network' && isTemporaryFailure(error),
  )
})
