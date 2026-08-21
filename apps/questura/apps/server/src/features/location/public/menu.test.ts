import { describe, expect, it } from 'vitest'

import { buildPublicLocationMenu } from './menu'

describe('buildPublicLocationMenu', () => {
  it('groups country pages with city links', () => {
    const menu = buildPublicLocationMenu(
      [
        {
          id: 1,
          level: 'country',
          locationKey: 'peru',
          country: 'peru',
          countryName: 'Peru',
        },
      ],
      [
        {
          id: 10,
          level: 'city',
          locationKey: 'peru|lima',
          country: 'peru',
          city: 'lima',
          countryName: 'Peru',
          cityName: 'Lima',
        },
        {
          id: 11,
          level: 'city',
          locationKey: 'peru|cusco',
          country: 'peru',
          city: 'cusco',
          countryName: 'Peru',
          cityName: 'Cusco',
        },
      ],
    )

    expect(menu).toEqual({
      countries: [
        {
          locationKey: 'peru',
          label: 'Peru',
          countryCode: 'PE',
          href: '/peru',
          cities: [
            { locationKey: 'peru|cusco', label: 'Cusco', href: '/peru/cusco' },
            { locationKey: 'peru|lima', label: 'Lima', href: '/peru/lima' },
          ],
        },
      ],
    })
  })

  it('skips non-city locations in the city list', () => {
    const menu = buildPublicLocationMenu(
      [
        {
          level: 'country',
          locationKey: 'usa',
          countryName: 'United States',
        },
      ],
      [
        {
          level: 'neighborhood',
          locationKey: 'usa|austin|south-congress',
          country: 'usa',
          city: 'austin',
          cityName: 'Austin',
        },
      ],
    )

    expect(menu.countries).toEqual([
      {
        locationKey: 'usa',
        label: 'United States',
        countryCode: 'US',
        href: '/usa',
        cities: [],
      },
    ])
  })

  it('creates a country group for cities when country doc is absent', () => {
    const menu = buildPublicLocationMenu(
      [],
      [
        {
          level: 'city',
          locationKey: 'colombia|bogota',
          country: 'colombia',
          city: 'bogota',
          countryName: 'Colombia',
          cityName: 'Bogota',
        },
      ],
    )

    expect(menu.countries).toEqual([
      {
        locationKey: 'colombia',
        label: 'Colombia',
        countryCode: 'CO',
        href: '/colombia',
        cities: [
          { locationKey: 'colombia|bogota', label: 'Bogota', href: '/colombia/bogota' },
        ],
      },
    ])
  })

  it('falls back to the slug when the display name is missing', () => {
    const menu = buildPublicLocationMenu(
      [{ level: 'country', locationKey: 'united-states', country: 'united-states' }],
      [],
    )

    expect(menu.countries[0]?.countryCode).toBe('US')
  })

  it('leaves countryCode null for names that match no country', () => {
    const menu = buildPublicLocationMenu(
      [{ level: 'country', locationKey: 'atlantis', countryName: 'Atlantis' }],
      [],
    )

    expect(menu.countries[0]?.countryCode).toBeNull()
  })
})
