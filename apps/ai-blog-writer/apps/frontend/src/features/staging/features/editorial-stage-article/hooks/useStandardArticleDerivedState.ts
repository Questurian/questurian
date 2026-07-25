import { useMemo } from 'react'
import { createEmptySeoSection } from '../../../../../shared/seo/services/seo-section.service'
import type { StagedArticle } from '../../../types'
import type { SidebarViewProps } from '../selectors'
import {
  buildStandardArticleContext,
  isSeoCoreComplete,
  validateStandardArticleSeoSection,
} from '../services/standard-article-seo.service'
import { getLocationDisplayName } from '../utils/editorial-stage-view.utils'
import {
  getSharedNeighborhoodOptions,
  sanitizeSharedNeighborhoods,
} from '../utils/sharedNeighborhoods'

function validateSetupStep(title: string, locationId?: number): string[] {
  const issues: string[] = []
  if (!title.trim()) issues.push('Step 1 requires an article title.')
  if (!locationId) issues.push('Step 1 requires a location.')
  return issues
}

function validateFeaturedImageStep(featuredImageId?: number): string[] {
  return featuredImageId ? [] : ['Select a featured image before syncing to Payload.']
}

function validateContentStep(input: {
  bodyMarkdown: string
  editorialBlockingMessages: string[]
}): string[] {
  const issues: string[] = []
  if (!input.bodyMarkdown.trim()) {
    issues.push('Step 3 requires at least one text block with content.')
  }
  if (input.editorialBlockingMessages.length > 0) {
    issues.push(input.editorialBlockingMessages[0])
  }
  return issues
}

export function useStandardArticleDerivedState(
  stagedArticle: StagedArticle | undefined,
  sidebarProps: SidebarViewProps | null,
) {
  const seoSection = stagedArticle?.seoSection ?? createEmptySeoSection()
  const selectedLocation = useMemo(
    () => sidebarProps?.locations.find((location) => location.id === stagedArticle?.locationId),
    [sidebarProps?.locations, stagedArticle?.locationId],
  )
  const sharedNeighborhoodOptions = useMemo(
    () => getSharedNeighborhoodOptions(sidebarProps?.locations ?? [], stagedArticle?.locationId),
    [sidebarProps?.locations, stagedArticle?.locationId],
  )
  const selectedSharedNeighborhoods = useMemo(
    () => sanitizeSharedNeighborhoods(
      stagedArticle?.sharedNeighborhoods ?? [],
      sidebarProps?.locations ?? [],
      stagedArticle?.locationId,
    ),
    [sidebarProps?.locations, stagedArticle?.locationId, stagedArticle?.sharedNeighborhoods],
  )
  const selectedLocationLabel = useMemo(
    () => getLocationDisplayName(selectedLocation),
    [selectedLocation],
  )
  const bodyMarkdown = useMemo(
    () => (stagedArticle ? buildStandardArticleContext(stagedArticle) : ''),
    [stagedArticle],
  )
  const step1Issues = useMemo(
    () => validateSetupStep(stagedArticle?.title || '', stagedArticle?.locationId),
    [stagedArticle?.locationId, stagedArticle?.title],
  )
  const step2Issues = useMemo(
    () => validateFeaturedImageStep(stagedArticle?.featuredImageId),
    [stagedArticle?.featuredImageId],
  )
  const step3Issues = useMemo(
    () => validateContentStep({
      bodyMarkdown,
      editorialBlockingMessages: sidebarProps?.editorialBlockingMessages || [],
    }),
    [bodyMarkdown, sidebarProps?.editorialBlockingMessages],
  )
  const seoIssues = useMemo(
    () => validateStandardArticleSeoSection({
      seoSection,
      locationLabel: selectedLocationLabel || undefined,
    }),
    [seoSection, selectedLocationLabel],
  )

  const isStep1Locked = Boolean(stagedArticle?.step1_complete && !stagedArticle?.in_update_mode)
  const isStep2Locked = Boolean(stagedArticle?.step2_complete && !stagedArticle?.step2_in_update_mode)
  const isStep3Locked = Boolean(stagedArticle?.step3_complete && !stagedArticle?.step3_in_update_mode)
  const isSynced = Boolean(stagedArticle?.publishedToPayload)
  const isPublished = stagedArticle?.payloadStatus === 'published'
  const hasUnsyncedPayloadChanges = Boolean(isSynced && stagedArticle?.hasUnsyncedPayloadChanges)
  const seoCoreComplete = isSeoCoreComplete(seoSection)
  const completionPercent = Math.round(([
    isStep1Locked,
    isStep3Locked,
    seoCoreComplete,
  ].filter(Boolean).length / 3) * 100)

  const syncIssues = useMemo(() => {
    const issues: string[] = []
    if (isSynced) {
      if (step1Issues.length > 0) issues.push(step1Issues[0])
      if (!stagedArticle?.payloadSlug?.trim()) issues.push('Slug is required before syncing to Payload.')
      if (step2Issues.length > 0) issues.push(step2Issues[0])
      if (step3Issues.length > 0) issues.push(step3Issues[0])
      if (!seoCoreComplete) issues.push('Add SEO title and meta description before syncing to Payload.')
      if (seoIssues.length > 0) issues.push(seoIssues[0])
    } else {
      if (!isStep1Locked) issues.push('Lock Step 1 before syncing to Payload.')
      if (!stagedArticle?.payloadSlug?.trim()) issues.push('Slug is required before syncing to Payload.')
      if (step2Issues.length > 0) issues.push(step2Issues[0])
      if (!isStep3Locked) issues.push('Lock Step 3 before syncing to Payload.')
      if (!seoCoreComplete) issues.push('Add SEO title and meta description before syncing to Payload.')
      if (step3Issues.length > 0) issues.push(step3Issues[0])
      if (seoIssues.length > 0) issues.push(seoIssues[0])
    }
    return issues
  }, [
    isStep1Locked,
    isStep3Locked,
    isSynced,
    seoCoreComplete,
    seoIssues,
    stagedArticle?.payloadSlug,
    step1Issues,
    step2Issues,
    step3Issues,
  ])

  return {
    seoSection,
    selectedLocation,
    selectedLocationLabel,
    sharedNeighborhoodOptions,
    selectedSharedNeighborhoods,
    step1Issues,
    step3Issues,
    syncIssues,
    isStep1Locked,
    isStep2Locked,
    isStep3Locked,
    isSynced,
    isPublished,
    hasUnsyncedPayloadChanges,
    seoCoreComplete,
    completionPercent,
  }
}
