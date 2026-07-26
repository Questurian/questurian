import { createEmptySeoSection } from '../../../../../shared/seo/services/seo-section.service'
import type { SeoSection } from '../../../../../shared/seo/types'
import type { Location, MediaAsset } from '../../../api'
import type { StagedArticle } from '../../../types'
import type { EditorialPublishAnalysis } from '../editorial-markdown.service'
import { FEATURED_IMAGE_VARIANT } from '../constants'
import type { MediaVariant } from '../types'
import { getLocationDisplayName } from '../utils/editorial-stage-view.utils'
import { sanitizeSharedNeighborhoods } from '../utils/sharedNeighborhoods'
import {
  isSeoCoreComplete,
  validateStandardArticleSeoSection
} from './standard-article-seo.service'

export type EditorialPublishTargetStatus = 'draft' | 'published'

export type EditorialPublishInput = {
  title: string
  location: Location
  locationLabel: string
  featuredImageId: number
  sharedNeighborhoods: number[]
  seoSection: SeoSection
}

type EditorialPublishInputResult =
  | { success: true; value: EditorialPublishInput }
  | { success: false; message: string }

type ResolveEditorialPublishInputParams = {
  stagedArticle: StagedArticle
  locations: Location[]
  findPreferredVariantAsset: (
    assetId: number,
    preferredVariant: MediaVariant
  ) => MediaAsset | null
}

export function resolveEditorialPublishInput({
  stagedArticle,
  locations,
  findPreferredVariantAsset
}: ResolveEditorialPublishInputParams): EditorialPublishInputResult {
  const title = stagedArticle.title.trim()
  if (!title) {
    return { success: false, message: 'Please enter an article title' }
  }

  const location = locations.find(
    (candidate) => candidate.id === stagedArticle.locationId
  )
  if (!location) {
    return { success: false, message: 'Please select a location' }
  }

  const resolvedFeaturedAsset = stagedArticle.featuredImageId
    ? findPreferredVariantAsset(
        stagedArticle.featuredImageId,
        FEATURED_IMAGE_VARIANT
      )
    : null
  const fallbackFeaturedImageId = Number(stagedArticle.featuredImageId)
  const featuredImageId =
    resolvedFeaturedAsset?.id ??
    (Number.isFinite(fallbackFeaturedImageId) && fallbackFeaturedImageId > 0
      ? fallbackFeaturedImageId
      : null)

  if (!featuredImageId) {
    return { success: false, message: 'Please select a featured image' }
  }

  const locationLabel =
    [location.neighborhoodName, location.cityName, location.countryName]
      .filter(
        (value): value is string =>
          typeof value === 'string' && value.trim().length > 0
      )
      .join(', ') ||
    getLocationDisplayName(location) ||
    location.locationKey

  return {
    success: true,
    value: {
      title,
      location,
      locationLabel,
      featuredImageId,
      sharedNeighborhoods: sanitizeSharedNeighborhoods(
        stagedArticle.sharedNeighborhoods,
        locations,
        stagedArticle.locationId
      ),
      seoSection: stagedArticle.seoSection ?? createEmptySeoSection()
    }
  }
}

export function validateEditorialPublishReadiness(input: {
  targetStatus: EditorialPublishTargetStatus
  seoSection: SeoSection
  locationLabel: string
  editorialPublishAnalysis: EditorialPublishAnalysis
}): string | null {
  const { targetStatus, seoSection, locationLabel, editorialPublishAnalysis } =
    input

  if (targetStatus === 'published') {
    if (!isSeoCoreComplete(seoSection)) {
      return 'Publishing requires SEO title and meta description.'
    }

    if (!seoSection.structuredData.trim()) {
      return 'Publishing requires structured data.'
    }

    if (!seoSection.openGraph.imageUrl.trim()) {
      return 'Publishing requires an Open Graph image URL.'
    }

    const seoIssues = validateStandardArticleSeoSection({
      seoSection,
      locationLabel
    })
    if (seoIssues.length > 0) {
      return seoIssues[0]
    }
  }

  if (!editorialPublishAnalysis.hasBlockingBlocks) {
    return null
  }

  const previewMessage = editorialPublishAnalysis.blockingBlocks
    .slice(0, 2)
    .map((block) => block.message)
    .join(' · ')
  const remainingCount = editorialPublishAnalysis.blockingBlocks.length - 2
  const remainingSuffix = remainingCount > 0 ? ` (+${remainingCount} more)` : ''

  return previewMessage
    ? `Fix editorial blocks before publishing: ${previewMessage}${remainingSuffix}`
    : 'Fix editorial blocks before publishing'
}
