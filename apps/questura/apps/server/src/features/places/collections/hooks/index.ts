import type { CollectionConfig } from 'payload'
import { syncLocationFields } from '@/shared/location/server/syncLocationFields'
import { capturePlaceDetailTypes } from './capturePlaceDetailTypes'
import { syncPlaceDetails } from './syncPlaceDetails'

export const placeHooks: CollectionConfig['hooks'] = {
  beforeValidate: [syncLocationFields()],
  beforeChange: [capturePlaceDetailTypes],
  afterChange: [syncPlaceDetails],
}
