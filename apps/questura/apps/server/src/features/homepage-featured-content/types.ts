export const HOMEPAGE_FEATURED_CONTENT_SLOTS = 10
/** Spotlight block: exactly one curated article/listicle. */
export const HOMEPAGE_FEATURED_ARTICLE_SLOT_COUNT = 1
export const HOMEPAGE_HOTEL_GRID_MIN_SLOTS = 3
export const HOMEPAGE_HOTEL_GRID_MAX_SLOTS = 12
export const HOMEPAGE_WHERE_TO_EAT_DRINK_MIN_SLOTS = 3
export const HOMEPAGE_WHERE_TO_EAT_DRINK_MAX_SLOTS = 12
export const HOMEPAGE_THINGS_TO_DO_LISTICLES_MIN_SLOTS = 3
export const HOMEPAGE_THINGS_TO_DO_LISTICLES_MAX_SLOTS = 12
export const HOMEPAGE_THINGS_TO_DO_ATTRACTIONS_MIN_SLOTS = 3
export const HOMEPAGE_THINGS_TO_DO_ATTRACTIONS_MAX_SLOTS = 12
export const HOMEPAGE_TOUR_GRID_MIN_SLOTS = 3
export const HOMEPAGE_TOUR_GRID_MAX_SLOTS = 12
/** Questurian Maps: fixed six single-type listicle slots. */
export const HOMEPAGE_QUESTURIAN_MAPS_SLOT_COUNT = 6

export {
  HOMEPAGE_FEATURED_CONTENT_COLLECTIONS,
  type HomepageFeaturedAuthor,
  type HomepageFeaturedCandidate,
  type HomepageFeaturedCategory,
  type HomepageFeaturedCollection,
  type HomepageFeaturedInvalidItem,
  type HomepageFeaturedInvalidReason,
  type HomepageFeaturedItemRef,
  type HomepageFeaturedSelection,
} from './featured-articles/types/homepage-featured.types'

export type {
  HomepageFeaturedCandidatesResponse,
  HomepageFeaturedPlaceholderOptions,
  HomepageFeaturedSearchOptions,
  HomepageFeaturedSelectionOptions,
  HomepageFeaturedValidationOptions,
} from './featured-articles/types/homepage-featured.api'

export type {
  ParsedHomepageFeaturedSlot,
  PayloadDocLike,
  PayloadFindWhere,
} from './featured-articles/types/homepage-featured.internal.types'

export type {
  HomepageHotelCandidate,
  HomepageHotelCandidatesResponse,
  HomepageHotelInvalidItem,
  HomepageHotelInvalidReason,
  HomepageHotelItemRef,
  HomepageHotelSelection,
} from './hotel-grid/types'

export type {
  HomepageTourCandidate,
  HomepageTourCandidatesResponse,
  HomepageTourInvalidItem,
  HomepageTourInvalidReason,
  HomepageTourItemRef,
  HomepageTourSelection,
} from './tour-grid/types'
