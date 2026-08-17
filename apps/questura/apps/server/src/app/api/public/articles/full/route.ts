import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@/payload.config'
import { DEFAULT_LANG, isSupportedLang } from '@/shared/i18n/languageField'
import { forbiddenOriginResponse, getPrivateCorsHeaders, handleCorsOptions } from '@/shared/utils/cors'
import { logger } from '@/shared/utils/logger'
import { requireVisitorPrincipal } from '@/features/visitor-auth/lib/current-principal'
import {
  articlesFullRateLimitResponse,
  checkArticlesFullRateLimit,
} from '@/features/articles/public/articles-full-rate-limit'
import { serializeArticleByCollection } from '@/features/articles/public/serializeArticleBlocks'
import { isArticleTypeKey, TYPE_TO_COLLECTION } from '@/features/articles/public/scope'
import { isGatedItem } from '@/shared/content/accessTier'

/**
 * Full body of a Gated item, for a reader who has paid for it (ADR-0009).
 *
 * Deliberately separate from the cached public routes. Those live under a
 * `force-static` shell with hourly ISR, so their response is shared by every
 * caller and must never depend on who is asking; this one depends on nothing
 * else and must never be stored. Keeping them apart is what lets the public
 * site stay cached and indexable while paid content stays paid.
 */
export const dynamic = 'force-dynamic'

function fail(corsHeaders: Record<string, string>, message: string, status: number) {
  return NextResponse.json({ message }, { status, headers: corsHeaders })
}

// GET /api/public/articles/full?type=itineraries&id=42&lang=en
export async function GET(req: NextRequest) {
  const corsHeaders = getPrivateCorsHeaders(req)

  // Cookie-authenticated and answers with the unlocked paid body. Being a GET
  // with no reflected CORS header for untrusted origins makes it hard to read
  // cross-origin, but "hard to exploit" is not the bar the payments routes
  // give: a cookie session from an untrusted origin is refused, not merely
  // CORS-blocked.
  const blocked = forbiddenOriginResponse(req, corsHeaders)
  if (blocked) return blocked

  const rateLimit = await checkArticlesFullRateLimit(req.headers)
  if (!rateLimit.allowed) {
    return articlesFullRateLimitResponse(corsHeaders, rateLimit.retryAfterSeconds)
  }

  try {
    const params = req.nextUrl.searchParams

    const type = params.get('type')
    if (!isArticleTypeKey(type)) return fail(corsHeaders, 'type must be articles, maps or itineraries', 400)

    const id = params.get('id')
    if (!id) return fail(corsHeaders, 'id required', 400)

    const lang = params.get('lang') ?? DEFAULT_LANG
    if (!isSupportedLang(lang)) return fail(corsHeaders, `unsupported lang: ${lang}`, 400)

    // Verification is deliberately not required. Checkout does not require it
    // either, so demanding it here would let a visitor complete a real charge
    // and then be refused the content they just bought.
    const auth = await requireVisitorPrincipal(req.headers)
    if (auth.error || !auth.principal) {
      return fail(corsHeaders, auth.error ?? 'Authentication required', auth.status)
    }

    // Entitlement is the paid-through date plus any dunning grace (ADR-0008),
    // never the mirrored subscription status.
    if (!auth.principal.membership.active) {
      return fail(corsHeaders, 'Membership required', 403)
    }

    const collection = TYPE_TO_COLLECTION[type]
    const payload = await getPayload({ config })

    const result = await payload.find({
      collection,
      where: {
        and: [
          { id: { equals: id } },
          { status: { equals: 'published' } },
          { language: { equals: lang } },
        ],
      },
      limit: 1,
      depth: 2,
      overrideAccess: true,
    })

    if (result.totalDocs === 0) return fail(corsHeaders, 'Article not found.', 404)

    const article = result.docs[0] as unknown as Record<string, unknown>

    // Free items do not need this route -- the cached route already served
    // their whole body -- so a request for one is a client bug rather than a
    // thing to satisfy quietly. Refusing keeps this route's contract to exactly
    // one sentence: paid content, for someone who paid.
    if (!isGatedItem(article)) return fail(corsHeaders, 'Article is not gated.', 404)

    await serializeArticleByCollection(collection, article, payload)

    // No gate state attached on purpose. This response is the unlocked view by
    // definition, and a `locked: false` here would be a second, contradictable
    // source of truth for a question the status code already answers.
    return NextResponse.json(article, { headers: corsHeaders })
  } catch (error) {
    logger.error('Failed to load gated article', {
      error: error instanceof Error ? error.message : String(error),
    })
    return fail(corsHeaders, 'Failed to load article.', 500)
  }
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}
