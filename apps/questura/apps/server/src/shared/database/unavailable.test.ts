import { describe, expect, it } from 'vitest'

import { isDatabaseUnavailable } from './unavailable'

const withCode = (code: string, message = 'x') => Object.assign(new Error(message), { code })

describe('isDatabaseUnavailable', () => {
  it("recognises pg's client-side limits, which carry no code", () => {
    expect(isDatabaseUnavailable(new Error('Query read timeout'))).toBe(true)
    expect(isDatabaseUnavailable(new Error('timeout exceeded when trying to connect'))).toBe(true)
    expect(isDatabaseUnavailable(new Error('Connection terminated unexpectedly'))).toBe(true)
  })

  it('recognises a database that is gone or refusing', () => {
    expect(isDatabaseUnavailable(withCode('ECONNREFUSED'))).toBe(true)
    expect(isDatabaseUnavailable(withCode('57P03'))).toBe(true)
    expect(isDatabaseUnavailable(withCode('08006'))).toBe(true)
    expect(isDatabaseUnavailable(withCode('57014', 'canceling statement due to statement timeout'))).toBe(true)
    expect(isDatabaseUnavailable(withCode('55P03', 'canceling statement due to lock timeout'))).toBe(true)
  })

  // Drizzle wraps the driver's error in `DrizzleQueryError`, with the
  // original as its cause.
  it('looks through wrapping errors', () => {
    const wrapped = new Error('Failed query: select ...', { cause: new Error('Query read timeout') })
    expect(isDatabaseUnavailable(new Error('outer', { cause: wrapped }))).toBe(true)
  })

  // A 500 for these is right: they are about the request, and retrying
  // would fail the same way.
  it('leaves errors about the query alone', () => {
    expect(isDatabaseUnavailable(withCode('23505', 'duplicate key'))).toBe(false)
    expect(isDatabaseUnavailable(withCode('42P01', 'relation does not exist'))).toBe(false)
    expect(isDatabaseUnavailable(new Error('boom'))).toBe(false)
    expect(isDatabaseUnavailable(undefined)).toBe(false)
    expect(isDatabaseUnavailable('Query read timeout')).toBe(false)
  })
})
