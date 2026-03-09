import { describe, expect, it } from 'vitest'
import { resolveLocationGuideForHierarchy } from './locationGuideResolution'

describe('resolveLocationGuideForHierarchy', () => {
  it('uses country media as a fallback for city docs without copying extra authored sections', () => {
    const resolved = resolveLocationGuideForHierarchy({
      level: 'city',
      countryGuide: {
        media: {
          coverImage: 91,
        },
      },
      ownGuide: {
        core: {
          moneyHandling: {
            atmAvailability: 'Widely available',
          },
        },
      },
    })

    expect(resolved).toEqual({
      media: {
        coverImage: 91,
      },
      core: {
        moneyHandling: {
          atmAvailability: 'Widely available',
        },
      },
    })
  })

  it('treats neighborhood docs as overlays on top of city content', () => {
    const resolved = resolveLocationGuideForHierarchy({
      level: 'neighborhood',
      countryGuide: {
        media: {
          coverImage: 22,
        },
      },
      cityGuide: {
        core: {
          safety: {
            status: 'Use normal caution',
            notes: 'Stay alert after dark.',
          },
          moneyHandling: {
            atmAvailability: 'Common in commercial zones',
            cardUsage: 'Cards accepted in most cafes.',
          },
        },
        explore: {
          intro: 'Big-city base for first-time visitors.',
        },
      },
      ownGuide: {
        core: {
          safety: {
            notes: 'Quieter residential streets near the park.',
          },
        },
        explore: {
          intro: 'Leafy neighborhood with a slower pace.',
        },
      },
    })

    expect(resolved).toEqual({
      media: {
        coverImage: 22,
      },
      core: {
        safety: {
          status: 'Use normal caution',
          notes: 'Quieter residential streets near the park.',
        },
        moneyHandling: {
          atmAvailability: 'Common in commercial zones',
          cardUsage: 'Cards accepted in most cafes.',
        },
      },
      explore: {
        intro: 'Leafy neighborhood with a slower pace.',
      },
    })
  })

  it('replaces arrays only when the overlay provides a non-empty array', () => {
    const resolved = resolveLocationGuideForHierarchy({
      level: 'neighborhood',
      cityGuide: {
        core: {
          healthSafety: {
            emergencyNumbers: [
              { service: 'Police', number: '123' },
            ],
          },
        },
      },
      ownGuide: {
        core: {
          healthSafety: {
            emergencyNumbers: [],
          },
        },
      },
    })

    expect(resolved).toEqual({
      core: {
        healthSafety: {
          emergencyNumbers: [
            { service: 'Police', number: '123' },
          ],
        },
      },
    })
  })
})
