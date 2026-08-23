import { describe, expect, it, vi } from 'vitest'

import { resolveAuthorFeatureFields } from './resolve'

describe('resolveAuthorFeatureFields', () => {
  it('resolves custom description and only selected expertise', async () => {
    const payload = {
      findByID: vi.fn(async () => ({
        id: 7,
        displayName: 'Alan Malpartida',
        slug: 'alan-malpartida',
        bio: 'Profile biography.',
        expertise: [
          { area: 'Lima, Peru' },
          { area: 'Peruvian Restaurants' },
          { area: 'Digital Nomad' },
        ],
        authorImages: [],
      })),
    }

    const resolved = await resolveAuthorFeatureFields(payload as never, {
      authorCards: [{ author: 7 }],
      descriptionMode: 'custom',
      sectionSubheading: 'Custom homepage description.',
      expertiseMode: 'selected',
      selectedExpertise: [{ area: 'Digital Nomad' }, { area: 'Invented Expertise' }],
    })

    expect(resolved.authorCard).toEqual(
      expect.objectContaining({
        displayDescription: 'Custom homepage description.',
        displayExpertise: ['Digital Nomad'],
      }),
    )
    expect(resolved.selectedExpertise).toEqual(['Digital Nomad'])
  })

  it('uses profile bio and expertise by default', async () => {
    const payload = {
      findByID: vi.fn(async () => ({
        id: 7,
        bio: 'Profile biography.',
        expertise: [{ area: 'Lima, Peru' }, { area: 'Digital Nomad' }],
        authorImages: [],
      })),
    }

    const resolved = await resolveAuthorFeatureFields(payload as never, {
      authorCards: [{ author: 7 }],
    })

    expect(resolved.authorCard).toEqual(
      expect.objectContaining({
        displayDescription: 'Profile biography.',
        displayExpertise: ['Lima, Peru', 'Digital Nomad'],
      }),
    )
  })
})
