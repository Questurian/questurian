import assert from 'node:assert/strict'
import test from 'node:test'

import { identityFromResponse, IdentityStore, IdentitySuperseded } from './identity.ts'

/**
 * One identity lookup for every consumer on a page, and no reader's answer
 * outliving the reader (discovery finding 7).
 */

const A = { authenticated: true, principal: { id: 'user-a', membership: { active: true } } }
const B = { authenticated: true, principal: { id: 'user-b', membership: { active: false } } }

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

test('concurrent consumers share one request', async () => {
  const store = new IdentityStore({ fetcher: async () => A })
  const [navbar, gated] = await Promise.all([store.read(), store.read({ maxAgeMs: 30_000 })])
  assert.equal(store.requests, 1)
  assert.equal(navbar.principal.id, 'user-a')
  assert.equal(gated.principal.id, 'user-a')
})

test('a consumer mounting just after reuses a recent answer', async () => {
  let now = 0
  const store = new IdentityStore({ fetcher: async () => A, now: () => now })
  await store.read()
  now = 10_000
  await store.read({ maxAgeMs: 30_000 })
  assert.equal(store.requests, 1)
  now = 40_001
  await store.read({ maxAgeMs: 30_000 })
  assert.equal(store.requests, 2)
})

test('a failure is not cached and is not "anonymous"', async () => {
  let calls = 0
  const store = new IdentityStore({
    fetcher: async () => {
      calls += 1
      if (calls === 1) throw Object.assign(new Error('busy'), { status: 503 })
      return A
    },
  })
  await assert.rejects(store.read({ maxAgeMs: 30_000 }), /busy/)
  const value = await store.read({ maxAgeMs: 30_000 })
  assert.equal(value.principal.id, 'user-a')
  assert.equal(calls, 2)
})

test('A → sign-out → B: a late answer for A never reaches B', async () => {
  const slowA = deferred()
  let fetches = 0
  const store = new IdentityStore({
    fetcher: () => {
      fetches += 1
      return fetches === 1 ? slowA.promise : Promise.resolve(B)
    },
  })

  const seen = []
  store.subscribe((generation) => seen.push(generation))

  const forA = store.read()
  store.invalidate() // sign-out, then B signs in
  const forB = await store.read()
  slowA.resolve(A)

  await assert.rejects(forA, (error) => error instanceof IdentitySuperseded)
  assert.equal(forB.principal.id, 'user-b')
  // A's answer was not stored: the next read within the window is still B.
  assert.equal((await store.read({ maxAgeMs: 60_000 })).principal.id, 'user-b')
  assert.deepEqual(seen, [1])
})

test('identity states', () => {
  assert.deepEqual(identityFromResponse({ authenticated: false, principal: null }), { state: 'anonymous', principal: null })
  assert.equal(identityFromResponse(A).member, true)
  assert.equal(identityFromResponse(B).member, false)
})

test('onAnswer hears each published answer, not failures or superseded lookups', async () => {
  const heard = []
  let next = () => Promise.resolve(A)
  let now = 0
  const store = new IdentityStore({ fetcher: () => next(), now: () => (now += 1), onAnswer: (value) => heard.push(value.principal?.id ?? 'anon') })

  await store.read()
  next = () => Promise.reject(Object.assign(new Error('busy'), { status: 503 }))
  await assert.rejects(store.read(), /busy/)

  const slow = deferred()
  next = () => slow.promise
  const pending = store.read()
  store.invalidate()
  slow.resolve(B)
  await assert.rejects(pending, IdentitySuperseded)

  next = () => Promise.resolve({ authenticated: false, principal: null })
  await store.read()
  assert.deepEqual(heard, ['user-a', 'anon'])
})
