import assert from 'node:assert/strict'
import test from 'node:test'

import { DEFAULT_FALLBACK_WINDOW_MS, LastGood, validatedAtFrom } from './lastGood.ts'

const fail = () => Promise.reject(new Error('Failed to fetch city homepage: 503'))

/**
 * A reader that confirms the value now, the way a real origin round trip
 * would. `validatedAt` is supplied by the caller precisely so a *cached*
 * answer can say something different.
 */
const fresh = (value, at = Date.now()) => async () => ({ value, validatedAt: at })

test('serves the last good answer when a rebuild fails', async () => {
  const store = new LastGood()
  await store.read('lima', fresh({ page: 'v1' }))
  let fellBack = false
  const value = await store.read('lima', fail, () => {
    fellBack = true
  })
  assert.deepEqual(value, { page: 'v1' })
  assert.equal(fellBack, true)
})

test('fails loudly with nothing to fall back on', async () => {
  await assert.rejects(() => new LastGood().read('lima', fail), /503/)
})

// A 404 arrives as null: an answer, not a failure. An unpublished page must
// never be resurrected from memory.
test('forgets a page that stopped existing', async () => {
  const store = new LastGood()
  await store.read('lima', fresh({ page: 'v1' }))
  assert.equal(await store.read('lima', async () => ({ value: null, validatedAt: Date.now() })), null)
  await assert.rejects(() => store.read('lima', fail), /503/)
})

test('will not serve an answer older than its limit', async () => {
  let now = 0
  const store = new LastGood(10, 1000, () => now)
  await store.read('lima', fresh({ page: 'v1' }, 0))
  now = 1001
  await assert.rejects(() => store.read('lima', fail), /503/)
})

test('keeps at most maxEntries, dropping the oldest', async () => {
  const store = new LastGood(2)
  for (const key of ['a', 'b', 'c']) await store.read(key, fresh({ key }))
  assert.equal(store.size, 2)
  await assert.rejects(() => store.read('a', fail), /503/)
  assert.deepEqual(await store.read('c', fail), { key: 'c' })
})

// --------------------------------------------------------------------------
// L08: what the window actually measures.
// --------------------------------------------------------------------------

// The bug this replaces: every successful read reset the clock, including one
// the origin never saw. The backend answers `public, s-maxage=60,
// stale-while-revalidate=600`, so a Next data-cache hit is a successful read
// with no origin round trip — and the stated maximum age was a maximum of
// nothing.
test('a cached answer does not look freshly validated', async () => {
  let now = 0
  const store = new LastGood(10, 1000, () => now)

  await store.read('lima', fresh({ page: 'v1' }, 0))

  // 900 ms later, a read served from Next's data cache: the value came back,
  // but the origin confirmed it at t=0.
  now = 900
  await store.read('lima', fresh({ page: 'v1' }, 0))

  // Past the window measured from the origin's confirmation, not from now.
  now = 1001
  await assert.rejects(() => store.read('lima', fail), /503/)
})

test('serving a fallback does not renew the clock', async () => {
  let now = 0
  const store = new LastGood(10, 1000, () => now)
  await store.read('lima', fresh({ page: 'v1' }, 0))

  now = 500
  assert.deepEqual(await store.read('lima', fail), { page: 'v1' })

  now = 1001
  await assert.rejects(() => store.read('lima', fail), /503/)
})

test('reports the origin age, not the time since this process last looked', async () => {
  let now = 0
  const store = new LastGood(10, 10_000, () => now)
  await store.read('lima', fresh({ page: 'v1' }, 0))

  now = 5_000
  let seen = null
  await store.read('lima', fail, (_error, info) => {
    seen = info
  })

  assert.equal(seen.ageMs, 5_000)
  assert.equal(seen.served, 1)
})

test('the default window is ADR-0003s one hour, not seven days', () => {
  assert.equal(DEFAULT_FALLBACK_WINDOW_MS, 60 * 60 * 1000)
})

// --------------------------------------------------------------------------
// Bytes, not entries.
// --------------------------------------------------------------------------

// Five hundred curated homepages is not a fixed amount of memory: a city page
// is tens of kilobytes and a large one is far more.
test('evicts on bytes as well as entries', async () => {
  const big = { page: 'x'.repeat(2_000) }
  const store = new LastGood(100, 60_000, () => 0, 4_500)

  for (const key of ['a', 'b', 'c']) await store.read(key, fresh(big))

  assert.ok(store.stats().bytes <= 4_500)
  assert.ok(store.size < 3)
  await assert.rejects(() => store.read('a', fail), /503/)
})

test('reports its own size, so the number is observable rather than assumed', async () => {
  const store = new LastGood()
  await store.read('lima', fresh({ page: 'v1' }))
  const stats = store.stats()

  assert.equal(stats.entries, 1)
  assert.ok(stats.bytes > 0)
  assert.equal(stats.maxAgeMs, DEFAULT_FALLBACK_WINDOW_MS)
})

// --------------------------------------------------------------------------
// Deriving the origin time from the response.
// --------------------------------------------------------------------------

function headers(values) {
  return { headers: { get: (name) => values[name.toLowerCase()] ?? null } }
}

test('reads the origin time from Date', () => {
  const issued = Date.UTC(2026, 8, 22, 6, 0, 0)
  const at = validatedAtFrom(headers({ date: new Date(issued).toUTCString() }), issued + 10_000)
  assert.equal(at, issued)
})

// `Age` is how long a shared cache has been holding it. A response that has
// sat in a CDN for ten minutes was confirmed ten minutes ago, not now.
test('subtracts Age, because a cached response was confirmed earlier', () => {
  const issued = Date.UTC(2026, 8, 22, 6, 0, 0)
  const at = validatedAtFrom(headers({ date: new Date(issued).toUTCString(), age: '600' }), issued + 600_000)
  assert.equal(at, issued - 600_000)
})

test('never claims a response is fresher than now', () => {
  const future = Date.now() + 60_000
  const at = validatedAtFrom(headers({ date: new Date(future).toUTCString() }), Date.now())
  assert.ok(at <= Date.now())
})

test('falls back to now when the origin says nothing, which is the old behaviour', () => {
  const now = 1_700_000_000_000
  assert.equal(validatedAtFrom(headers({}), now), now)
  assert.equal(validatedAtFrom(headers({ date: 'not a date' }), now), now)
})
