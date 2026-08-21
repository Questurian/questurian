import { describe, expect, it } from 'vitest'

import { locationLabelFromDoc, locationLabelFromLocationRef } from '../../reference-grid/candidate'
import { normalizeHotelCandidate } from './candidate'

describe('locationLabelFromLocationRef', () => {
  it('joins country, city, and neighborhood display names', () => {
    expect(
      locationLabelFromLocationRef({
        countryName: 'Peru',
        cityName: 'Lima',
        neighborhoodName: 'Miraflores',
      }),
    ).toBe('Peru, Lima, Miraflores')
  })

  it('title-cases a pipe key when display names are missing', () => {
    expect(locationLabelFromLocationRef({ locationKey: 'peru|lima|barranco' })).toBe(
      'Peru, Lima, Barranco',
    )
  })
})

describe('locationLabelFromDoc', () => {
  it('prefers locationRef over a pipe location key', () => {
    expect(
      locationLabelFromDoc(
        { countryName: 'Peru', cityName: 'Lima' },
        'peru|lima|miraflores',
      ),
    ).toBe('Peru, Lima')
  })

  it('falls back to a pipe location key', () => {
    expect(locationLabelFromDoc(null, 'peru|lima')).toBe('Peru, Lima')
  })
})

describe('normalizeHotelCandidate', () => {
  it('uses district or neighborhood only and picks distinct highlight kinds', () => {
    const candidate = normalizeHotelCandidate({
      id: 12,
      title: 'Hotel B',
      type: 'hotel',
      priceLevel: '3',
      status: 'published',
      location: 'peru|lima|barranco',
      locationRef: {
        countryName: 'Peru',
        cityName: 'Lima',
        neighborhoodName: 'Barranco',
      },
      core: { price: '4', district: 'Barranco', type: 'Boutique' },
      theStay: { wifi: true, breakfastServed: true },
      theExperience: { vibe: ['Luxury', 'Boutique', 'Quiet'], pool: ['rooftop', 'outdoor'] },
      theDetails: {
        walkability: 'Walkable Downtown',
        address: 'Hotel B, Jirón de la Unión 267, Barranco, Lima',
        bookingUrl: 'hotel-b.example.com',
      },
    })

    expect(candidate).toMatchObject({
      title: 'Hotel B',
      type: 'Boutique',
      priceLevel: '4',
      location: 'Barranco',
      dek: null,
      bookingUrl: 'https://hotel-b.example.com/',
      highlights: [
        { key: 'luxury', label: 'Luxury' },
        { key: 'walkability', label: 'Walkable Downtown' },
        { key: 'pool', label: 'Rooftop pool' },
      ],
    })
  })

  it('falls back to neighborhood when district is missing and skips empty booking urls', () => {
    const candidate = normalizeHotelCandidate({
      id: 8,
      title: 'Casa Quiet',
      type: 'guesthouse',
      location: 'peru|lima|miraflores',
      locationRef: {
        countryName: 'Peru',
        cityName: 'Lima',
        neighborhoodName: 'Miraflores',
      },
      theStay: { breakfastServed: true, kidFriendly: true, wifi: true },
      theExperience: { vibe: ['Quiet'], gym: 'None', restaurant: true },
      theDetails: { bookingUrl: 'not a url' },
    })

    expect(candidate.dek).toBeNull()
    expect(candidate.bookingUrl).toBeNull()
    expect(candidate.location).toBe('Miraflores')
    expect(candidate.highlights).toEqual([
      { key: 'quiet', label: 'Quiet' },
      { key: 'breakfast', label: 'Breakfast served' },
      { key: 'restaurant', label: 'Restaurant' },
    ])
  })
})
