import type { LocationGridMediaAspect } from '../../locationGridTypes'
import type {
  AuthorFeatureDescriptionMode,
  AuthorFeatureExpertiseMode,
  AuthorFeatureImageStyle,
  AuthorFeatureMotionStyle,
  ArticleGridFourLayout,
  FeaturedArticlesSlot3Layout,
  FeaturedArticlesSlot4Layout,
  FeaturedArticlesSlot5Layout
} from '../../pageBlocks'
import { mainHomepageRequest } from '../request'
import type { MainHomepageResponse } from '../types'

export type EditorialFeatureFieldsUpdate = {
  featureKicker?: string | null
  featureTitle?: string | null
  featureDescription?: string | null
  featureMediaSet?: number | null
  linkedLocation?: number | null
}

export type AuthorFeatureCardUpdate = {
  author: number
  image: number | null
  spotlightNote: string | null
}

export type AuthorFeatureFieldsUpdate = {
  authorCards?: [AuthorFeatureCardUpdate]
  sectionHeading?: string | null
  sectionSubheading?: string | null
  descriptionMode?: AuthorFeatureDescriptionMode
  expertiseMode?: AuthorFeatureExpertiseMode
  selectedExpertise?: string[]
  imageStyle?: AuthorFeatureImageStyle
  motionStyle?: AuthorFeatureMotionStyle
}

export async function updateMainHomepageEditorialFeatureFields(
  blockId: string,
  fields: EditorialFeatureFieldsUpdate
): Promise<MainHomepageResponse> {
  return mainHomepageRequest('/api/homepage-featured-content', {
    method: 'PUT',
    body: JSON.stringify({ blockId, ...fields })
  })
}

export async function updateMainHomepageAuthorFeatureFields(
  blockId: string,
  fields: AuthorFeatureFieldsUpdate
): Promise<MainHomepageResponse> {
  return mainHomepageRequest('/api/homepage-featured-content', {
    method: 'PUT',
    body: JSON.stringify({ blockId, ...fields })
  })
}

export async function updateMainHomepageFeaturedSectionHeading(
  blockId: string,
  sectionHeading: string | null
): Promise<MainHomepageResponse> {
  return mainHomepageRequest('/api/homepage-featured-content', {
    method: 'PUT',
    body: JSON.stringify({ blockId, sectionHeading })
  })
}

export async function updateMainHomepageFeaturedSectionSubheading(
  blockId: string,
  sectionSubheading: string | null
): Promise<MainHomepageResponse> {
  return mainHomepageRequest('/api/homepage-featured-content', {
    method: 'PUT',
    body: JSON.stringify({ blockId, sectionSubheading })
  })
}

export async function updateMainHomepageCreatorKicker(
  blockId: string,
  creatorKicker: string | null
): Promise<MainHomepageResponse> {
  return mainHomepageRequest('/api/homepage-featured-content', {
    method: 'PUT',
    body: JSON.stringify({ blockId, creatorKicker })
  })
}

export async function updateMainHomepageFeaturedSlot3Layout(
  blockId: string,
  slot3Layout: FeaturedArticlesSlot3Layout
): Promise<MainHomepageResponse> {
  return mainHomepageRequest('/api/homepage-featured-content', {
    method: 'PUT',
    body: JSON.stringify({ blockId, slot3Layout })
  })
}

export async function updateMainHomepageFeaturedSlot4Layout(
  blockId: string,
  slot4Layout: FeaturedArticlesSlot4Layout
): Promise<MainHomepageResponse> {
  return mainHomepageRequest('/api/homepage-featured-content', {
    method: 'PUT',
    body: JSON.stringify({ blockId, slot4Layout })
  })
}

export async function updateMainHomepageFeaturedSlot5Layout(
  blockId: string,
  slot5Layout: FeaturedArticlesSlot5Layout
): Promise<MainHomepageResponse> {
  return mainHomepageRequest('/api/homepage-featured-content', {
    method: 'PUT',
    body: JSON.stringify({ blockId, slot5Layout })
  })
}

export async function updateMainHomepageLocationGridMediaAspect(
  blockId: string,
  mediaAspect: LocationGridMediaAspect
): Promise<MainHomepageResponse> {
  return mainHomepageRequest('/api/homepage-featured-content', {
    method: 'PUT',
    body: JSON.stringify({ blockId, mediaAspect })
  })
}

export async function updateMainHomepageArticleGridFourLayout(
  blockId: string,
  articleGridFourLayout: ArticleGridFourLayout
): Promise<MainHomepageResponse> {
  return mainHomepageRequest('/api/homepage-featured-content', {
    method: 'PUT',
    body: JSON.stringify({ blockId, articleGridFourLayout })
  })
}
