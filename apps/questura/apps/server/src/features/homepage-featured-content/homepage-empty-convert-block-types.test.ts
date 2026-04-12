import { describe, expect, it } from 'vitest'

import { isHomepageBlockConvertibleWhenEmpty } from './homepage-empty-convert-block-types'

describe('isHomepageBlockConvertibleWhenEmpty', () => {
  it('allows known curated slugs', () => {
    expect(isHomepageBlockConvertibleWhenEmpty('location-grid')).toBe(true)
    expect(isHomepageBlockConvertibleWhenEmpty('hotel-grid')).toBe(true)
  })

  it('rejects unknown', () => {
    expect(isHomepageBlockConvertibleWhenEmpty('not-a-block')).toBe(false)
  })
})
