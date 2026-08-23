import type { HomepageFeaturedSelection } from './types'
import type {
  HomepageLocationGridSelection,
  LocationGridMediaAspect
} from './locationGridTypes'
import type { HomepageHotelGridSelection } from './hotelGridTypes'

export type FeaturedArticleBlockResponse = {
  id: string
  blockType: 'featured-article'
  selection: HomepageFeaturedSelection
  sectionHeading: string | null
  sectionSubheading: string | null
}

export type FeaturedCreatorArticleBlockResponse = {
  id: string
  blockType: 'featured-creator-article'
  selection: HomepageFeaturedSelection
  sectionHeading: string | null
  sectionSubheading: string | null
  creatorKicker: string | null
}

export type FeaturedArticleCarouselBlockResponse = {
  id: string
  blockType: 'featured-article-carousel'
  selection: HomepageFeaturedSelection
  sectionHeading: string | null
  sectionSubheading: string | null
}

/** Stored on Payload for `featured-articles` when slot count is 3. */
export type FeaturedArticlesSlot3Layout = 'hero-left' | 'featured-center'

/** Stored when slot count is 4. */
export type FeaturedArticlesSlot4Layout = 'sidebar-stack' | 'one-over-three'

/** Stored when slot count is 5. */
export type FeaturedArticlesSlot5Layout = 'card-grid' | 'hero-sidebar'

export type FeaturedArticlesBlockResponse = {
  id: string
  blockType: 'featured-articles'
  selection: HomepageFeaturedSelection
  /** Optional label for this block on the public homepage (e.g. section title). */
  sectionHeading: string | null
  sectionSubheading: string | null
  /** Present when `selection.totalSlots === 3`; drives editor + public layout. */
  slot3Layout?: FeaturedArticlesSlot3Layout | null
  /** Present when `selection.totalSlots === 4`. */
  slot4Layout?: FeaturedArticlesSlot4Layout | null
  /** Present when `selection.totalSlots === 5`. */
  slot5Layout?: FeaturedArticlesSlot5Layout | null
}

export type EditorialFeaturePublicImage = {
  url: string | null
  alt: string
  width: number | null
  height: number | null
  variant: string | null
  status: string
}

export type EditorialFeatureLinkedLocation = {
  id: number
  label: string | null
  locationKey: string | null
  href: string | null
  isLinkable: boolean
}

export type EditorialFeatureBlockResponse = {
  id: string
  blockType: 'editorial-feature'
  selection: HomepageFeaturedSelection
  sectionHeading?: string | null
  sectionSubheading?: string | null
  featureKicker: string | null
  featureTitle: string | null
  featureDescription: string | null
  featureMediaSetId: number | null
  featureImagePortrait: EditorialFeaturePublicImage | null
  featureImageWide: EditorialFeaturePublicImage | null
  featureImageAltReady: boolean
  linkedLocationId: number | null
  linkedLocation: EditorialFeatureLinkedLocation | null
  linkWarning: string | null
}

export type AuthorFeatureImageStyle = 'circle' | 'square' | 'portrait'
export type AuthorFeatureMotionStyle = 'none' | 'subtle'
export type AuthorFeatureDescriptionMode = 'profile' | 'custom'
export type AuthorFeatureExpertiseMode = 'profile' | 'selected'

export type AuthorFeatureCard = {
  author: {
    id: number
    name: string | null
    slug: string | null
    href: string | null
    bio: string | null
    expertise: string[]
  }
  displayDescription: string | null
  displayExpertise: string[]
  imageMediaSetId: number | null
  image: EditorialFeaturePublicImage | null
  imageSquare: EditorialFeaturePublicImage | null
  imageWide: EditorialFeaturePublicImage | null
  imageAltReady: boolean
  spotlightNote: string | null
}

export type AuthorFeatureBlockResponse = {
  id: string
  blockType: 'author-feature'
  selection: HomepageFeaturedSelection
  sectionHeading: string | null
  sectionSubheading: string | null
  imageStyle: AuthorFeatureImageStyle
  motionStyle: AuthorFeatureMotionStyle
  descriptionMode: AuthorFeatureDescriptionMode
  expertiseMode: AuthorFeatureExpertiseMode
  selectedExpertise: string[]
  authorCard: AuthorFeatureCard | null
}

