import { getBlockTypeForListicleType } from '../../api'
import type { RelatedItemOption, SingleTypeListicleDraft } from '../../types'
import {
  getRelatedInstagramPostIds,
  getRelatedPhotoIds,
  isMediaMode,
  requiresInstagram,
  requiresPhotos,
} from '../utils/item-media.utils'
import { validateSingleTypeListicleStructuredDataShape } from '../services/structured-data-template.service'
import { validateStep1 } from './setup.validators'

const isValidAbsoluteUrl = (value: string): boolean => {
  if (!value.trim()) return true
  try {
    new URL(value)
    return true
  } catch {
    return false
  }
}

export function validateStep2(draft: SingleTypeListicleDraft): string[] {
  const issues: string[] = []
  const introText = (draft.header.introMarkdown || draft.header.introJsonText || '').trim()
  if (!introText) issues.push('Step 2 requires a header intro before locking.')
  return issues
}

export function validateStep3(
  draft: SingleTypeListicleDraft,
  relatedItems: RelatedItemOption[],
): string[] {
  const issues: string[] = []

  if (!draft.listicleType) {
    issues.push('Listicle type is required')
    return issues
  }

  if (draft.items.length > draft.targetItemCount) {
    issues.push(`This list has ${draft.items.length} items, but target size is ${draft.targetItemCount}`)
  }

  if (draft.items.length !== draft.targetItemCount) {
    issues.push(`Step 3 requires exactly ${draft.targetItemCount} items. Current item count is ${draft.items.length}`)
  }

  const expectedBlockType = getBlockTypeForListicleType(draft.listicleType)
  if (draft.items.some((item) => item.blockType !== expectedBlockType)) {
    issues.push('Item block types do not match selected listicle type')
  }

  for (let index = 0; index < draft.items.length; index += 1) {
    const item = draft.items[index]

    if (!item.item) {
      issues.push(`Item ${index + 1} is missing related entry selection`)
      continue
    }

    const relatedItem = relatedItems.find((entry) => entry.id === item.item)
    if (!relatedItem) {
      issues.push(`Item ${index + 1} selected related entry is unavailable for current listicle filters`)
      continue
    }

    if (!isMediaMode(item.mediaMode)) {
      issues.push(`Item ${index + 1} must select a media mode (photos, instagram, or both)`)
      continue
    }

    const availablePhotoIds = new Set(getRelatedPhotoIds(relatedItem))
    const availableInstagramPostIds = new Set(getRelatedInstagramPostIds(relatedItem))

    if (requiresPhotos(item.mediaMode)) {
      if (item.selectedPhotos.length < 1 || item.selectedPhotos.length > 6) {
        issues.push(`Item ${index + 1} must select between 1 and 6 photos`)
      } else {
        const invalidPhotoId = item.selectedPhotos.find((photoId) => !availablePhotoIds.has(photoId))
        if (invalidPhotoId !== undefined) {
          issues.push(`Item ${index + 1} selected photo ${invalidPhotoId} is not in the source gallery`)
        }
      }
    }

    if (requiresInstagram(item.mediaMode)) {
      if (!item.selectedInstagramPost) {
        issues.push(`Item ${index + 1} must select one Instagram embed`)
      } else if (!availableInstagramPostIds.has(item.selectedInstagramPost)) {
        issues.push(`Item ${index + 1} selected Instagram embed is not in the source gallery`)
      }
    }

    const blurbText = (item.blurbMarkdown || item.blurbJsonText || '').trim()
    if (!blurbText) {
      issues.push(`Item ${index + 1} requires a blurb before locking Step 3`)
    }
  }

  return issues
}

export function isSeoCoreComplete(draft: SingleTypeListicleDraft): boolean {
  return Boolean(
    draft.seoSection.seoTitle.trim()
    && draft.seoSection.metaDescription.trim(),
  )
}

export function validateSeoSection(
  draft: SingleTypeListicleDraft,
  targetStatus: 'draft' | 'published' = 'draft',
): string[] {
  const issues: string[] = []
  const { openGraph, twitterCard, structuredData } = draft.seoSection

  if (!isValidAbsoluteUrl(openGraph.imageUrl)) {
    issues.push('Open Graph image URL must be a valid absolute URL.')
  }

  if (!isValidAbsoluteUrl(openGraph.url)) {
    issues.push('Open Graph URL must be a valid absolute URL.')
  }

  if (!isValidAbsoluteUrl(twitterCard.imageUrl)) {
    issues.push('Twitter image URL must be a valid absolute URL.')
  }

  const structuredDataInput = structuredData.trim()
  if (!structuredDataInput && targetStatus === 'published') {
    issues.push('Structured Data is required before publishing.')
    return issues
  }

  if (!structuredDataInput) return issues

  let parsedStructuredData: Record<string, unknown> | null = null
  try {
    const parsed = JSON.parse(structuredDataInput)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      issues.push('Structured Data must be a valid JSON object.')
      return issues
    }
    parsedStructuredData = parsed as Record<string, unknown>
  } catch {
    issues.push('Structured Data must be valid JSON.')
    return issues
  }

  if (targetStatus === 'published' && parsedStructuredData) {
    issues.push(...validateSingleTypeListicleStructuredDataShape({
      structuredData: parsedStructuredData,
      draft,
      targetStatus,
    }))
  }

  return issues
}

export function validateSubmit(
  draft: SingleTypeListicleDraft,
  selectedLocationRefId: number | null,
  targetStatus: 'draft' | 'published',
  relatedItems: RelatedItemOption[],
): string | null {
  const stepIssues = validateStep1(draft)
  if (stepIssues.length > 0) return stepIssues.join('. ')

  const step2Issues = validateStep2(draft)
  if (step2Issues.length > 0) return step2Issues[0]

  const step3Issues = validateStep3(draft, relatedItems)
  if (step3Issues.length > 0) return step3Issues[0]

  if (!draft.step2_complete || draft.step2_in_update_mode) {
    return 'Lock Step 2 before syncing to Payload.'
  }

  if (!draft.step3_complete || draft.step3_in_update_mode) {
    return 'Lock Step 3 before syncing to Payload.'
  }

  if (!selectedLocationRefId) return 'Select a valid location'

  const seoIssues = validateSeoSection(draft, targetStatus)
  if (seoIssues.length > 0) return seoIssues[0]

  return null
}
