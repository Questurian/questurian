import assert from 'node:assert/strict'
import test from 'node:test'

import { RequestError, rateLimitedMessage } from './request-policy.ts'

// A reader who retries a mistyped email a few times hits the account-check
// limit (5 a minute per address). They used to read "Service is unavailable",
// which says the site is broken; it is not, they only need to wait.
test('a 429 says to wait, with the server’s own Retry-After', () => {
  const error = new RequestError('Too many requests', { status: 429, category: 'http', retryAfterMs: 42_000 })
  assert.equal(rateLimitedMessage(error), 'Too many attempts. Please wait 42 seconds and try again.')
})

test('a 429 without Retry-After says a minute', () => {
  const error = new RequestError('Too many requests', { status: 429, category: 'http' })
  assert.equal(rateLimitedMessage(error), 'Too many attempts. Please wait a minute and try again.')
})

test('one second is singular, and a long wait is rounded up to minutes', () => {
  assert.match(rateLimitedMessage(new RequestError('x', { status: 429, category: 'http', retryAfterMs: 1_000 })), /wait 1 second and/)
  assert.match(rateLimitedMessage(new RequestError('x', { status: 429, category: 'http', retryAfterMs: 150_000 })), /wait 3 minutes and/)
})

test('anything that is not a 429 is not a rate limit', () => {
  assert.equal(rateLimitedMessage(new RequestError('x', { status: 503, category: 'http' })), null)
  assert.equal(rateLimitedMessage(new Error('Too many')), null)
  assert.equal(rateLimitedMessage(null), null)
})
