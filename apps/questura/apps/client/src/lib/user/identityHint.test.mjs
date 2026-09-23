import assert from 'node:assert/strict'
import test from 'node:test'

import { hintFromResponse, IDENTITY_HINT_KEY, IDENTITY_HINT_SCRIPT, readHint, writeHint } from './identityHint.ts'

function memoryStorage() {
  const map = new Map()
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)) }
}

const throwing = {
  getItem() {
    throw new Error('SecurityError')
  },
  setItem() {
    throw new Error('QuotaExceededError')
  },
}

test('the hint follows the /api/me answer', () => {
  assert.equal(hintFromResponse({ authenticated: false, principal: null }), 'anon')
  assert.equal(hintFromResponse({ authenticated: true, principal: { membership: { active: false } } }), 'user')
  assert.equal(hintFromResponse({ authenticated: true, principal: { membership: { active: true } } }), 'member')
})

test('write then read round-trips; unknown values read as anon', () => {
  const storage = memoryStorage()
  assert.equal(readHint(storage), 'anon')
  writeHint('member', storage)
  assert.equal(readHint(storage), 'member')
  storage.setItem(IDENTITY_HINT_KEY, 'admin')
  assert.equal(readHint(storage), 'anon')
})

test('a storage that throws is anonymous, never an error', () => {
  assert.equal(readHint(throwing), 'anon')
  assert.doesNotThrow(() => writeHint('user', throwing))
  assert.equal(readHint(null), 'anon')
})

test('the inline script only sets user or member, and survives blocked storage', () => {
  const run = (localStorage) => {
    const documentElement = { dataset: {} }
    new Function('localStorage', 'document', IDENTITY_HINT_SCRIPT)(localStorage, { documentElement })
    return documentElement.dataset.identity
  }
  const storage = memoryStorage()
  assert.equal(run(storage), undefined)
  storage.setItem(IDENTITY_HINT_KEY, 'user')
  assert.equal(run(storage), 'user')
  storage.setItem(IDENTITY_HINT_KEY, 'member')
  assert.equal(run(storage), 'member')
  storage.setItem(IDENTITY_HINT_KEY, '"><script>')
  assert.equal(run(storage), undefined)
  assert.equal(run(throwing), undefined)
})
