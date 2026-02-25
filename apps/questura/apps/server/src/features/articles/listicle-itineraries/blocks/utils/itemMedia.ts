import {
  createItemMediaFields,
  type ItemMediaSourceCollection,
} from '../../../shared/utils/itemMedia'

const itineraryMediaFieldOptions = {
  mediaModeEnumName: 'itm_media_mode',
  modeDescription: 'Select whether this itinerary stop uses photos, Instagram, or both.',
}

export const createItineraryItemMediaFields = (
  sourceCollection: ItemMediaSourceCollection,
) => createItemMediaFields(sourceCollection, itineraryMediaFieldOptions)
