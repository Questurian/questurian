import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@/payload.config'
import { DEFAULT_LANG, isSupportedLang } from '@/shared/i18n/languageField'
import { serializeArticleByCollection } from '@/features/articles/public/serializeArticleBlocks'

function badRequest(message: string) {
  return NextResponse.json({ message }, { status: 400 })
}

function notFound(message = 'Article not found.') {
  return NextResponse.json({ message }, { status: 404 })
}

// GET /api/public/articles/by-canonical-path?path=/peru/lima/safety/is-lima-peru-safe&lang=en
export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams
    const path = params.get('path')
    if (!path || !path.startsWith('/')) return badRequest('path required (must start with /)')

    const lang = params.get('lang') ?? DEFAULT_LANG
    if (!isSupportedLang(lang)) return badRequest(`unsupported lang: ${lang}`)

    const payload = await getPayload({ config })

    const result = await payload.find({
      collection: 'articles',
      where: {
        and: [
          { canonicalPath: { equals: path } },
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
    await serializeArticleByCollection('articles', article, payload)

    return NextResponse.json(article)
  } catch (error) {
    const message =
      error instanceof Error && error.message ? error.message : 'Failed to load article.'
    return NextResponse.json({ message }, { status: 500 })
  }
}
