import { ARTICLE_TYPE_SEGMENTS } from '@/lib/reservedSlugs'

export type ArticleCrumb = {
  label: string
  href: string | null
}

function humanizeSegment(segment: string): string {
  return segment
    .split('-')
    .map((word) => (word ? `${word[0].toUpperCase()}${word.slice(1)}` : word))
    .join(' ')
}

/**
 * Visible trail from the public URL, minus the article slug.
 * `/peru/safety/slug` -> Peru > Safety
 * `/peru/lima/safety/slug` -> Peru > Lima > Safety
 */
export function articleCrumbsFromPath(path: string | undefined): ArticleCrumb[] {
  if (!path) return []

  const segments = path.split('/').filter(Boolean)
  if (segments.length < 2) return []

  const intermediates = segments.slice(0, -1)
  const crumbs: ArticleCrumb[] = []
  let cumulative = ''

  intermediates.forEach((segment, index) => {
    cumulative += `/${segment}`
    const isType = ARTICLE_TYPE_SEGMENTS.has(segment.toLowerCase())
    const isLast = index === intermediates.length - 1
    const isCity = intermediates.length >= 3 && index === 1 && !isType

    crumbs.push({
      label: humanizeSegment(segment),
      href: isLast && !isType ? null : isType || index === 0 || isCity ? cumulative : null,
    })
  })

  return crumbs
}
