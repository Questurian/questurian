import { describe, expect, it } from 'vitest'

import { MAX_RESULT_WINDOW, clampPageSize, resolvePagingWindow } from './paging'

describe('clampPageSize', () => {
  it('falls back to the default for missing or unusable values', () => {
    expect(clampPageSize(null, 20, 50).valueOf()).toBe(20)
    expect(clampPageSize('', 20, 50)).toBe(20)
    expect(clampPageSize('nope', 20, 50)).toBe(20)
    expect(clampPageSize('0', 20, 50)).toBe(20)
    expect(clampPageSize('-5', 20, 50)).toBe(20)
  })

  it('caps at the maximum and truncates fractions', () => {
    expect(clampPageSize('5000', 20, 50)).toBe(50)
    expect(clampPageSize('7.9', 20, 50)).toBe(7)
  })
})

describe('resolvePagingWindow', () => {
  it('treats a missing page as page 1', () => {
    expect(resolvePagingWindow(null, 20)).toEqual({ ok: true, page: 1, pageSize: 20, offset: 0 })
  })

  it('computes the offset from the page size', () => {
    expect(resolvePagingWindow('3', 20)).toEqual({ ok: true, page: 3, pageSize: 20, offset: 40 })
  })

  it('rejects values that are not whole positive numbers', () => {
    for (const raw of ['0', '-1', '1.5', 'abc', '1e999', 'Infinity']) {
      const result = resolvePagingWindow(raw, 20)
      expect(result.ok, `page=${raw} should be rejected`).toBe(false)
    }
  })

  // The bound is the finding: the response was always one page, but the read
  // behind it grew with the page number, and a crawler supplies the number.
  it('rejects a page past the result window before any read happens', () => {
    const lastAllowed = MAX_RESULT_WINDOW / 20
    expect(resolvePagingWindow(String(lastAllowed), 20).ok).toBe(true)
    expect(resolvePagingWindow(String(lastAllowed + 1), 20).ok).toBe(false)
    expect(resolvePagingWindow('999999999', 50).ok).toBe(false)
  })

  it('reports why a rejected page was rejected', () => {
    const result = resolvePagingWindow('999999999', 50)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain('result window')
  })
})
