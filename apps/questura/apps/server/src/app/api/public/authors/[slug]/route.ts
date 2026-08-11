import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@/payload.config'
import type { Author } from '@/payload-types'
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
      collection: 'authors',
      where: { slug: { equals: slug } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    let author: Author | null = bySlug.docs[0] ?? null

    if (!author && isNumericId) {
      // Legacy /authors/<id> URLs were minted from *user* ids, before ADR-0007
      // moved authorship onto its own collection. Resolve them that way first
      // so an old link keeps pointing at the same person; reading the number as
      // an author id instead would silently serve a different author. The
      // client 301s either form to the canonical slug.
      const byLegacyUserId = await payload.find({
        collection: 'authors',
        where: { user: { equals: Number(slug) } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      author = byLegacyUserId.docs[0] ?? null

      if (!author) {
        try {
          author = await payload.findByID({
            collection: 'authors',
            id: Number(slug),
            depth: 0,
            overrideAccess: true,
          })
        } catch {
          author = null
        }
      }
    }

    if (!author) {
      return NextResponse.json({ message: 'Author not found.' }, { status: 404 })
    }

    // Byline implies visibility: an author without published work has no public
    // page, so they are not enumerable through this route. This is unchanged by
    // the split -- an author with no staff account is still visible if their
    // work is published, which is the point of keeping the record.
    const isVisible = await hasPublishedAuthorContent(payload, author.id, ARTICLE_TYPES)
    if (!isVisible) {
      return NextResponse.json({ message: 'Author not found.' }, { status: 404 })
    }

    const displayName = author.displayName || null
    const bio = author.bio || null

    // depth is 0, so the avatar relation is an id; resolve it to a CDN URL.
    let avatar: { url: string; alt: string | null } | null = null
    const avatarId = author.avatar
    if (typeof avatarId === 'number') {
      try {
        const asset = await payload.findByID({
          collection: 'media-assets',
          id: avatarId,
          depth: 0,
          overrideAccess: true,
        })
        const url = asset?.url || asset?.bunny_original_url || null
        if (url) avatar = { url, alt: asset?.alt_text || null }
      } catch {
        avatar = null
      }
    }
    const socialLinks = {
      instagram: author.socialLinks?.instagram || null,
      twitter: author.socialLinks?.twitter || null,
      facebook: author.socialLinks?.facebook || null,
      linkedin: author.socialLinks?.linkedin || null,
      reddit: author.socialLinks?.reddit || null,
      youtube: author.socialLinks?.youtube || null,
      patreon: author.socialLinks?.patreon || null,
      website: author.socialLinks?.website || null,
    }

    const results = await Promise.all(
      ARTICLE_TYPES.map(async (type) => {
        const result = await payload.find({
          collection: TYPE_TO_COLLECTION[type],
          where: {
            and: [
              { author: { equals: author.id } },
              { status: { equals: 'published' } },
              { language: { equals: lang } },
            ],
          },
          limit: MAX_ARTICLES_PER_COLLECTION,
          // Article -> MediaSet -> variant asset requires two relationship hops.
          depth: 2,
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
      id: author.id,
      slug: author.slug ?? null,
      displayName,
      bio,
      avatar,
      socialLinks,
      articles,
    })
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : 'Failed to load author.'
    return NextResponse.json({ message }, { status: 500 })
  }
}
