import { convertLexicalToHTMLAsync } from '@payloadcms/richtext-lexical/html-async'

import { resolveArticleFeaturedImage } from './view-model'

async function toLexicalHTML(data: unknown): Promise<string> {
  return convertLexicalToHTMLAsync({
    data: data as Parameters<typeof convertLexicalToHTMLAsync>[0]['data'],
    disableContainer: true,
  })
}

/**
 * Tour Picks (ADR 0013): reduce populated tour docs to the public shape and
 * drop unpublished tours — the route fetches with overrideAccess, so draft
 * tours would otherwise leak into the public payload.
 */
function sanitizeTourPicks(blocks: Array<Record<string, unknown>>) {
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
      .map((tour) => ({
        id: tour.id,
        title: tour.title,
        price: tour.price,
        bookingLink: tour.bookingLink,
      }))
  }
}

async function serializeBlurbArray(blocks: Array<Record<string, unknown>>) {
  sanitizeTourPicks(blocks)
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

async function serializeMapsListicleBlocks(article: Record<string, unknown>) {
  const header = article.header as Record<string, unknown> | undefined
  if (header?.intro) {
    header.intro = await toLexicalHTML(header.intro)
  }

  const items = article.items as Array<Record<string, unknown>> | undefined
  if (!Array.isArray(items)) return
  await serializeBlurbArray(items)
}

async function serializeItineraryBlocks(article: Record<string, unknown>) {
  const header = article.header as Record<string, unknown> | undefined
  if (header?.intro) {
    header.intro = await toLexicalHTML(header.intro)
  }

  const items = article.items as Array<Record<string, unknown>> | undefined
  if (Array.isArray(items)) await serializeBlurbArray(items)

  const days = article.itineraryDays as Array<Record<string, unknown>> | undefined
  if (!Array.isArray(days)) return

  await Promise.all(
    days.map(async (day) => {
      const dayItems = day.items as Array<Record<string, unknown>> | undefined
      const whereStaying = day.whereStaying as Array<Record<string, unknown>> | undefined
      await Promise.all([
        Array.isArray(dayItems) ? serializeBlurbArray(dayItems) : Promise.resolve(),
        Array.isArray(whereStaying) ? serializeBlurbArray(whereStaying) : Promise.resolve(),
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
) {
  if (collection === 'articles') await serializeStandardArticleBlocks(article)
  if (collection === 'single-type-listicles') await serializeMapsListicleBlocks(article)
  if (collection === 'listicle-itineraries') await serializeItineraryBlocks(article)
  attachResolvedFeaturedImage(article)
}
