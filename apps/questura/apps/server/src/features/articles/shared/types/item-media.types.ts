export type ItemMediaBlockSlug =
  | 'data-dining'
  | 'data-accommodations'
  | 'data-attractions'
  | 'data-nightlife'
  | 'itinerary-dining'
  | 'itinerary-accommodations'
  | 'itinerary-where-staying'
  | 'itinerary-attractions'
  | 'itinerary-nightlife'
  | 'itinerary-key-location'

export type ItemMediaSourceCollection =
  | 'dining'
  | 'accommodations'
  | 'attractions'
  | 'nightlife'
  | 'key-locations'

export type MediaMode = 'photos' | 'instagram' | 'both'

export type SourceItemMediaIds = {
  photoIds: Array<string | number>
  instagramPostIds: Array<string | number>
}

export type ItemMediaFieldOptions = {
  mediaModeDbName?: string
  mediaModeEnumName?: string
  modeDescription?: string
  photosDescription?: string
  instagramDescription?: string
}
