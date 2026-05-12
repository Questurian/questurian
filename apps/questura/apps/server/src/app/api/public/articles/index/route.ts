import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import type { Where } from 'payload'

import config from '@/payload.config'
import { DEFAULT_LANG, isSupportedLang } from '@/shared/i18n/languageField'
import {
  articleHrefForScope,
  buildScopeWhereCascade,
  isArticleScopeKind,
  isArticleTypeKey,
  TYPE_TO_COLLECTION,
  type ArticleScope,
  type ArticleTypeKey,
} from '@/features/articles/public/scope'

const MAX_PAGE_SIZE = 50
const DEFAULT_PAGE_SIZE = 20

type IndexItem = {
  id: number | string
  title: string
  slug: string
  excerpt: string | null
  publishedAt: string | null
  href: string
  thumbnail: { url: string; alt: string | null } | null
}

function badRequest(message: string) {
  return NextResponse.json({ message }, { status: 400 })
}

function notFound(message = 'No items found in this scope.') {
  return NextResponse.json({ message }, { status: 404 })
}

function parseScope(req: NextRequest): ArticleScope | { error: string } {
  const params = req.nextUrl.searchParams
  const kind = params.get('scope')
  if (!isArticleScopeKind(kind)) return { error: 'scope must be global, country, or city' }
  if (kind === 'global') return { kind: 'global' }
  const country = params.get('country')
  if (!country) return { error: 'country required for country/city scope' }
  if (kind === 'country') return { kind: 'country', country }
  const city = params.get('city')
  if (!city) return { error: 'city required for city scope' }
  return { kind: 'city', country, city }
}

function clampPageSize(raw: string | null): number {
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 1) return DEFAULT_PAGE_SIZE
  return Math.min(Math.floor(value), MAX_PAGE_SIZE)
}

function clampPage(raw: string | null): number {
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 1) return 1
  return Math.floor(value)
}

function pickTitle(doc: Record<string, unknown>): string {
  return typeof doc.title === 'string' ? doc.title : ''
}

function pickExcerpt(doc: Record<string, unknown>): string | null {
  const seo = doc.seoSection as Record<string, unknown> | undefined
  const desc = seo?.metaDescription
  if (typeof desc === 'string' && desc.trim()) return desc.trim()
  return null
}

function pickThumbnail(doc: Record<string, unknown>): IndexItem['thumbnail'] {
  const header = doc.header as Record<string, unknown> | undefined
  const headerSection = doc.headerSection as Record<string, unknown> | undefined
  const image = (header?.featuredImage ?? headerSection?.featuredImage) as
    | Record<string, unknown>
    | undefined
  if (!image) return null
  const url = typeof image.url === 'string' ? image.url : null
  if (!url) return null
  const alt = typeof image.alt_text === 'string' ? image.alt_text : null
  return { url, alt }
}

// GET /api/public/articles/index?scope=...&country=...&city=...&type=articles&page=1&pageSize=20&lang=en
export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams

    const typeParam = params.get('type')
    if (!typeParam || !isArticleTypeKey(typeParam)) {
      return badRequest('type must be articles, maps, or itineraries')
    }
    const type: ArticleTypeKey = typeParam

    const lang = params.get('lang') ?? DEFAULT_LANG
    if (!isSupportedLang(lang)) return badRequest(`unsupported lang: ${lang}`)

    const scopeOrError = parseScope(req)
    if ('error' in scopeOrError) return badRequest(scopeOrError.error)
    const scope = scopeOrError

    const page = clampPage(params.get('page'))
    const pageSize = clampPageSize(params.get('pageSize'))

    const collection = TYPE_TO_COLLECTION[type]
    const payload = await getPayload({ config })

    const whereClauses: Where[] = [
      { status: { equals: 'published' } },
      { language: { equals: lang } },
    ]
    const scopeWhere = buildScopeWhereCascade(scope)
    if (scopeWhere) whereClauses.push(scopeWhere)

    const result = await payload.find({
      collection,
      where: { and: whereClauses },
      page,
      limit: pageSize,
      depth: 1,
      sort: '-publishedAt',
      overrideAccess: true,
    })

    if (result.totalDocs === 0) return notFound()
    if (page > result.totalPages) return notFound()

    const items: IndexItem[] = result.docs.map((rawDoc) => {
      const doc = rawDoc as unknown as Record<string, unknown>
      const slug = typeof doc.slug === 'string' ? doc.slug : ''
      const id = (doc.id as number | string | undefined) ?? slug

      const itemScope: ArticleScope = (() => {
        const location = typeof doc.location === 'string' ? doc.location : ''
        const parts = location.split('|').filter(Boolean)
        if (parts.length === 0) return { kind: 'global' }
        if (parts.length === 1) return { kind: 'country', country: parts[0] }
        return { kind: 'city', country: parts[0], city: parts[1] }
      })()

      // Prefer the stored canonicalPath for city-scope standard articles so
      // index links go straight to the category-based URL.
      const canonical = typeof doc.canonicalPath === 'string' ? doc.canonicalPath : null
      const href = canonical ?? articleHrefForScope(itemScope, type, slug)

      return {
        id,
        title: pickTitle(doc),
        slug,
        excerpt: pickExcerpt(doc),
        publishedAt: typeof doc.publishedAt === 'string' ? doc.publishedAt : null,
        href,
        thumbnail: pickThumbnail(doc),
      }
    })

    return NextResponse.json({
      page,
      pageSize,
      totalDocs: result.totalDocs,
      totalPages: result.totalPages,
      hasNext: page < result.totalPages,
      hasPrev: page > 1,
      items,
    })
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : 'Failed to load index.'
    return NextResponse.json({ message }, { status: 500 })
  }
}
