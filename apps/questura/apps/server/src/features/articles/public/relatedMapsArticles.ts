import type { Payload, Where } from 'payload'

import {
  getLocationScope,
  normalizeLocationKey,
} from '@/shared/location/server/locationScope'

import type {
  FetchRelatedMapsArticlesParams,
  RelatedMapsArticleRouteType,
  RelatedMapsArticleTeaser,
} from './types'

const MAP_ARTICLE_LIMIT = 12

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function idOrNull(value: unknown): string | number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return stringOrNull(value)
}

function formatFeaturedImage(value: unknown): RelatedMapsArticleTeaser['header'] {
  if (!isRecord(value)) return null

  const image = isRecord(value.featuredImage) ? value.featuredImage : null
  const url = stringOrNull(image?.url)
  const altText = stringOrNull(image?.alt_text)
  if (!url) return null

  return {
    featuredImage: {
      url,
      ...(altText ? { alt_text: altText } : {}),
    },
  }
}

function formatRelatedArticle(
  value: unknown,
  routeType: RelatedMapsArticleRouteType,
): RelatedMapsArticleTeaser | null {
  if (!isRecord(value)) return null

  const title = stringOrNull(value.title)
  const slug = stringOrNull(value.slug)
  const id = idOrNull(value.id) ?? slug

  if (!title || !slug || id === null) return null

  return {
    id,
    title,
    slug,
    routeType,
    header: formatFeaturedImage(value.header),
  }
}

async function createCityFamilyWhere(
  payload: Payload,
  country: string,
  city?: string | null,
): Promise<Where> {
  if (!city) {
    return {
      location: {
        equals: normalizeLocationKey(country),
      },
    }
  }

  const cityLocationKey = normalizeLocationKey(`${country}|${city}`)
  const scope = await getLocationScope(payload, cityLocationKey)
  const keys = Array.from(
    new Set(
      [cityLocationKey, ...scope.keys]
        .map((key) => normalizeLocationKey(key))
        .filter(Boolean),
    ),
  )
  const refs = Array.from(new Set(scope.refs))
  const locationClauses: Where[] = []

  if (keys.length) {
    locationClauses.push({
      location: {
        in: keys,
      },
    })
  }

  if (refs.length) {
    locationClauses.push({
      locationRef: {
        in: refs,
      },
    })
  }

  if (locationClauses.length === 1) return locationClauses[0]
  if (locationClauses.length === 0) {
    return {
      location: {
        equals: cityLocationKey,
      },
    }
  }

  return {
    or: locationClauses,
  }
}

function createPublishedRelatedWhere(locationWhere: Where): Where {
  return {
    and: [
      {
        status: {
          equals: 'published',
        },
      },
      locationWhere,
    ],
  }
}

function insertItinerarySecond(
  maps: RelatedMapsArticleTeaser[],
  itinerary: RelatedMapsArticleTeaser | null,
): RelatedMapsArticleTeaser[] {
  if (!itinerary) return maps
  if (maps.length === 0) return [itinerary]

  return [maps[0], itinerary, ...maps.slice(1)]
}

export async function fetchRelatedMapsArticles(
  payload: Payload,
  { country, city, currentSlug }: FetchRelatedMapsArticlesParams,
): Promise<RelatedMapsArticleTeaser[]> {
  const locationWhere = await createCityFamilyWhere(payload, country, city)
  const relatedWhere = createPublishedRelatedWhere(locationWhere)
  const normalizedCurrentSlug = stringOrNull(currentSlug)

  const [mapsResult, itineraryResult] = await Promise.all([
    payload.find({
      collection: 'single-type-listicles',
      where: relatedWhere,
      limit: MAP_ARTICLE_LIMIT + 1,
      depth: 1,
      sort: '-publishedAt',
      overrideAccess: true,
    }),
    payload.find({
      collection: 'listicle-itineraries',
      where: relatedWhere,
      limit: 2,
      depth: 1,
      sort: '-publishedAt',
      overrideAccess: true,
    }),
  ])

  const maps = mapsResult.docs
    .map((doc) => formatRelatedArticle(doc, 'maps'))
    .filter((doc): doc is RelatedMapsArticleTeaser => Boolean(doc))
    .filter((doc) => doc.slug !== normalizedCurrentSlug)
    .slice(0, MAP_ARTICLE_LIMIT)

  const itinerary = itineraryResult.docs
    .map((doc) => formatRelatedArticle(doc, 'itinerary'))
    .filter((doc): doc is RelatedMapsArticleTeaser => Boolean(doc))
    .filter((doc) => doc.slug !== normalizedCurrentSlug)
    .find((doc): doc is RelatedMapsArticleTeaser => Boolean(doc)) ?? null

  return insertItinerarySecond(maps, itinerary)
}
