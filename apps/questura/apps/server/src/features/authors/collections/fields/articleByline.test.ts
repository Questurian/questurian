import { describe, expect, it } from 'vitest'

import { validateFeaturedBylineLinks } from './articleByline'

describe('featured article byline links', () => {
  it('allows no more than three platforms', () => {
    const data = {
      socialLinks: {
        instagram: 'https://instagram.com/creator',
        youtube: 'https://youtube.com/@creator',
        website: 'https://creator.example',
      },
    }

    expect(validateFeaturedBylineLinks(['instagram', 'youtube', 'website'], { data })).toBe(true)
    expect(validateFeaturedBylineLinks(['instagram', 'youtube', 'website', 'facebook'])).toBe(
      'Choose no more than 3 featured byline links.',
    )
  })

  it('requires every featured platform to have a configured URL', () => {
    expect(
      validateFeaturedBylineLinks(['instagram', 'youtube'], {
        data: { socialLinks: { instagram: 'https://instagram.com/creator' } },
      }),
    ).toBe('Add a YouTube URL under Social Links or remove it from featured byline links.')
  })
})
