import assert from 'node:assert/strict'
import test from 'node:test'

import { SECURITY_HEADERS } from './securityHeaders.ts'

// Every page carries these (launch harness D4). Without them the site could
// be framed by another site and a signed-in reader tricked into clicking
// "Cancel subscription" (clickjacking), and a response could be sniffed as a
// different content type. `next.config.ts` applies them to `/:path*`.
test('the security headers say what they must', () => {
  const headers = Object.fromEntries(SECURITY_HEADERS.map(({ key, value }) => [key.toLowerCase(), value]))
  assert.equal(headers['x-frame-options'], 'DENY')
  assert.match(headers['content-security-policy'], /frame-ancestors 'none'/)
  assert.equal(headers['x-content-type-options'], 'nosniff')
  assert.equal(headers['referrer-policy'], 'strict-origin-when-cross-origin')
  assert.ok(Number(/max-age=(\d+)/.exec(headers['strict-transport-security'])[1]) >= 15_552_000)
})
