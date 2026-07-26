import {
  accommodationTypeOptions,
  attractionTypeOptions,
  diningTypeOptions,
  nightlifeTypeOptions,
} from './collections/details'
import type { PlaceDetailConfig } from './types/placeDetails'

export const PLACE_DETAIL_CONFIGS = [
  {
    categorySlug: 'dining',
    label: 'Dining Type',
    fieldName: 'diningType',
    options: diningTypeOptions,
    detailCollection: 'dining-details',
  },
  {
    categorySlug: 'accommodations',
    label: 'Accommodation Type',
    fieldName: 'accommodationType',
    options: accommodationTypeOptions,
    detailCollection: 'accommodation-details',
  },
  {
    categorySlug: 'nightlife',
    label: 'Nightlife Type',
    fieldName: 'nightlifeType',
    options: nightlifeTypeOptions,
    detailCollection: 'nightlife-details',
  },
  {
    categorySlug: 'attractions',
    label: 'Attraction Type',
    fieldName: 'attractionType',
    options: attractionTypeOptions,
    detailCollection: 'attraction-details',
  },
] as const satisfies readonly PlaceDetailConfig[]
