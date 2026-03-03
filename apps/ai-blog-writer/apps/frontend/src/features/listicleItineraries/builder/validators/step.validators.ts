import type { ItineraryBlockType, ListicleItineraryDraft, RelatedItemOption } from '../../types'
import { validateListicleItineraryStructuredDataShape } from '../services/structured-data-template.service'
import { validateItemMediaSelections } from './media.validators'
import { validateItemTimeline } from './timeline.validators'

const isValidAbsoluteUrl = (value: string): boolean => {
  if (!value.trim()) return true
  try {
    new URL(value)
    return true
  } catch {
    return false
  }
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

  const timelineIssues = validateItemTimeline(draft, 'published')
  if (timelineIssues.length > 0) {
    issues.push(...timelineIssues)
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
        })
        issues.push(...shapeIssues)
      }
    } catch {
      issues.push('Structured Data must be valid JSON.')
    }
  }

  return issues
}
