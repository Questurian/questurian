import { describe, expect, it } from 'vitest'

import { isPriceTier, normalizePriceTier, priceTierOptions } from './priceTier'

describe('priceTierOptions', () => {
  it('stores GraphQL-safe values and shows ticks', () => {
    // The reason this module exists: Payload builds GraphQL enum member names
    // from option values, and a '$' value breaks the whole schema build.
    expect(priceTierOptions.map((o) => o.value)).toEqual(['1', '2', '3', '4'])
    expect(priceTierOptions.map((o) => o.label)).toEqual(['$', '$$', '$$$', '$$$$'])
    for (const option of priceTierOptions) {
      expect(option.value).toMatch(/^[_a-zA-Z0-9][_a-zA-Z0-9]*$/)
    }
  })
})

describe('normalizePriceTier', () => {
  it('maps legacy ticks to the stored tier', () => {
    expect(normalizePriceTier('$')).toBe('1')
    expect(normalizePriceTier('$$')).toBe('2')
    expect(normalizePriceTier('$$$')).toBe('3')
    expect(normalizePriceTier('$$$$')).toBe('4')
  })

  it('tolerates surrounding whitespace from synced payloads', () => {
    expect(normalizePriceTier(' $$$ ')).toBe('3')
  })

  it('leaves an already-stored tier alone', () => {
    expect(normalizePriceTier('2')).toBe('2')
  })

  it('passes unknown values through so select validation still rejects them', () => {
    // Silently blanking a bad value would turn an editor's mistake into a
    // missing price nobody notices.
    expect(normalizePriceTier('From $89')).toBe('From $89')
    expect(normalizePriceTier('cheap')).toBe('cheap')
  })

  it('leaves empty and nullish values alone -- the field is optional', () => {
    expect(normalizePriceTier('')).toBe('')
    expect(normalizePriceTier(null)).toBeNull()
    expect(normalizePriceTier(undefined)).toBeUndefined()
  })
})

describe('isPriceTier', () => {
  it('accepts only the stored encoding', () => {
    expect(isPriceTier('1')).toBe(true)
    expect(isPriceTier('4')).toBe(true)
    expect(isPriceTier('$$')).toBe(false)
    expect(isPriceTier('5')).toBe(false)
    expect(isPriceTier(2)).toBe(false)
  })
})
