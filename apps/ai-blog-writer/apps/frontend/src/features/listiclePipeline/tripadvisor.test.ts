import { describe, expect, it } from 'vitest'
import { isTripAdvisorPlaceLink } from './tripadvisor'

describe('a TripAdvisor place link', () => {
  it.each([
    'https://www.tripadvisor.com/Restaurant_Review-g294316-d12345678-Reviews-Wingman-Lima_Lima_Region.html',
    'https://www.tripadvisor.com.pe/Restaurant_Review-g294316-d12345678-Reviews-Wingman-Lima_Lima_Region.html',
    'https://es.tripadvisor.com/Restaurant_Review-g294316-d12345678-Reviews-Wingman.html',
    'https://www.tripadvisor.co.uk/Attraction_Review-g294316-d311024-Reviews-Parque_Kennedy-Lima.html',
    'www.tripadvisor.com/Hotel_Review-g294316-d302203-Reviews-Belmond_Miraflores_Park-Lima.html',
    '  https://www.tripadvisor.com/Restaurant_Review-g294316-d12345678  ',
  ])('accepts %s', link => {
    expect(isTripAdvisorPlaceLink(link)).toBe(true)
  })

  it.each([
    ['another site', 'https://www.youtube.com/watch?v=abc'],
    ['a look-alike host', 'https://tripadvisor.com.evil.example/Restaurant_Review-g1-d12345678'],
    ['the home page', 'https://www.tripadvisor.com/'],
    ['a search page', 'https://www.tripadvisor.com/Search?q=wingman+lima'],
    ['a city page, not a place', 'https://www.tripadvisor.com/Restaurants-g294316-Lima_Lima_Region.html'],
    ['not a link', 'wingman lima'],
    ['empty', ''],
  ])('refuses %s', (_why, link) => {
    expect(isTripAdvisorPlaceLink(link)).toBe(false)
  })
})
