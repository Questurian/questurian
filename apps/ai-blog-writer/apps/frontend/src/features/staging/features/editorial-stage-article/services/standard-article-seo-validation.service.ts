import type { SeoSection } from '../../../../../shared/seo/types'
import {
  asArray,
  asRecord,
  getNodeType,
  getReferenceId,
  isValidAbsoluteUrl,
  normalizeText,
} from './standard-article-seo.helpers'

export function isSeoCoreComplete(seoSection: SeoSection): boolean {
  return Boolean(seoSection.seoTitle.trim() && seoSection.metaDescription.trim())
}

export function validateStandardArticleSeoSection(input: {
  seoSection: SeoSection
  locationLabel?: string
}): string[] {
  const { seoSection, locationLabel } = input
  const issues: string[] = []

  if (!isValidAbsoluteUrl(seoSection.openGraph.imageUrl)) {
    issues.push('Open Graph image URL must be a valid absolute URL.')
  }

  if (!isValidAbsoluteUrl(seoSection.openGraph.url)) {
    issues.push('Open Graph URL must be a valid absolute URL.')
  }

  if (!isValidAbsoluteUrl(seoSection.twitterCard.imageUrl)) {
    issues.push('Twitter image URL must be a valid absolute URL.')
  }

  const structuredDataInput = seoSection.structuredData.trim()
  if (!structuredDataInput) return issues

  try {
    const parsed = JSON.parse(structuredDataInput)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      issues.push('Structured Data must be a valid JSON object.')
      return issues
    }

    const context = parsed['@context']
    if (context !== 'https://schema.org' && context !== 'http://schema.org') {
      issues.push('Structured Data must use "@context": "https://schema.org".')
    }

    const graph = asArray(parsed['@graph'])
    if (!graph) {
      issues.push('Structured Data must include an "@graph" array.')
      return issues
    }

    const graphNodes = graph
      .map((node) => asRecord(node))
      .filter((node): node is Record<string, unknown> => Boolean(node))

    const blogPostingNode = graphNodes.find((node) => getNodeType(node['@type']) === 'BlogPosting')
    if (!blogPostingNode) {
      issues.push('Structured Data "@graph" must include a BlogPosting node.')
    }

    if (normalizeText(locationLabel)) {
      const placeNode = graphNodes.find((node) => getNodeType(node['@type']) === 'Place')
      if (!placeNode) {
        issues.push('Structured Data "@graph" must include a Place node when a location is set.')
        return issues
      }

      const placeId = getReferenceId(placeNode)
      if (!placeId) {
        issues.push('Structured Data Place node must include an "@id".')
      }

      const contentLocationId = getReferenceId(blogPostingNode?.contentLocation)
      const aboutId = getReferenceId(blogPostingNode?.about)

      if (!contentLocationId) {
        issues.push('Structured Data BlogPosting.contentLocation must reference the Place @id.')
      }

      if (!aboutId) {
        issues.push('Structured Data BlogPosting.about must reference the Place @id.')
      }

      if (placeId && contentLocationId && contentLocationId !== placeId) {
        issues.push('Structured Data BlogPosting.contentLocation must reference the Place @id.')
      }

      if (placeId && aboutId && aboutId !== placeId) {
        issues.push('Structured Data BlogPosting.about must reference the Place @id.')
      }
    }
  } catch {
    issues.push('Structured Data must be valid JSON.')
  }

  return issues
}
