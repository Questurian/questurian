/**
 * Public type surface for the listicle-itinerary feature.
 *
 * This stays a barrel because ~110 modules import from it. The definitions live
 * in ./model, grouped by concern (block types, angles, list tone, traveler
 * profile, moments, day shells, tour agency, SEO, draft, Payload doc).
 */

export type {
  GalleryImageObject,
  GalleryMediaAsset,
  InstagramPostOption,
  InstagramPreviewAsset,
  LinkedTourOption,
  MediaAssetOption,
  MediaMode
} from '../../shared/builder/types'
export { TOUR_PICKS_MAX } from '../../shared/builder/types'

export type { ItineraryBlockType, RelatedItemCollection } from './model/blockTypes'
export {
  TOUR_AGENCY_BLOCK_TYPE,
  WHERE_STAYING_BLOCK_TYPE,
  isManualItineraryBlockType,
  isWhereStayingBlockType,
  isRelatedItemCollection,
  relatedCollectionToBlockType
} from './model/blockTypes'

export type { ListicleAngle, ListicleAngleOption } from './model/angles'
export {
  ACCOMMODATIONS_LISTICLE_ANGLE_OPTIONS,
  ATTRACTIONS_LISTICLE_ANGLE_OPTIONS,
  DINING_LISTICLE_ANGLE_OPTIONS,
  LISTICLE_ANGLE_OPTIONS,
  NIGHTLIFE_DEFAULT_ANGLE,
  NIGHTLIFE_LISTICLE_ANGLE_OPTIONS,
  getItineraryAngleOptions,
  resolveItineraryAngleForBlockType,
  resolveListicleAngle
} from './model/angles'

export type { ListTone } from './model/listTone'
export { DEFAULT_LIST_TONE, LIST_TONE_OPTIONS, resolveListTone } from './model/listTone'

export type { TravelerProfile, TravelerProfileBudget } from './model/travelerProfile'
export {
  createEmptyTravelerProfile,
  isTravelerProfileEmpty
} from './model/travelerProfile'

export type { ItineraryMoment } from './model/moments'
export { ITINERARY_MOMENTS, isItineraryMoment } from './model/moments'

export type {
  DayShellId,
  DayShellSelection,
  DayShellSlot,
  DayShellTemplate,
  ShellSlotCollection,
  ShellSlotDaypart
} from './model/dayShells'

export type {
  TourAgencyKeyLocationRow,
  TourAgencyKeyLocationSource,
  TourAgencyPriceTier,
  TourAgencyStartingPoint
} from './model/tourAgency'
export { TOUR_AGENCY_PRICE_TIERS, isTourAgencyPriceTier } from './model/tourAgency'

export type { SeoSection, SeoTwitterCardType } from './model/seo'

export type { PayloadRichText, PolymorphicRelatedItemValue } from './model/common'

export type {
  ItineraryDaySlice,
  ItineraryItemBlock,
  ListicleItineraryDraft
} from './model/draft'
export {
  createEmptyDaySlice,
  findItineraryItemById,
  getItineraryBlocksInArticleOrder,
  resizeItineraryDays,
  resolveItineraryStopIdentityKey
} from './model/draft'

export type {
  LocationOption,
  PayloadItineraryAuthor,
  PayloadItineraryDoc,
  PayloadListResponse,
  RelatedItemOption
} from './model/payloadDoc'
