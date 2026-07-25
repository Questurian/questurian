import type { Location } from '../../../api'
import type { StagedArticle } from '../../../types'
import {
  isSeoCoreComplete,
  validateStandardArticleSeoSection,
} from '../../../features/editorial-stage-article/services/standard-article-seo.service'

type PublishingStateInput = {
  stagedArticle: StagedArticle
  allFieldsFilled: boolean
  missingPublishFields: string[]
  editorialBlockingMessages: string[]
  locations: Location[]
  isEditingLocked: boolean
}

export function getEditorialSidebarPublishingState({
  stagedArticle,
  allFieldsFilled,
  missingPublishFields,
  editorialBlockingMessages,
  locations,
  isEditingLocked,
}: PublishingStateInput) {
  const seoSection = stagedArticle.seoSection ?? {
    seoTitle: '',
    metaDescription: '',
    openGraph: {
      title: '',
      description: '',
      imageUrl: '',
      url: '',
    },
    twitterCard: {
      card: 'summary',
      title: '',
      description: '',
      imageUrl: '',
    },
    structuredData: '',
    robots: {
      index: 'index',
      follow: 'follow',
    },
  }
  const isPublished = stagedArticle.payloadStatus === 'published'
  const isLinkedDraft = Boolean(stagedArticle.payloadArticleId) && !isPublished
  const hasBlockingEditorial = editorialBlockingMessages.length > 0
  const canSaveDraft = allFieldsFilled
    && !hasBlockingEditorial
    && !isEditingLocked
  const publishBlockedReasons = [
    ...(!allFieldsFilled ? missingPublishFields : []),
    ...(!isSeoCoreComplete(seoSection) ? ['SEO title and meta description'] : []),
    ...(!seoSection.structuredData.trim() ? ['Structured Data'] : []),
    ...(!seoSection.openGraph.imageUrl.trim() ? ['Open Graph image URL'] : []),
    ...validateStandardArticleSeoSection({
      seoSection,
      locationLabel: locations.find((location) => location.id === stagedArticle.locationId)?.locationKey,
    }),
  ]

  return {
    canPublish: canSaveDraft && publishBlockedReasons.length === 0,
    canSaveDraft,
    hasBlockingEditorial,
    isLinkedDraft,
    isPublished,
    publishBlockedReasons,
    payloadStatusLabel: isPublished
      ? `Published in Payload${stagedArticle.payloadArticleId ? ` · ID ${stagedArticle.payloadArticleId}` : ''}`
      : isLinkedDraft
        ? `Draft synced to Payload${stagedArticle.payloadArticleId ? ` · ID ${stagedArticle.payloadArticleId}` : ''}`
        : null,
    shouldSetUpUrlsLater: !seoSection.openGraph.url.trim(),
  }
}

export type EditorialSidebarPublishingState = ReturnType<
  typeof getEditorialSidebarPublishingState
>
