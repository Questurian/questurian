import { describe, expect, it } from 'vitest'

import {
  normalizeLocationGridMediaAspect,
  parseLocationGridMediaAspectBodyField,
  publicLocationGridMediaAspect,
} from './media-aspect'

describe('location-grid-media-aspect', () => {
  it('normalizes unknown values to rectangle', () => {
    expect(normalizeLocationGridMediaAspect(undefined)).toBe('rectangle')
    expect(normalizeLocationGridMediaAspect('')).toBe('rectangle')
    expect(normalizeLocationGridMediaAspect('wide')).toBe('rectangle')
  })

  it('accepts valid aspect strings', () => {
    expect(normalizeLocationGridMediaAspect('square')).toBe('square')
    expect(normalizeLocationGridMediaAspect('portrait')).toBe('portrait')
    expect(normalizeLocationGridMediaAspect('rectangle')).toBe('rectangle')
  })

  it('parses body field', () => {
    expect(parseLocationGridMediaAspectBodyField({})).toEqual({ ok: true, omit: true })
    expect(parseLocationGridMediaAspectBodyField({ mediaAspect: 'square' })).toEqual({
      ok: true,
      omit: false,
      value: 'square',
    })
    expect(parseLocationGridMediaAspectBodyField({ mediaAspect: null })).toEqual({
      ok: true,
      omit: false,
      value: 'rectangle',
    })
    expect(parseLocationGridMediaAspectBodyField({ mediaAspect: 'tall' }).ok).toBe(false)
  })

  it('publicLocationGridMediaAspect reads block field', () => {
    expect(publicLocationGridMediaAspect({})).toBe('rectangle')
    expect(publicLocationGridMediaAspect({ mediaAspect: 'portrait' })).toBe('portrait')
  })
})
