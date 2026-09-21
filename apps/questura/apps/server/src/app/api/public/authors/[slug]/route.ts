import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@/payload.config'
import type { Author } from '@/payload-types'
import { DEFAULT_LANG, isSupportedLang } from '@/shared/i18n/languageField'
import type { ArticleTypeKey } from '@/features/articles/public/scope'
import { hasPublishedAuthorContent } from '@/features/articles/public/authorVisibility'
import { AUTHOR_FEED_SQL } from '@/features/articles/public/author-feed/author-feed-sql'
import {
  hydrateArticleRefs,
  parseArticleRefs,
  type QueryablePool,
} from '@/features/articles/public/hydrate-refs'
import { clampPageSize, resolvePagingWindow } from '@/features/articles/public/paging'
import { publicRead } from '@/shared/http/public-read'

const ARTICLE_TYPES: ArticleTypeKey[] = ['articles', 'maps', 'itineraries']

/**
 * One page of an author's combined feed.
 *
 * The old route asked each of the three collections for up to 100 documents at
 * depth 2 with no `select`, so a prolific author cost up to 300 fully populated
 * documents — listicle bodies and venue relations included — to render cards
 * that read eight fields. 100 is now the whole feed's page size rather than a
 * per-collection cap, and the response carries `hasNext` so a continuation can
 * be added without another shape change.
 */
const DEFAULT_PAGE_SIZE = 100
const MAX_PAGE_SIZE = 100
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/

// GET /api/public/authors/[slug]?lang=en
// No auth required — public author profile data for SSR/SEO rendering.
// Accepts the author slug (canonical) or a numeric id (legacy URLs; the
// client 301s those to the slug URL using the `slug` field in the response).
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
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

    const pageSize = clampPageSize(
      req.nextUrl.searchParams.get('pageSize'),
      DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    )
    const window = resolvePagingWindow(req.nextUrl.searchParams.get('page'), pageSize)
    if (!window.ok) {
      return NextResponse.json({ message: window.message }, { status: 400 })
    }
    const { page, offset } = window

    const payload = await getPayload({ config })

    return await publicRead({ req, scope: 'authorPage', payload }, async () => {
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

      const pool = (payload.db as { pool?: QueryablePool }).pool
      if (!pool) throw new Error('Expected Payload db.pool to be available.')

      // Ordering across the three collections happens in SQL over ids; only the
      // ids on this page are hydrated, with the card `select` the article
      // indexes already use.
      const feed = await pool.query(AUTHOR_FEED_SQL, [author.id, lang, pageSize, offset])
      const feedRow = feed.rows[0]
      const refs = parseArticleRefs(feedRow?.rows)
      const totalDocs = Number(feedRow?.total_count ?? 0)
      const totalPages = totalDocs === 0 ? 0 : Math.ceil(totalDocs / pageSize)
      const articles = await hydrateArticleRefs(payload, refs)

      return NextResponse.json({
        id: author.id,
        slug: author.slug ?? null,
        displayName,
        bio,
        avatar,
        socialLinks,
        articles,
        page,
        pageSize,
        totalDocs,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      })
    })
  } catch (error) {
    const message =
      error instanceof Error && error.message ? error.message : 'Failed to load author.'
    return NextResponse.json({ message }, { status: 500 })
  }
}
