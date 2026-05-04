export type ArticleUrlType = 'maps' | 'itinerary' | null

export function buildArticleOgUrl(
  locationKey: string,
  type: ArticleUrlType,
  slug: string,
): string {
  if (!slug.trim() || !locationKey.trim()) return ''

  const parts = locationKey.toLowerCase().split('|').filter(Boolean)
  if (parts.length < 2) return ''

  const [country, city] = parts
  const base = (import.meta.env.VITE_FRONTEND_URL ?? '').replace(/\/$/, '')

  return type
    ? `${base}/${country}/${city}/${type}/${slug.trim()}`
    : `${base}/${country}/${city}/${slug.trim()}`
}
