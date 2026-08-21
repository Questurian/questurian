import { describe, expect, it } from 'vitest'

import { formatTourPrice, normalizeTourCandidate } from './candidate'

describe('formatTourPrice', () => {
  it('turns a bare amount into From $N', () => {
    expect(formatTourPrice('$105')).toBe('From $105')
    expect(formatTourPrice('45')).toBe('From $45')
    expect(formatTourPrice('$1,250.00')).toBe('From $1,250')
  })

  it('keeps an existing From prefix', () => {
    expect(formatTourPrice('from $45 per person')).toBe('From $45 per person')
  })
})

describe('normalizeTourCandidate', () => {
  it('uses city or neighborhood, formats price, and names the booking provider', () => {
    const candidate = normalizeTourCandidate({
      id: 4,
      title: 'Lima: Ultimate Peruvian Food Tour',
      price: '$105',
      bookingLink: 'https://www.viator.com/lima-food',
      locationRef: {
        countryName: 'Peru',
        cityName: 'Lima',
        neighborhoodName: 'Miraflores',
      },
      status: 'published',
    })

    expect(candidate).toMatchObject({
      type: null,
      priceLevel: 'From $105',
      location: 'Miraflores',
      slug: 'https://www.viator.com/lima-food',
      bookingUrl: 'https://www.viator.com/lima-food',
      highlights: [{ key: 'provider', label: 'Viator' }],
    })
  })

  it('falls back to city when there is no neighborhood and skips unknown hosts', () => {
    const candidate = normalizeTourCandidate({
      id: 5,
      title: 'City walk',
      price: 'From $45',
      bookingLink: 'https://local-guide.example.com/walk',
      locationRef: { countryName: 'Peru', cityName: 'Lima' },
    })

    expect(candidate.priceLevel).toBe('From $45')
    expect(candidate.location).toBe('Lima')
    expect(candidate.highlights).toEqual([])
  })
})
