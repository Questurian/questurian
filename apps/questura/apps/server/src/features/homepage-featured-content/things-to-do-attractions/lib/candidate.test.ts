import { describe, expect, it } from 'vitest'

import { normalizeAttractionCandidate } from './candidate'

describe('normalizeAttractionCandidate', () => {
  it('uses locationRef, structured type/pricing, and visit booking', () => {
    const candidate = normalizeAttractionCandidate({
      id: 9,
      title: 'Larco Museum',
      type: 'museum',
      priceLevel: '2',
      location: 'peru|lima',
      locationRef: { countryName: 'Peru', cityName: 'Lima' },
      attractionsDetails: {
        core: { attractionType: 'Museum', pricing: 'From $15' },
        visit: { bookingRequired: true, bookingUrl: 'https://larco.example.com' },
      },
    })

    expect(candidate).toMatchObject({
      type: 'Museum',
      priceLevel: 'From $15',
      location: 'Peru, Lima',
      bookingUrl: 'https://larco.example.com/',
      highlights: [{ key: 'booking', label: 'Booking required' }],
    })
  })
})
