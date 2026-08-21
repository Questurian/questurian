import { describe, expect, it } from 'vitest'

import { validateFeaturedBylineLinks } from './articleByline'

describe('featured article byline links', () => {
  it('allows no more than three platforms', () => {
    expect(validateFeaturedBylineLinks(['instagram', 'youtube', 'website'])).toBe(true)
    expect(validateFeaturedBylineLinks(['instagram', 'youtube', 'website', 'facebook'])).toBe(
      'Choose no more than 3 featured byline links.',
    )
  })
})
