import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@/payload.config'
import { DEFAULT_LANG, isSupportedLang } from '@/shared/i18n/languageField'
import {
  serializeArticleByCollection,
  type ArticleCollectionSlug,
} from '@/features/articles/public/serializeArticleBlocks'
import {
  isArticleScopeKind,
  isArticleTypeKey,
  TYPE_TO_COLLECTION,
  type ArticleScope,
} from '@/features/articles/public/scope'

function badRequest(message: string) {
  return NextResponse.json({ message }, { status: 400 })
}

function notFound(message = 'Article not found.') {
  return NextResponse.json({ message }, { status: 404 })
}

function parseScopeFromQuery(req: NextRequest): ArticleScope | { error: string } {
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

// GET /api/public/articles/by-id?scope=...&country=...&city=...&type=articles|maps|itineraries&slug=...&lang=en
export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams
    const slug = params.get('slug')
    if (!slug) return badRequest('slug required')

    const typeParam = params.get('type') ?? 'articles'
    if (!isArticleTypeKey(typeParam)) return badRequest('type must be articles, maps, or itineraries')

    const lang = params.get('lang') ?? DEFAULT_LANG
    if (!isSupportedLang(lang)) return badRequest(`unsupported lang: ${lang}`)

    const scopeOrError = parseScopeFromQuery(req)
    if ('error' in scopeOrError) return badRequest(scopeOrError.error)
    const scope = scopeOrError

    const collection: ArticleCollectionSlug = TYPE_TO_COLLECTION[typeParam]
    const payload = await getPayload({ config })

    const result = await payload.find({
      collection,
      where: {
        and: [
          { slug: { equals: slug } },
          { status: { equals: 'published' } },
          { language: { equals: lang } },
        ],
      },
      limit: 1,
      depth: 2,
      overrideAccess: true,
    })

    if (result.totalDocs === 0) return notFound()

    const article = result.docs[0] as unknown as Record<string, unknown>

    if (scope.kind !== 'global') {
      const locationKey = typeof article.location === 'string' ? article.location : ''
      const expectedKey = scope.kind === 'country' ? scope.country : `${scope.country}|${scope.city}`
      if (locationKey !== expectedKey && !locationKey.startsWith(`${expectedKey}|`)) {
        return notFound()
      }
    }

    await serializeArticleByCollection(collection, article)

    return NextResponse.json(article)
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : 'Failed to load article.'
    return NextResponse.json({ message }, { status: 500 })
  }
}
