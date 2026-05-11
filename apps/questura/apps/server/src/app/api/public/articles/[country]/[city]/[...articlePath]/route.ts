import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import type { CollectionSlug } from 'payload'
import { convertLexicalToHTMLAsync } from '@payloadcms/richtext-lexical/html-async'
import config from '@/payload.config'
import { fetchRelatedMapsArticles } from '@/features/articles/public/relatedMapsArticles'

async function toLexicalHTML(data: unknown): Promise<string> {
  return convertLexicalToHTMLAsync({
    data: data as Parameters<typeof convertLexicalToHTMLAsync>[0]['data'],
    disableContainer: true,
  })
}

async function serializeBlurbArray(blocks: Array<Record<string, unknown>>) {
  await Promise.all(
    blocks.map(async (block) => {
      if (block.blurb) block.blurb = await toLexicalHTML(block.blurb)
    }),
  )
}

// Standard articles: contentBlocks[].content where blockType === 'text'
async function serializeLexicalBlocks(article: Record<string, unknown>) {
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

// Maps (single-type-listicles): header.intro + items[].blurb
async function serializeListicleBlocks(article: Record<string, unknown>) {
  const header = article.header as Record<string, unknown> | undefined
  if (header?.intro) {
    header.intro = await toLexicalHTML(header.intro)
  }

  const items = article.items as Array<Record<string, unknown>> | undefined
  if (!Array.isArray(items)) return
  await serializeBlurbArray(items)
}

// Itineraries: header.intro + items[].blurb + itineraryDays[].items[].blurb + itineraryDays[].whereStaying[].blurb
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

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

const TYPE_TO_COLLECTION: Record<string, CollectionSlug> = {
  maps: 'single-type-listicles',
  itinerary: 'listicle-itineraries',
}

const STANDARD_ARTICLE_TYPES = new Set(['guide', 'food', 'neighborhoods'])
const COUNTRY_SCOPE_SEGMENT = '_country'

type ParsedPath =
  | { collection: 'articles'; slug: string }
  | { collection: CollectionSlug; slug: string }
  | null

function parsePath(segments: string[]): ParsedPath {
  if (segments.length === 1) {
    return { collection: 'articles', slug: segments[0] }
  }

  if (segments.length === 2) {
    const collection = TYPE_TO_COLLECTION[segments[0]]
    if (!collection && !STANDARD_ARTICLE_TYPES.has(segments[0])) return null
    if (!collection) return { collection: 'articles', slug: segments[1] }
    return { collection, slug: segments[1] }
  }

  return null
}

function articleMatchesLocationScope(locationKey: string, country: string, city: string): boolean {
  if (city === COUNTRY_SCOPE_SEGMENT) {
    return locationKey === country
  }

  const cityLocationKey = `${country}|${city}`
  return locationKey === cityLocationKey || locationKey.startsWith(`${cityLocationKey}|`)
}

// GET /api/public/articles/[country]/[city]/[slug]
// GET /api/public/articles/[country]/[city]/[type]/[slug]
// GET /api/public/articles/[country]/[city]/maps?currentSlug=[slug]
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ country: string; city: string; articlePath: string[] }> },
) {
  try {
    const { country, city, articlePath } = await params

    if (articlePath.length === 1 && articlePath[0] === 'maps') {
      const payload = await getPayload({ config })
      const relatedArticles = await fetchRelatedMapsArticles(payload, {
        country,
        city: city === COUNTRY_SCOPE_SEGMENT ? null : city,
        currentSlug: req.nextUrl.searchParams.get('currentSlug'),
      })

      return NextResponse.json(relatedArticles)
    }

    const parsed = parsePath(articlePath)
    if (!parsed) {
      return NextResponse.json({ message: 'Article not found.' }, { status: 404 })
    }

    const { collection, slug } = parsed
    const payload = await getPayload({ config })

    const result = await payload.find({
      collection,
      where: {
        and: [
          { slug: { equals: slug } },
          { status: { equals: 'published' } },
        ],
      },
      limit: 1,
      depth: 2,
      overrideAccess: true,
    })

    if (result.totalDocs === 0) {
      return NextResponse.json({ message: 'Article not found.' }, { status: 404 })
    }

    const article = result.docs[0] as unknown as Record<string, unknown>
    const locationKey = typeof article.location === 'string' ? article.location : ''

    if (!articleMatchesLocationScope(locationKey, country, city)) {
      return NextResponse.json({ message: 'Article not found.' }, { status: 404 })
    }

    if (collection === 'articles') await serializeLexicalBlocks(article)
    if (collection === 'single-type-listicles') await serializeListicleBlocks(article)
    if (collection === 'listicle-itineraries') await serializeItineraryBlocks(article)

    return NextResponse.json(article)
  } catch (error) {
    return NextResponse.json(
      { message: getErrorMessage(error, 'Failed to load article.') },
      { status: 500 },
    )
  }
}
