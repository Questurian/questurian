import type { Payload } from 'payload'
import { convertLexicalToHTMLAsync } from '@payloadcms/richtext-lexical/html-async'

import { resolveMediaSetForPlacement } from '@/features/media/lib/resolve-public-image'

import { resolveArticleFeaturedImage } from './view-model'

async function toLexicalHTML(data: unknown): Promise<string> {
  return convertLexicalToHTMLAsync({
    data: data as Parameters<typeof convertLexicalToHTMLAsync>[0]['data'],
    disableContainer: true,
  })
}

type SanitizedTourImage = {
  url: string
  alt: string
  width: number | null
  height: number | null
}

type SanitizedTour = {
  id: unknown
  title: unknown
  price: unknown
  bookingLink: unknown
  image: SanitizedTourImage | null
}

/** A tour's `img` sits one relationship level below the article fetch depth, so
 * it arrives as a bare media-set id (or a shallow ref). Pull the id out so the
 * variants can be resolved with a single follow-up query. */
function mediaSetIdFromRef(ref: unknown): number | null {
  if (typeof ref === 'number') return ref
  if (ref && typeof ref === 'object' && 'id' in ref) {
    const id = (ref as { id: unknown }).id
    if (typeof id === 'number') return id
  }
  return null
}

/**
 * Tour Picks (ADR 0013): reduce populated tour docs to the public shape and
 * drop unpublished tours — the route fetches with overrideAccess, so draft
 * tours would otherwise leak into the public payload. The tour image lives in a
 * media-set one hop past the fetch depth, so we batch-resolve those variants and
 * attach a ready-to-render `image` to each pick.
 */
async function sanitizeTourPicks(
  blocks: Array<Record<string, unknown>>,
  payload?: Payload,
) {
  const pending: Array<{ tour: SanitizedTour; mediaSetId: number }> = []

  for (const block of blocks) {
    if (!('tours' in block)) continue

    const tours = block.tours
    if (!Array.isArray(tours)) {
      delete block.tours
      continue
    }

    block.tours = tours
      .filter((tour): tour is Record<string, unknown> => Boolean(tour) && typeof tour === 'object')
      .filter((tour) => tour.status === 'published')
      .map((tour): SanitizedTour => {
        const sanitized: SanitizedTour = {
          id: tour.id,
          title: tour.title,
          price: tour.price,
          bookingLink: tour.bookingLink,
          image: null,
        }
        const mediaSetId = mediaSetIdFromRef(tour.img)
        if (mediaSetId !== null) pending.push({ tour: sanitized, mediaSetId })
        return sanitized
      })
  }

  if (!payload || pending.length === 0) return

  const uniqueIds = [...new Set(pending.map((entry) => entry.mediaSetId))]
  const mediaSets = await payload.find({
    collection: 'media-sets',
    where: { id: { in: uniqueIds } },
    depth: 1,
    limit: uniqueIds.length,
    overrideAccess: true,
  })

  const resolvedById = new Map<number, SanitizedTourImage>()
  for (const doc of mediaSets.docs as unknown as Array<Record<string, unknown>>) {
    if (typeof doc.id !== 'number') continue
    const resolved = resolveMediaSetForPlacement(doc, 'wide-card', {
      allowMigrationFallback: true,
    })
    if (!resolved.url) continue
    resolvedById.set(doc.id, {
      url: resolved.url,
      alt: resolved.alt,
      width: resolved.width,
      height: resolved.height,
    })
  }

  for (const { tour, mediaSetId } of pending) {
    const resolved = resolvedById.get(mediaSetId)
    if (!resolved) continue
    tour.image = {
      ...resolved,
      alt: resolved.alt || (typeof tour.title === 'string' ? tour.title : ''),
    }
  }
}

async function serializeBlurbArray(
  blocks: Array<Record<string, unknown>>,
  payload?: Payload,
) {
  await sanitizeTourPicks(blocks, payload)
  await Promise.all(
    blocks.map(async (block) => {
      if (block.blurb) block.blurb = await toLexicalHTML(block.blurb)
    }),
  )
}

async function serializeStandardArticleBlocks(article: Record<string, unknown>) {
  const blocks = article.contentBlocks as Array<Record<string, unknown>> | undefined
  if (!Array.isArray(blocks)) return

  await Promise.all(
    blocks.map(async (block) => {
      if (block.blockType === 'text' && block.content) {
        block.content = await toLexicalHTML(block.content)
      }
    }),
  )
}

async function serializeMapsListicleBlocks(
  article: Record<string, unknown>,
  payload?: Payload,
) {
  const header = article.header as Record<string, unknown> | undefined
  if (header?.intro) {
    header.intro = await toLexicalHTML(header.intro)
  }

  const items = article.items as Array<Record<string, unknown>> | undefined
  if (!Array.isArray(items)) return
  await serializeBlurbArray(items, payload)
}

async function serializeItineraryBlocks(
  article: Record<string, unknown>,
  payload?: Payload,
) {
  const header = article.header as Record<string, unknown> | undefined
  if (header?.intro) {
    header.intro = await toLexicalHTML(header.intro)
  }

  const items = article.items as Array<Record<string, unknown>> | undefined
  if (Array.isArray(items)) await serializeBlurbArray(items, payload)

  const days = article.itineraryDays as Array<Record<string, unknown>> | undefined
  if (!Array.isArray(days)) return

  await Promise.all(
    days.map(async (day) => {
      const dayItems = day.items as Array<Record<string, unknown>> | undefined
      const whereStaying = day.whereStaying as Array<Record<string, unknown>> | undefined
      await Promise.all([
        Array.isArray(dayItems) ? serializeBlurbArray(dayItems, payload) : Promise.resolve(),
        Array.isArray(whereStaying)
          ? serializeBlurbArray(whereStaying, payload)
          : Promise.resolve(),
      ])
    }),
  )
}

/**
 * Public detail routes return the raw doc, so clients only ever read
 * `featuredImage`. Resolve the preferred source (featuredMediaSet, falling
 * back to the legacy upload) into that field so media-set-only articles
 * render a header image.
 */
function attachResolvedFeaturedImage(article: Record<string, unknown>) {
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null

  const section = isRecord(article.headerSection)
    ? article.headerSection
    : isRecord(article.header)
      ? article.header
      : null
  if (!section) return

  const resolved = resolveArticleFeaturedImage(article, { placement: 'article-header' })
  section.featuredImage = resolved.url
    ? {
        url: resolved.url,
        alt_text: resolved.alt,
        width: resolved.width,
        height: resolved.height,
      }
    : null
}

export type ArticleCollectionSlug =
  | 'articles'
  | 'single-type-listicles'
  | 'listicle-itineraries'

export async function serializeArticleByCollection(
  collection: ArticleCollectionSlug,
  article: Record<string, unknown>,
  payload?: Payload,
) {
  if (collection === 'articles') await serializeStandardArticleBlocks(article)
  if (collection === 'single-type-listicles') await serializeMapsListicleBlocks(article, payload)
  if (collection === 'listicle-itineraries') await serializeItineraryBlocks(article, payload)
  attachResolvedFeaturedImage(article)
}
