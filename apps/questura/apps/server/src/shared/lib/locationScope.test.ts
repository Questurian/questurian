import { describe, expect, it } from 'vitest'
import {
  isLocationWithinScope,
  normalizeLocationKey,
  parseLocationKey,
} from '../location/server/locationScope'

describe('locationScope utilities', () => {
  it('normalizes location keys', () => {
    expect(normalizeLocationKey(' Peru | Lima | Miraflores ')).toBe('peru|lima|miraflores')
  })

  it('parses location keys into segments', () => {
    expect(parseLocationKey('peru|lima')).toEqual(['peru', 'lima'])
  })

  it('matches city selection to neighborhood documents', () => {
    expect(isLocationWithinScope('peru|lima|miraflores', 'peru|lima')).toBe(true)
  })

  it('matches exact city location', () => {
    expect(isLocationWithinScope('peru|lima', 'peru|lima')).toBe(true)
  })

  it('matches country selection to all descendants', () => {
    expect(isLocationWithinScope('peru|lima|barranco', 'peru')).toBe(true)
  })

  it('rejects different city', () => {
    expect(isLocationWithinScope('peru|cusco|centro', 'peru|lima')).toBe(false)
  })

  it('rejects different country', () => {
    expect(isLocationWithinScope('chile|santiago', 'peru')).toBe(false)
  })

  it('rejects less specific item when parent is more specific', () => {
    expect(isLocationWithinScope('peru|lima', 'peru|lima|miraflores')).toBe(true)
  })

  it('matches sibling neighborhood when parent is neighborhood', () => {
    expect(isLocationWithinScope('peru|lima|barranco', 'peru|lima|miraflores')).toBe(true)
  })

  it('rejects other city when parent is neighborhood', () => {
    expect(isLocationWithinScope('peru|cusco|centro', 'peru|lima|miraflores')).toBe(false)
  })
})
