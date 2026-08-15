import { describe, expect, it } from 'vitest'

import { DEFAULT_RETURN_PATH, isSafeReturnPath, safeReturnPath } from './safe-return-path'

describe('safeReturnPath — accepts', () => {
  it('keeps an ordinary article path', () => {
    expect(safeReturnPath('/peru/lima/itineraries/5-days-in-lima')).toBe(
      '/peru/lima/itineraries/5-days-in-lima',
    )
  })

  it('accepts an encoded path', () => {
    expect(safeReturnPath(encodeURIComponent('/peru/lima/guides/safety'))).toBe(
      '/peru/lima/guides/safety',
    )
  })

  it('keeps a query string and fragment', () => {
    expect(safeReturnPath('/articles?page=2#top')).toBe('/articles?page=2#top')
  })
})

describe('safeReturnPath — refuses', () => {
  const hostile = [
    ['absolute url', 'https://evil.test/steal'],
    ['protocol-relative', '//evil.test'],
    ['backslash separator', '/\\evil.test'],
    ['javascript scheme', 'javascript:alert(1)'],
    ['data scheme', 'data:text/html,x'],
    ['not rooted', 'peru/lima'],
    ['empty', ''],
    ['newline injection', '/articles\nSet-Cookie: a=b'],
    ['null byte', '/articles\u0000'],
  ] as const

  for (const [name, value] of hostile) {
    it(`refuses ${name}`, () => {
      expect(safeReturnPath(value)).toBe(DEFAULT_RETURN_PATH)
      expect(isSafeReturnPath(value)).toBe(false)
    })
  }

  it('refuses a double-encoded absolute url', () => {
    // One decode happens in safeReturnPath; the value must not survive by being
    // decoded again somewhere later.
    expect(safeReturnPath(encodeURIComponent('https://evil.test'))).toBe(DEFAULT_RETURN_PATH)
  })

  it('refuses an encoded protocol-relative url', () => {
    expect(safeReturnPath('%2F%2Fevil.test')).toBe(DEFAULT_RETURN_PATH)
  })

  it('refuses malformed percent-encoding rather than repairing it', () => {
    expect(safeReturnPath('%E0%A4%A')).toBe(DEFAULT_RETURN_PATH)
  })

  it('refuses a non-string', () => {
    expect(safeReturnPath(undefined)).toBe(DEFAULT_RETURN_PATH)
    expect(safeReturnPath(null)).toBe(DEFAULT_RETURN_PATH)
    expect(safeReturnPath({ toString: () => '/ok' })).toBe(DEFAULT_RETURN_PATH)
  })

  it('refuses an absurdly long path', () => {
    expect(safeReturnPath(`/${'a'.repeat(600)}`)).toBe(DEFAULT_RETURN_PATH)
  })
})
