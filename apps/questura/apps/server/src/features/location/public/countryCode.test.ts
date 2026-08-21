import { describe, expect, it } from 'vitest'

import { resolveCountryCode } from './countryCode'

describe('resolveCountryCode', () => {
  it('resolves display names', () => {
    expect(resolveCountryCode('Peru')).toBe('PE')
    expect(resolveCountryCode('United States')).toBe('US')
  })

  it('resolves hyphenated slugs', () => {
    expect(resolveCountryCode('united-states')).toBe('US')
    expect(resolveCountryCode('south-korea')).toBe('KR')
    expect(resolveCountryCode('bosnia-and-herzegovina')).toBe('BA')
  })

  it('resolves names carrying typographic apostrophes', () => {
    expect(resolveCountryCode('Côte d’Ivoire')).toBe('CI')
  })

  it('walks candidates in order and skips blanks', () => {
    expect(resolveCountryCode(null, '  ', 'Atlantis', 'mexico')).toBe('MX')
  })

  it('returns null when nothing matches', () => {
    expect(resolveCountryCode('Atlantis', undefined)).toBeNull()
    expect(resolveCountryCode()).toBeNull()
  })
})
