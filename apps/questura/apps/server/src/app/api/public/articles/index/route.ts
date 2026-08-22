import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import type { Where } from 'payload'

import config from '@/payload.config'
import { DEFAULT_LANG, isSupportedLang } from '@/shared/i18n/languageField'
import {
  buildScopeWhereCascade,
  isArticleScopeKind,
  isArticleTypeKey,
  TYPE_TO_COLLECTION,
  type ArticleScope,
  type ArticleTypeKey,
} from '@/features/articles/public/scope'
import {
  INDEX_ITEM_DEPTH,
  INDEX_ITEM_SELECT,
  serializeIndexItem,
} from '@/features/articles/public/indexItem'

const MAX_PAGE_SIZE = 50
const DEFAULT_PAGE_SIZE = 20

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
      depth: INDEX_ITEM_DEPTH,
      select: INDEX_ITEM_SELECT,
      sort: '-publishedAt',
      overrideAccess: true,
    })

    if (result.totalDocs === 0) return notFound()
    if (page > result.totalPages) return notFound()

    const items = result.docs.map((doc) => serializeIndexItem(doc, type))

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
