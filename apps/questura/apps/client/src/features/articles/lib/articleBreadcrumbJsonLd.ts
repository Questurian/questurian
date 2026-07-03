const PUBLIC_BASE_URL =
  process.env.NEXT_PUBLIC_FRONTEND_URL ?? 'http://localhost:3000'

function humanizeSegment(segment: string): string {
  return segment
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

type BuildBreadcrumbParams = {
  /** Canonical article path, e.g. /italy/rome/maps/best-bars-in-trastevere */
  path: string
  articleTitle: string
}

/**
 * BreadcrumbList derived from the article's URL segments: Home, then one
 * crumb per intermediate segment (humanized slug), then the article title.
 */
export function buildArticleBreadcrumbJsonLd({
  path,
  articleTitle,
}: BuildBreadcrumbParams): Record<string, unknown> {
  const base = PUBLIC_BASE_URL.replace(/\/+$/, '')
  const segments = path.split('/').filter(Boolean)

  const itemListElement: Array<Record<string, unknown>> = [
    { '@type': 'ListItem', position: 1, name: 'Home', item: `${base}/` },
  ]

  let cumulativePath = ''
  segments.forEach((segment, index) => {
    cumulativePath += `/${segment}`
    const isLast = index === segments.length - 1
    itemListElement.push({
      '@type': 'ListItem',
      position: itemListElement.length + 1,
      name: isLast ? articleTitle : humanizeSegment(segment),
      item: `${base}${cumulativePath}`,
    })
  })

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement,
  }
}