/** When `selection.totalSlots === 4`: one row of four (wide images) vs 2×2 (square images). */
export type ArticleGridFourLayout = 'four-across' | 'two-by-two'

export type ArticleGridBlockResponse = {
  id: string
  blockType: 'article-grid'
  selection: HomepageFeaturedSelection
  sectionHeading: string | null
  sectionSubheading: string | null
  articleGridFourLayout?: ArticleGridFourLayout | null
}

export type LocationGridBlockResponse = {
  id: string
  blockType: 'location-grid'
  selection: HomepageLocationGridSelection
  /** Optional label for this block on the public homepage (e.g. section title). */
  sectionHeading: string | null
  sectionSubheading: string | null
  /** Cover image crop: wide banner, square, or modest portrait (not full phone-tall). */
  mediaAspect?: LocationGridMediaAspect | null
}

export type QuesturianMapsBlockResponse = {
  id: string
  blockType: 'questurian-maps'
  selection: HomepageFeaturedSelection
  sectionHeading: string | null
  sectionSubheading: string | null
}

export type HotelGridBlockResponse = {
  id: string
  blockType: 'hotel-grid'
  selection: HomepageHotelGridSelection
  sectionHeading: string | null
  sectionSubheading: string | null
}

export type TourGridBlockResponse = {
  id: string
  blockType: 'tour-grid'
  selection: HomepageHotelGridSelection
  sectionHeading: string | null
  sectionSubheading: string | null
}

export type WhereToEatDrinkBlockResponse = {
  id: string
  blockType: 'where-to-eat-drink'
  selection: HomepageFeaturedSelection
  sectionHeading: string | null
  sectionSubheading: string | null
}

export type ThingsToDoListiclesBlockResponse = {
  id: string
  blockType: 'things-to-do-listicles'
  selection: HomepageFeaturedSelection
  sectionHeading: string | null
  sectionSubheading: string | null
}

export type ThingsToDoAttractionsBlockResponse = {
  id: string
  blockType: 'things-to-do-attractions'
  selection: HomepageHotelGridSelection
  sectionHeading: string | null
  sectionSubheading: string | null
}

export type NewsletterSignupBlockResponse = {
  id: string
  blockType: 'newsletter-signup'
  selection: HomepageFeaturedSelection
  sectionHeading: string | null
  sectionSubheading: string | null
}

export type ArticleListBlockResponse = {
  id: string
  blockType: 'article-list'
  selection: HomepageFeaturedSelection
  sectionHeading: string | null
  sectionSubheading: string | null
}

export type ArticleCuratedHomepageBlockResponse =
  | FeaturedArticleBlockResponse
  | FeaturedCreatorArticleBlockResponse
  | FeaturedArticleCarouselBlockResponse
  | FeaturedArticlesBlockResponse
  | EditorialFeatureBlockResponse
  | AuthorFeatureBlockResponse
  | ArticleGridBlockResponse
  | QuesturianMapsBlockResponse
  | WhereToEatDrinkBlockResponse
  | ThingsToDoListiclesBlockResponse
  | ArticleListBlockResponse

export type CuratedHomepageBlockResponse =
  | ArticleCuratedHomepageBlockResponse
  | LocationGridBlockResponse
  | HotelGridBlockResponse
  | TourGridBlockResponse
  | ThingsToDoAttractionsBlockResponse
  | NewsletterSignupBlockResponse

export type UnknownBlockResponse = {
  id: string
  blockType: string
}

export type BlockPublishStatus = 'live' | 'modified' | 'unpublished'
export type BlockValidationStatus = 'publishable' | 'blocked'

/** Per-block draft-vs-published metadata attached by the server formatter. */
export type BlockPublishMeta = {
  publishStatus?: BlockPublishStatus
  validationStatus?: BlockValidationStatus
  publishBlockers?: string[]
}

export type PageBlockResponse = (
  | CuratedHomepageBlockResponse
  | UnknownBlockResponse
) &
  BlockPublishMeta

export type HotelOrAttractionGridBlockResponse =
  | HotelGridBlockResponse
  | TourGridBlockResponse
  | ThingsToDoAttractionsBlockResponse
