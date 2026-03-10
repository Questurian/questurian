import { describe, expect, it } from 'vitest'
import {
  attachResolvedCurrencyMeta,
  extractResolvedCurrencyId,
  formatResolvedCurrencyAmount,
  formatResolvedCurrencyLabel,
  resolveLocationGuideForHierarchy,
} from './locationGuideResolution'

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

  it('extracts and enriches a resolved currency selection for consumer reads', () => {
    const resolved = resolveLocationGuideForHierarchy({
      level: 'neighborhood',
      cityGuide: {
        core: {
          moneyHandling: {
            currency: 14,
            cardUsage: 'Cards accepted in most cafes.',
          },
        },
      },
      ownGuide: {
        core: {
          safety: {
            notes: 'Quiet side streets at night.',
          },
        },
      },
    })

    expect(extractResolvedCurrencyId(resolved)).toBe(14)

    const enriched = attachResolvedCurrencyMeta(resolved, {
      id: 14,
      code: 'PEN',
      name: 'Peruvian Sol',
      symbol: 'S/',
      displaySymbol: 'S/',
      defaultLocale: 'es-PE',
      decimalPlaces: 2,
      latestUsdRate: {
        unitsPerUsd: 3.72,
        provider: 'exchange-rate-api-open',
        sourceUpdatedAt: '2026-03-09T00:00:00.000Z',
        nextUpdateAt: '2026-03-10T00:00:00.000Z',
        fetchedAt: '2026-03-09T12:00:00.000Z',
      },
    })

    expect(enriched).toEqual({
      core: {
        moneyHandling: {
          currency: 14,
          cardUsage: 'Cards accepted in most cafes.',
          currencyMeta: {
            id: 14,
            code: 'PEN',
            name: 'Peruvian Sol',
            symbol: 'S/',
            displaySymbol: 'S/',
            defaultLocale: 'es-PE',
            decimalPlaces: 2,
            latestUsdRate: {
              unitsPerUsd: 3.72,
              provider: 'exchange-rate-api-open',
              sourceUpdatedAt: '2026-03-09T00:00:00.000Z',
              nextUpdateAt: '2026-03-10T00:00:00.000Z',
              fetchedAt: '2026-03-09T12:00:00.000Z',
            },
          },
        },
        safety: {
          notes: 'Quiet side streets at night.',
        },
      },
    })

    expect(formatResolvedCurrencyLabel({
      id: 14,
      code: 'PEN',
      name: 'Peruvian Sol',
      symbol: 'S/',
      displaySymbol: 'S/',
      defaultLocale: 'es-PE',
      decimalPlaces: 2,
    })).toBe('Peruvian Sol (PEN)')
    expect(formatResolvedCurrencyAmount(18, {
      id: 14,
      code: 'PEN',
      name: 'Peruvian Sol',
      symbol: 'S/',
      displaySymbol: 'S/',
      defaultLocale: 'es-PE',
      decimalPlaces: 2,
    })).toContain('18')
  })
})
