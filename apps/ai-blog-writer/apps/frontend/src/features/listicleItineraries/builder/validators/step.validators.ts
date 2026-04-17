import {
  isManualItineraryBlockType,
  isTourAgencyPriceTier,
  type ItineraryBlockType,
  type ListicleItineraryDraft,
  type RelatedItemOption,
} from '../../types'
import { validateListicleItineraryStructuredDataShape } from '../services/structured-data-template.service'
import { validateItemMediaSelections } from './media.validators'

const isValidAbsoluteUrl = (value: string): boolean => {
  if (!value.trim()) return true
  try {
    new URL(value)
    return true
  } catch {
    return false
  }
}

const isFiniteCoordinate = (value: string): boolean => {
  if (!value.trim()) return false
  const parsed = Number(value)
  return Number.isFinite(parsed)
}

const isLatitude = (value: string): boolean => {
  if (!isFiniteCoordinate(value)) return false
  const parsed = Number(value)
  return parsed >= -90 && parsed <= 90
}

const isLongitude = (value: string): boolean => {
  if (!isFiniteCoordinate(value)) return false
  const parsed = Number(value)
  return parsed >= -180 && parsed <= 180
}

export function validateStep2(draft: ListicleItineraryDraft): string[] {
  const issues: string[] = []
  const introText = (draft.header.introMarkdown || draft.header.introJsonText || '').trim()
  if (!introText) issues.push('Step 2 requires a header intro before locking.')
  return issues
}

export function validateStep3(
  draft: ListicleItineraryDraft,
  relatedByBlockType: Record<ItineraryBlockType, RelatedItemOption[]>,
): string[] {
  const issues: string[] = []

  if (draft.items.length < 1) {
    issues.push('Step 3 requires at least one itinerary stop before locking.')
  }

  const mediaIssues = validateItemMediaSelections(draft, relatedByBlockType)
  if (mediaIssues.length > 0) {
    issues.push(...mediaIssues)
  }

  for (let index = 0; index < draft.items.length; index += 1) {
    const item = draft.items[index]
    const blurbText = (item.blurbMarkdown || item.blurbJsonText || '').trim()
    if (!blurbText) {
      issues.push(`Item ${index + 1} requires a blurb before locking Step 3`)
    }

    if (!isManualItineraryBlockType(item.blockType)) {
      continue
    }

    if (!item.title.trim()) {
      issues.push(`Item ${index + 1} requires a title`)
    }

    if (!item.operator.trim()) {
      issues.push(`Item ${index + 1} requires an operator`)
    }

    if (!item.url.trim()) {
      issues.push(`Item ${index + 1} requires a URL`)
    } else if (!isValidAbsoluteUrl(item.url)) {
      issues.push(`Item ${index + 1} URL must be a valid absolute URL`)
    }

    if (item.price && !isTourAgencyPriceTier(item.price)) {
      issues.push(`Item ${index + 1} price must be $, $$, $$$, or $$$$`)
    }

    if (!Number.isInteger(item.tourDuration) || item.tourDuration < 1 || item.tourDuration > 24) {
      issues.push(`Item ${index + 1} tour duration must be between 1 and 24 hours`)
    }

    const startingPointLabel = item.startingPoint.label.trim()
    const startingPointLatitude = item.startingPoint.latitude.trim()
    const startingPointLongitude = item.startingPoint.longitude.trim()
    const hasStartingPoint = Boolean(startingPointLabel || startingPointLatitude || startingPointLongitude)

    if (hasStartingPoint && (!isLatitude(startingPointLatitude) || !isLongitude(startingPointLongitude))) {
      issues.push(`Item ${index + 1} starting point requires valid latitude and longitude`)
    }

    item.keyLocations.forEach((location, locationIndex) => {
      if (location.source === 'existing') {
        if (!location.relatedCollection || !location.relatedItem) {
          issues.push(`Item ${index + 1} key location ${locationIndex + 1} requires an existing item`)
        }
        return
      }

      if (!location.title.trim()) {
        issues.push(`Item ${index + 1} key location ${locationIndex + 1} requires a title`)
      }

      if (!isLatitude(location.latitude) || !isLongitude(location.longitude)) {
        issues.push(`Item ${index + 1} key location ${locationIndex + 1} requires valid latitude and longitude`)
      }
    })
  }

  return issues
}

export function isSeoCoreComplete(draft: ListicleItineraryDraft): boolean {
  return Boolean(
    draft.seoSection.seoTitle.trim()
    && draft.seoSection.metaDescription.trim(),
  )
}

export function validateSeoSection(input: {
  draft: ListicleItineraryDraft
  targetStatus: 'draft' | 'published'
}): string[] {
  const issues: string[] = []
  const { draft, targetStatus } = input
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

  if (structuredDataInput) {
    try {
      const parsed = JSON.parse(structuredDataInput)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        issues.push('Structured Data must be a valid JSON object.')
      } else if (targetStatus === 'published') {
        const shapeIssues = validateListicleItineraryStructuredDataShape({
          structuredData: parsed as Record<string, unknown>,
          draft,
          targetStatus,
        })
        issues.push(...shapeIssues)
      }
    } catch {
      issues.push('Structured Data must be valid JSON.')
    }
  }

  return issues
}
