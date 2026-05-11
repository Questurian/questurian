import {
  RESERVED_SLUGS,
  RESERVED_LANG_PREFIXES,
  validateCountrySlugAgainstReserved,
  validateSlugAgainstReserved,
} from './reservedSlugs'

describe('reservedSlugs', () => {
  describe('validateSlugAgainstReserved', () => {
    it('rejects empty / non-string slugs', () => {
      expect(validateSlugAgainstReserved('')).toEqual(expect.any(String))
      expect(validateSlugAgainstReserved(null)).toEqual(expect.any(String))
      expect(validateSlugAgainstReserved(undefined)).toEqual(expect.any(String))
      expect(validateSlugAgainstReserved(42)).toEqual(expect.any(String))
    })

    it('rejects every entry in the reserved list (case-insensitive)', () => {
      for (const reserved of RESERVED_SLUGS) {
        expect(validateSlugAgainstReserved(reserved)).toEqual(expect.any(String))
        expect(validateSlugAgainstReserved(reserved.toUpperCase())).toEqual(expect.any(String))
      }
    })

    it('rejects non-kebab-case formats', () => {
      expect(validateSlugAgainstReserved('Hello-World')).toEqual(expect.any(String))
      expect(validateSlugAgainstReserved('hello_world')).toEqual(expect.any(String))
      expect(validateSlugAgainstReserved('-leading-hyphen')).toEqual(expect.any(String))
      expect(validateSlugAgainstReserved('trailing-hyphen-')).toEqual(expect.any(String))
      expect(validateSlugAgainstReserved('with spaces')).toEqual(expect.any(String))
      expect(validateSlugAgainstReserved('with/slash')).toEqual(expect.any(String))
    })

    it('accepts valid kebab-case slugs not in reserved list', () => {
      expect(validateSlugAgainstReserved('lima-digital-nomad-guide')).toBe(true)
      expect(validateSlugAgainstReserved('medellin')).toBe(true)
      expect(validateSlugAgainstReserved('top-10-cafes-2026')).toBe(true)
      expect(validateSlugAgainstReserved('a')).toBe(true)
      expect(validateSlugAgainstReserved('peru')).toBe(true)
    })
  })

  describe('validateCountrySlugAgainstReserved', () => {
    it('rejects language prefix codes at country level', () => {
      for (const lang of RESERVED_LANG_PREFIXES) {
        expect(validateCountrySlugAgainstReserved(lang)).toEqual(expect.any(String))
      }
    })

    it('accepts valid country slugs', () => {
      expect(validateCountrySlugAgainstReserved('peru')).toBe(true)
      expect(validateCountrySlugAgainstReserved('united-states')).toBe(true)
      expect(validateCountrySlugAgainstReserved('costa-rica')).toBe(true)
    })

    it('also enforces base reserved-word rules', () => {
      expect(validateCountrySlugAgainstReserved('articles')).toEqual(expect.any(String))
      expect(validateCountrySlugAgainstReserved('api')).toEqual(expect.any(String))
    })
  })
})
