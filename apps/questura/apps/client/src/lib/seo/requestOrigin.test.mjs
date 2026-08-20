import assert from 'node:assert/strict'
import test from 'node:test'

import { originFromRequest } from './requestOrigin.ts'

test('localhost stays localhost, even if env would prefer www', () => {
  assert.equal(
    originFromRequest({
      host: 'localhost:3000',
      urlOrigin: 'http://localhost:3000',
    }),
    'http://localhost:3000',
  )
})

test('127.0.0.1 stays on the viewed loopback host', () => {
  assert.equal(
    originFromRequest({
      host: '127.0.0.1:3000',
      urlOrigin: 'http://127.0.0.1:3000',
    }),
    'http://127.0.0.1:3000',
  )
})

test('live traffic uses forwarded host and proto', () => {
  assert.equal(
    originFromRequest({
      host: '127.0.0.1:3000',
      forwardedHost: 'www.questurian.com',
      forwardedProto: 'https',
      urlOrigin: 'http://127.0.0.1:3000',
    }),
    'https://www.questurian.com',
  )
})

test('missing host falls back to the request URL origin', () => {
  assert.equal(
    originFromRequest({
      host: null,
      urlOrigin: 'http://localhost:3000/',
    }),
    'http://localhost:3000',
  )
})
