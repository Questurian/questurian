import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import type { CollectionSlug } from 'payload'
import { convertLexicalToHTMLAsync } from '@payloadcms/richtext-lexical/html-async'
import type { SerializedEditorState } from 'lexical'
import config from '@/payload.config'

async function serializeLexicalBlocks(article: Record<string, unknown>) {
  const blocks = article.contentBlocks as Array<Record<string, unknown>> | undefined
  if (!Array.isArray(blocks)) return

  await Promise.all(
    blocks.map(async (block) => {
      if (block.blockType === 'text' && block.content) {
        block.content = await convertLexicalToHTMLAsync({
          data: block.content as SerializedEditorState,
          disableContainer: true,
        })
      }
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
    if (!collection) return null
    return { collection, slug: segments[1] }
  }

  return null
}

// GET /api/public/articles/[country]/[city]/[slug]
// GET /api/public/articles/[country]/[city]/[type]/[slug]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ country: string; city: string; articlePath: string[] }> },
) {
  try {
    const { country, city, articlePath } = await params

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

    const article = result.docs[0]
    const locationKey = typeof article.location === 'string' ? article.location : ''

    if (!locationKey.startsWith(`${country}|${city}`)) {
      return NextResponse.json({ message: 'Article not found.' }, { status: 404 })
    }

    await serializeLexicalBlocks(article)

    return NextResponse.json(article)
  } catch (error) {
    return NextResponse.json(
      { message: getErrorMessage(error, 'Failed to load article.') },
      { status: 500 },
    )
  }
}
