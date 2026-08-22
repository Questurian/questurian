import { fetchArticleIndex, type ArticleIndexItem } from './fetchArticleIndex'
import type { ArticleScope, ArticleTypeKey } from './articleScope'

/**
 * Links for the foot of a listicle or itinerary.
 *
 * The list used to be the last thing on the page: the reader finished the
 * final venue and hit a wall. This is the way onward, and it deliberately
 * mixes types -- more maps, an itinerary, and the plain articles written for
 * the same place -- because a reader who just finished one map does not
 * necessarily want another map next.
 *
 * Scope is the city *family*: the index endpoint's city cascade matches
 * `country|city` and everything under it, so neighbourhood-scoped pieces
 * (`peru|lima|barranco`) surface here too. When a young city has nothing yet,
 * the scope widens rather than rendering an empty section.
 */

export type ListicleFooterLink = {
  id: string
  title: string
  href: string
  kind: ArticleTypeKey
  publishedAt: string | null
  thumbnail: { url: string; alt: string | null } | null
}

export type ListicleFooterLinks = {
  guides: ListicleFooterLink[]
  latest: ListicleFooterLink[]
}

/** Six links total. More than that and the foot competes with the article. */
const GUIDE_COUNT = 3
const LATEST_COUNT = 3

const EMPTY: ListicleFooterLinks = { guides: [], latest: [] }

function toLink(item: ArticleIndexItem, kind: ArticleTypeKey): ListicleFooterLink {
  return {
    id: `${kind}-${item.id}`,
    title: item.title,
    href: item.href,
    kind,
    publishedAt: item.publishedAt,
    thumbnail: item.thumbnail,
  }
}

async function indexForScope(
  scope: ArticleScope,
  type: ArticleTypeKey,
  pageSize: number,
  lang?: string,
): Promise<ListicleFooterLink[]> {
  try {
    const data = await fetchArticleIndex({ scope, type, page: 1, pageSize, lang })
    return (data?.items ?? []).map((item) => toLink(item, type))
  } catch {
    // A missing index must never take the article down with it.
    return []
  }
}

/** Round-robin, so a single prolific type cannot own every card. */
function interleave(pools: ListicleFooterLink[][]): ListicleFooterLink[] {
  const merged: ListicleFooterLink[] = []
  const depth = Math.max(0, ...pools.map((pool) => pool.length))
  for (let i = 0; i < depth; i++) {
    for (const pool of pools) {
      const item = pool[i]
      if (item) merged.push(item)
    }
  }
  return merged
}

function scopeCascade(country: string, city?: string | null): ArticleScope[] {
  const scopes: ArticleScope[] = []
  if (city) scopes.push({ kind: 'city', country, city })
  scopes.push({ kind: 'country', country })
  return scopes
}

export async function fetchListicleFooterLinks({
  country,
  city,
  currentHref,
  currentSlug,
  lang,
}: {
  country: string
  city?: string | null
  /** Canonical path of the page being read, so it cannot link to itself. */
  currentHref?: string | null
  currentSlug?: string | null
  lang?: string
}): Promise<ListicleFooterLinks> {
  if (!country) return EMPTY

  const seen = new Set<string>()
  if (currentHref) seen.add(currentHref)

  const keep = (link: ListicleFooterLink): boolean => {
    if (!link.title || !link.href) return false
    if (currentSlug && link.href.endsWith(`/${currentSlug}`)) return false
    if (seen.has(link.href)) return false
    seen.add(link.href)
    return true
  }

  for (const scope of scopeCascade(country, city)) {
    const [maps, itineraries, articles] = await Promise.all([
      indexForScope(scope, 'maps', GUIDE_COUNT + 3, lang),
      indexForScope(scope, 'itineraries', GUIDE_COUNT, lang),
      indexForScope(scope, 'articles', LATEST_COUNT + 3, lang),
    ])

    const guides = interleave([maps, itineraries]).filter(keep).slice(0, GUIDE_COUNT)
    const latest = articles.filter(keep).slice(0, LATEST_COUNT)

    // Guides top up from whatever else the scope holds, so a place with one
    // map and four articles still fills the row instead of showing a gap.
    const spare = articles.filter(keep)
    const filledGuides = [...guides, ...spare].slice(0, GUIDE_COUNT)

    if (filledGuides.length > 0 || latest.length > 0) {
      return { guides: filledGuides, latest }
    }

    // Nothing at this scope: widen and try again with a clean seen-set,
    // minus the current page.
    seen.clear()
    if (currentHref) seen.add(currentHref)
  }

  return EMPTY
}
