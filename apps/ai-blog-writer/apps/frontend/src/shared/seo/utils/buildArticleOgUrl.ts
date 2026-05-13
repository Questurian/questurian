export type ArticleUrlType = 'maps' | 'itinerary' | null

export function buildArticleOgUrl(
  country: string,
  city: string | null | undefined,
  type: ArticleUrlType,
  slug: string,
): string {
  const c = country.trim().toLowerCase()
  const s = slug.trim()
  if (!c || !s) return ''

  const base = (import.meta.env.VITE_FRONTEND_URL ?? '').replace(/\/$/, '')
  const cityPart = city?.trim().toLowerCase()

  if (cityPart) {
    return type
      ? `${base}/${c}/${cityPart}/${type}/${s}`
      : `${base}/${c}/${cityPart}/${s}`
  }

  return type ? `${base}/${c}/${type}/${s}` : `${base}/${c}/${s}`
}
