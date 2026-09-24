import { describe, expect, it } from 'vitest'

import {
  acceptOrCreateRequestId,
  currentRequestId,
  runWithRequestId,
  wellFormedRequestId,
} from './request-id'

describe('wellFormedRequestId', () => {
  it.each(['8f14e45f-ceea-467a-9575-7b4c2f5a8e21', '8b3c1f2a9d0e1f23-LHR', 'abc.def:ghi_123'])('accepts %s', (id) => {
    expect(wellFormedRequestId(id)).toBe(id)
  })

  it.each([
    ['empty', ''],
    ['too short', 'abc'],
    ['too long', 'a'.repeat(129)],
    ['a newline (log injection)', 'abcdefgh\n{"level":"info"}'],
    ['spaces', 'abc def ghi'],
    ['markup', '<script>alert(1)</script>'],
  ])('refuses %s', (_name, id) => {
    expect(wellFormedRequestId(id)).toBeUndefined()
  })
})

describe('acceptOrCreateRequestId', () => {
  it("keeps the caller's id when it is well formed", () => {
    expect(acceptOrCreateRequestId('req-12345678')).toBe('req-12345678')
  })

  it('makes a new one otherwise', () => {
    const made = acceptOrCreateRequestId('bad id\n')
    expect(wellFormedRequestId(made)).toBe(made)
    expect(made).not.toBe(acceptOrCreateRequestId(null))
  })
})

describe('currentRequestId', () => {
  it('is undefined outside a request', () => {
    expect(currentRequestId()).toBeUndefined()
  })

  it('reads an explicit scope, across awaits', async () => {
    await runWithRequestId('req-scoped-1', async () => {
      await new Promise((resolve) => setTimeout(resolve, 1))
      expect(currentRequestId()).toBe('req-scoped-1')
    })
    expect(currentRequestId()).toBeUndefined()
  })

})
