import assert from 'node:assert/strict'
import test from 'node:test'

import { createBookmarkStore } from './bookmarkStoreCore.ts'

/**
 * Bookmark state that cannot mistake "could not check" for "signed out", and
 * cannot let a previous reader's answer land (discovery finding 7).
 */

const keyOf = (ref) => `${ref.targetType}:${ref.targetId}`
const ref = (id) => ({ targetType: 'articles', targetId: id })

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function make(overrides = {}) {
  const calls = { refs: 0, create: 0, remove: 0 }
  const store = createBookmarkStore({
    keyOf,
    fetchRefs: async () => {
      calls.refs += 1
      return { authenticated: true, refs: [ref(1)] }
    },
    create: async () => {
      calls.create += 1
    },
    remove: async () => {
      calls.remove += 1
    },
    isUnauthorized: (error) => error?.status === 401,
    ...overrides,
  })
  return { store, calls }
}

test('a failed refs read is "error" with unknown identity — not signed out', async () => {
  const { store } = make({
    fetchRefs: async () => {
      throw Object.assign(new Error('busy'), { status: 503 })
    },
  })
  await store.getState().ensureLoaded()
  assert.equal(store.getState().status, 'error')
  assert.equal(store.getState().authenticated, null)
})

test('with unknown identity a click goes to the server, not the sign-in modal', async () => {
  let refsCalls = 0
  const { store, calls } = make({
    fetchRefs: async () => {
      refsCalls += 1
      throw new Error('busy')
    },
  })
  await store.getState().ensureLoaded()
  const result = await store.getState().toggle(ref(5), true)
  assert.equal(result, 'ok')
  assert.equal(calls.create, 1)
  assert.equal(store.getState().isBookmarked(ref(5)), true)
  // The write proved the session, so the refs are asked for once more — and
  // only once, even though they are still failing.
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(refsCalls, 2)
})

test('a known signed-out reader still gets the modal without a write', async () => {
  const { store, calls } = make({ fetchRefs: async () => ({ authenticated: false, refs: [] }) })
  await store.getState().ensureLoaded()
  assert.equal(await store.getState().toggle(ref(5), true), 'unauthenticated')
  assert.equal(calls.create, 0)
})

test('one failure is not turned into a request per control', async () => {
  let calls = 0
  const { store } = make({
    fetchRefs: async () => {
      calls += 1
      throw new Error('busy')
    },
  })
  for (let i = 0; i < 40; i += 1) await store.getState().ensureLoaded()
  assert.equal(calls, 1)
})

test('recovers on an explicit retry, without a reload', async () => {
  let fail = true
  const { store } = make({
    fetchRefs: async () => {
      if (fail) throw new Error('busy')
      return { authenticated: true, refs: [ref(1)] }
    },
  })
  await store.getState().ensureLoaded()
  fail = false
  await store.getState().reload()
  assert.equal(store.getState().status, 'ready')
  assert.equal(store.getState().isBookmarked(ref(1)), true)
})

test('a successful write while refs were unknown re-reads them', async () => {
  let fail = true
  const { store, calls } = make({
    fetchRefs: async () => {
      calls.refs += 1
      if (fail) throw new Error('busy')
      return { authenticated: true, refs: [ref(1), ref(5)] }
    },
  })
  await store.getState().ensureLoaded()
  fail = false
  await store.getState().toggle(ref(5), true)
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(store.getState().status, 'ready')
  assert.equal(store.getState().isBookmarked(ref(1)), true)
})

test('A → sign-out → B: A’s late refs never land in B’s store', async () => {
  const slowA = deferred()
  let fetches = 0
  const { store } = make({
    fetchRefs: () => {
      fetches += 1
      return fetches === 1 ? slowA.promise : Promise.resolve({ authenticated: true, refs: [ref(9)] })
    },
  })
  const loadingA = store.getState().ensureLoaded()
  await store.getState().resetForNewReader()
  slowA.resolve({ authenticated: true, refs: [ref(1), ref(2)] })
  await loadingA

  assert.equal(store.getState().isBookmarked(ref(1)), false)
  assert.equal(store.getState().isBookmarked(ref(9)), true)
})

test('sign-out clears refs and pending writes', async () => {
  const hang = deferred()
  const { store } = make({ create: () => hang.promise })
  await store.getState().ensureLoaded()
  void store.getState().toggle(ref(5), true)
  assert.equal(store.getState().isPending(ref(5)), true)

  store.setState({ status: 'ready' })
  await store.getState().resetForNewReader()
  hang.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))

  assert.equal(store.getState().isPending(ref(5)), false)
  assert.equal(store.getState().isBookmarked(ref(5)), false)
})

test('a failed write rolls back only its own key and is never retried', async () => {
  const slow = deferred()
  let creates = 0
  const { store } = make({
    create: (target) => {
      creates += 1
      return target.targetId === 5 ? Promise.reject(Object.assign(new Error('busy'), { status: 503 })) : slow.promise
    },
  })
  await store.getState().ensureLoaded()
  const other = store.getState().toggle(ref(6), true)
  assert.equal(await store.getState().toggle(ref(5), true), 'error')
  slow.resolve()
  await other

  assert.equal(store.getState().isBookmarked(ref(5)), false)
  assert.equal(store.getState().isBookmarked(ref(6)), true)
  assert.equal(creates, 2)
})

test('a 401 on write marks the reader signed out', async () => {
  const { store } = make({
    create: async () => {
      throw Object.assign(new Error('no'), { status: 401 })
    },
  })
  await store.getState().ensureLoaded()
  assert.equal(await store.getState().toggle(ref(5), true), 'unauthenticated')
  assert.equal(store.getState().authenticated, false)
  assert.equal(store.getState().isBookmarked(ref(5)), false)
})
