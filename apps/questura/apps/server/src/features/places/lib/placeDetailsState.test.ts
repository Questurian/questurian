import { describe, expect, it } from 'vitest'

import { PLACE_DETAIL_CONFIGS } from '../placeDetailsConfig'
import {
  extractRelationshipIds,
  getActivePlaceDetailConfigs,
  mapDetailResponsesToValues,
  parsePlaceCategories,
} from './placeDetailsState'

describe('place details state mapping', () => {
  it('extracts valid relationship ids from Payload relationship values', () => {
    expect(
      extractRelationshipIds([
        12,
        'category-id',
        { id: 42, slug: 'dining' },
        { id: '' },
        { slug: 'nightlife' },
        null,
      ]),
    ).toEqual([12, 'category-id', 42])
    expect(extractRelationshipIds(null)).toEqual([])
  })

  it('parses category documents and selects known detail configs in display order', () => {
    const categories = parsePlaceCategories({
      docs: [
        { id: 4, slug: 'attractions', name: 'Attractions' },
        { id: 1, slug: 'dining', name: 'Dining' },
        { id: 8, slug: 'unknown' },
        { id: null, slug: 'nightlife' },
      ],
    })

    expect(categories).toEqual([
      { id: 4, slug: 'attractions' },
      { id: 1, slug: 'dining' },
      { id: 8, slug: 'unknown' },
    ])
    expect(getActivePlaceDetailConfigs(categories)).toEqual([
      PLACE_DETAIL_CONFIGS[0],
      PLACE_DETAIL_CONFIGS[3],
    ])
  })

  it('maps the first existing detail type to its virtual Payload field', () => {
    expect(
      mapDetailResponsesToValues({
        'dining-details': { docs: [{ type: 'restaurant' }] },
        'accommodation-details': { docs: [] },
        'nightlife-details': { docs: [{ type: '' }] },
        'attraction-details': { docs: [{ type: 'museum' }, { type: 'park' }] },
      }),
    ).toEqual({
      diningType: 'restaurant',
      attractionType: 'museum',
    })
  })
})
