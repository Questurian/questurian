import type { SeoSection } from '../../types'

const normalizeText = (value: unknown): string => (typeof value === 'string' ? value : '')

const normalizeTwitterCard = (value: unknown): SeoSection['twitterCard']['card'] => {
  return value === 'summary_large_image' ? 'summary_large_image' : 'summary'
}

const normalizeRobotIndex = (value: unknown): SeoSection['robots']['index'] => {
  return value === 'noindex' ? 'noindex' : 'index'
}

const normalizeRobotFollow = (value: unknown): SeoSection['robots']['follow'] => {
  return value === 'nofollow' ? 'nofollow' : 'follow'
}

export function createEmptySeoSection(): SeoSection {
  return {
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
}

export function normalizeSeoSection(value: unknown): SeoSection {
  const source = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  const openGraph = (source.openGraph && typeof source.openGraph === 'object'
    ? source.openGraph
    : {}) as Record<string, unknown>
  const twitterCard = (source.twitterCard && typeof source.twitterCard === 'object'
    ? source.twitterCard
    : {}) as Record<string, unknown>
  const robots = (source.robots && typeof source.robots === 'object'
    ? source.robots
    : {}) as Record<string, unknown>
  const rawStructuredData = source.structuredData
  return {
    seoTitle: normalizeText(source.seoTitle),
    metaDescription: normalizeText(source.metaDescription),
    openGraph: {
      title: normalizeText(openGraph.title),
      description: normalizeText(openGraph.description),
      imageUrl: normalizeText(openGraph.imageUrl),
      url: normalizeText(openGraph.url),
    },
    twitterCard: {
      card: normalizeTwitterCard(twitterCard.card),
      title: normalizeText(twitterCard.title),
      description: normalizeText(twitterCard.description),
      imageUrl: normalizeText(twitterCard.imageUrl),
    },
    structuredData:
      typeof rawStructuredData === 'string'
        ? rawStructuredData
        : rawStructuredData && typeof rawStructuredData === 'object'
          ? JSON.stringify(rawStructuredData, null, 2)
          : '',
    robots: {
      index: normalizeRobotIndex(robots.index),
      follow: normalizeRobotFollow(robots.follow),
    },
  }
}

export function buildSeoPayload(seoSection: SeoSection): Record<string, unknown> {
  const structuredDataInput = seoSection.structuredData.trim()
  let structuredData: Record<string, unknown> | undefined

  if (structuredDataInput) {
    const parsed = JSON.parse(structuredDataInput)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      structuredData = parsed as Record<string, unknown>
    }
  }

  return {
    seoTitle: seoSection.seoTitle.trim() || undefined,
    metaDescription: seoSection.metaDescription.trim() || undefined,
    openGraph: {
      title: seoSection.openGraph.title.trim() || undefined,
      description: seoSection.openGraph.description.trim() || undefined,
      imageUrl: seoSection.openGraph.imageUrl.trim() || undefined,
      url: seoSection.openGraph.url.trim() || undefined,
    },
    twitterCard: {
      card: seoSection.twitterCard.card,
      title: seoSection.twitterCard.title.trim() || undefined,
      description: seoSection.twitterCard.description.trim() || undefined,
      imageUrl: seoSection.twitterCard.imageUrl.trim() || undefined,
    },
    structuredData,
    robots: {
      index: seoSection.robots.index,
      follow: seoSection.robots.follow,
    },
  }
}
