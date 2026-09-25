import assert from 'node:assert/strict'
import test from 'node:test'

import { isLocationSlug } from './locationSlug.ts'

test('real country and city slugs pass', () => {
  for (const slug of ['peru', 'colombia', 'costa-rica', 'lima', 'Peru', 'region-2']) {
    assert.equal(isLocationSlug(slug), true, slug)
  }
})

// Each of these went to the backend, came back 400, and rendered a 500.
test('dotted and other non-slug segments are refused', () => {
  for (const segment of ['evil.com', 'foo.bar', 'wp-login.php', '.env', 'peru|lima', 'a b', 'peru%2F', '', 'lima/']) {
    assert.equal(isLocationSlug(segment), false, segment)
  }
})
