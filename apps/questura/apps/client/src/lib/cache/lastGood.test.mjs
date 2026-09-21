import assert from 'node:assert/strict'
import test from 'node:test'

import { LastGood } from './lastGood.ts'

const fail = () => Promise.reject(new Error('Failed to fetch city homepage: 503'))

test('serves the last good answer when a rebuild fails', async () => {
  const store = new LastGood()
  await store.read('lima', async () => ({ page: 'v1' }))
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
  await store.read('lima', async () => ({ page: 'v1' }))
  assert.equal(await store.read('lima', async () => null), null)
  await assert.rejects(() => store.read('lima', fail), /503/)
})

test('will not serve an answer older than its limit', async () => {
  let now = 0
  const store = new LastGood(10, 1000, () => now)
  await store.read('lima', async () => ({ page: 'v1' }))
  now = 1001
  await assert.rejects(() => store.read('lima', fail), /503/)
})

test('keeps at most maxEntries, dropping the oldest', async () => {
  const store = new LastGood(2)
  for (const key of ['a', 'b', 'c']) await store.read(key, async () => ({ key }))
  assert.equal(store.size, 2)
  await assert.rejects(() => store.read('a', fail), /503/)
  assert.deepEqual(await store.read('c', fail), { key: 'c' })
})
