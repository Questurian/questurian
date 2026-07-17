import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@/payload.config'
import type { User } from '@/payload-types'
import { DEFAULT_LANG, isSupportedLang } from '@/shared/i18n/languageField'
import { serializeIndexItem, type IndexItem } from '@/features/articles/public/indexItem'
import { TYPE_TO_COLLECTION, type ArticleTypeKey } from '@/features/articles/public/scope'
import { hasPublishedAuthorContent } from '@/features/articles/public/authorVisibility'

const ARTICLE_TYPES: ArticleTypeKey[] = ['articles', 'maps', 'itineraries']
const MAX_ARTICLES_PER_COLLECTION = 100
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/

// GET /api/public/authors/[slug]?lang=en
// No auth required — public author profile data for SSR/SEO rendering.
// Accepts the author slug (canonical) or a numeric id (legacy URLs; the
// client 301s those to the slug URL using the `slug` field in the response).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params
    const isNumericId = /^\d+$/.test(slug)
    if (!isNumericId && !SLUG_PATTERN.test(slug)) {
      return NextResponse.json({ message: 'Invalid author slug.' }, { status: 400 })
    }

    const lang = req.nextUrl.searchParams.get('lang') ?? DEFAULT_LANG
    if (!isSupportedLang(lang)) {
      return NextResponse.json({ message: `unsupported lang: ${lang}` }, { status: 400 })
    }

    const payload = await getPayload({ config })

    const bySlug = await payload.find({
      collection: 'users',
      where: { slug: { equals: slug } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    let user: User | null = bySlug.docs[0] ?? null

    if (!user && isNumericId) {
      try {
        user = await payload.findByID({
          collection: 'users',
          id: Number(slug),
          depth: 0,
          overrideAccess: true,
        })
      } catch {
        user = null
      }
    }

    if (!user) {
      return NextResponse.json({ message: 'Author not found.' }, { status: 404 })
    }

    // Byline implies visibility: staff without published work have no public
    // author page, so they are not enumerable through this route.
    const isVisible = await hasPublishedAuthorContent(payload, user.id, ARTICLE_TYPES)
    if (!isVisible) {
      return NextResponse.json({ message: 'Author not found.' }, { status: 404 })
    }

    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ')
    const displayName = user.publicProfile?.displayName || fullName || null
    const bio = user.publicProfile?.bio || null
    const socialLinks = {
      instagram: user.publicProfile?.socialLinks?.instagram || null,
      twitter: user.publicProfile?.socialLinks?.twitter || null,
      website: user.publicProfile?.socialLinks?.website || null,
    }

    const results = await Promise.all(
      ARTICLE_TYPES.map(async (type) => {
        const result = await payload.find({
          collection: TYPE_TO_COLLECTION[type],
          where: {
            and: [
              { author: { equals: user.id } },
              { status: { equals: 'published' } },
              { language: { equals: lang } },
            ],
          },
          limit: MAX_ARTICLES_PER_COLLECTION,
          depth: 1,
          sort: '-publishedAt',
          overrideAccess: true,
        })
        return result.docs.map((doc) => serializeIndexItem(doc, type))
      }),
    )

    const articles: IndexItem[] = results
      .flat()
      .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))

    return NextResponse.json({
      id: user.id,
      slug: user.slug ?? null,
      displayName,
      bio,
      socialLinks,
      articles,
    })
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : 'Failed to load author.'
    return NextResponse.json({ message }, { status: 500 })
  }
}
