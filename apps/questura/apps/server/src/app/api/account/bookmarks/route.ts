import { NextRequest, NextResponse } from 'next/server'

import { requireCurrentPrincipal } from '@/features/visitor-auth/lib/current-principal'
import { checkBookmarkWriteRateLimit } from '@/features/bookmarks/lib/rate-limit'
import {
  addBookmark,
  listBookmarkPage,
  removeBookmark,
  targetExists,
} from '@/features/bookmarks/lib/service'
import { isBookmarkTargetType, parseTargetId } from '@/features/bookmarks/lib/target'
import { forbiddenOriginResponse, getPrivateCorsHeaders, handleCorsOptions } from '@/shared/utils/cors'

/**
 * Bookmark read/write for the signed-in Visitor (ADR-0010).
 *
 * Deliberately does not require a verified email. That mirrors the existing
 * decision for checkout: verification is required for sensitive account
 * changes, and a bookmark is not one. Gating it would block the cheapest
 * possible first action a new reader can take.
 *
 * Membership is irrelevant here in both directions. A bookmark grants no
 * access, so an unentitled visitor may bookmark a Gated item freely; what they
 * get on opening it is still the Free sample.
 */

function unauthorized(corsHeaders: Record<string, string>, message: string, status: 401 | 403) {
  return NextResponse.json({ error: message }, { status, headers: corsHeaders })
}

function parseRef(source: { targetType?: unknown; targetId?: unknown }) {
  if (!isBookmarkTargetType(source.targetType)) {
    return { error: 'targetType must be articles, maps, or itineraries' } as const
  }
  const targetId = parseTargetId(source.targetId)
  if (targetId === null) return { error: 'targetId must be a positive integer' } as const
  return { ref: { targetType: source.targetType, targetId } } as const
}

// GET /api/account/bookmarks?page=1&pageSize=20&type=articles
export async function GET(req: NextRequest) {
  const corsHeaders = getPrivateCorsHeaders(req)

  const blocked = forbiddenOriginResponse(req, corsHeaders)
  if (blocked) return blocked

  const auth = await requireCurrentPrincipal(req.headers)
  if (auth.error || !auth.principal) {
    return unauthorized(corsHeaders, auth.error ?? 'Authentication required', auth.status as 401)
  }

  const params = req.nextUrl.searchParams
  const rawType = params.get('type')
  if (rawType !== null && !isBookmarkTargetType(rawType)) {
    return NextResponse.json(
      { error: 'type must be articles, maps, or itineraries' },
      { status: 400, headers: corsHeaders }
    )
  }
  const targetType = rawType === null ? undefined : rawType

  try {
    const result = await listBookmarkPage({
      authUserId: auth.principal.id,
      page: Number(params.get('page') ?? 1),
      pageSize: Number(params.get('pageSize') ?? 20),
      targetType,
    })

    return NextResponse.json(result, { headers: corsHeaders })
  } catch (error) {
    console.error('[bookmarks] failed to list', error)
    return NextResponse.json(
      { error: 'Failed to load bookmarks.' },
      { status: 500, headers: corsHeaders }
    )
  }
}

// POST /api/account/bookmarks  { targetType, targetId }
export async function POST(req: NextRequest) {
  const corsHeaders = getPrivateCorsHeaders(req)

  const blocked = forbiddenOriginResponse(req, corsHeaders)
  if (blocked) return blocked

  const auth = await requireCurrentPrincipal(req.headers)
  if (auth.error || !auth.principal) {
    return unauthorized(corsHeaders, auth.error ?? 'Authentication required', auth.status as 401)
  }

  const rateLimit = await checkBookmarkWriteRateLimit(auth.principal.id, req.headers)
  if (!rateLimit.allowed) {
    const response = NextResponse.json(
      { error: 'Too many requests. Please try again shortly.' },
      { status: 429, headers: corsHeaders }
    )
    response.headers.set('Retry-After', String(rateLimit.retryAfterSeconds))
    return response
  }

  let body: { targetType?: unknown; targetId?: unknown }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400, headers: corsHeaders })
  }

  const parsed = parseRef(body)
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400, headers: corsHeaders })
  }

  try {
    // Refuse a bookmark on something the reader was never shown, so the table
    // cannot be seeded with ids for drafts or deleted documents.
    if (!(await targetExists(parsed.ref))) {
      return NextResponse.json(
        { error: 'That item is not available to bookmark.' },
        { status: 404, headers: corsHeaders }
      )
    }

    await addBookmark(auth.principal.id, parsed.ref)

    return NextResponse.json({ bookmarked: true, ...parsed.ref }, { headers: corsHeaders })
  } catch (error) {
    console.error('[bookmarks] failed to add', error)
    return NextResponse.json(
      { error: 'Failed to save bookmark.' },
      { status: 500, headers: corsHeaders }
    )
  }
}

// DELETE /api/account/bookmarks?targetType=articles&targetId=12
export async function DELETE(req: NextRequest) {
  const corsHeaders = getPrivateCorsHeaders(req)

  const blocked = forbiddenOriginResponse(req, corsHeaders)
  if (blocked) return blocked

  const auth = await requireCurrentPrincipal(req.headers)
  if (auth.error || !auth.principal) {
    return unauthorized(corsHeaders, auth.error ?? 'Authentication required', auth.status as 401)
  }

  const rateLimit = await checkBookmarkWriteRateLimit(auth.principal.id, req.headers)
  if (!rateLimit.allowed) {
    const response = NextResponse.json(
      { error: 'Too many requests. Please try again shortly.' },
      { status: 429, headers: corsHeaders }
    )
    response.headers.set('Retry-After', String(rateLimit.retryAfterSeconds))
    return response
  }

  const params = req.nextUrl.searchParams
  const parsed = parseRef({
    targetType: params.get('targetType'),
    targetId: params.get('targetId'),
  })
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400, headers: corsHeaders })
  }

  try {
    // Unbookmarking a target that has since been unpublished or deleted has to
    // keep working, so this deliberately does not check `targetExists`.
    await removeBookmark(auth.principal.id, parsed.ref)

    return NextResponse.json({ bookmarked: false, ...parsed.ref }, { headers: corsHeaders })
  } catch (error) {
    console.error('[bookmarks] failed to remove', error)
    return NextResponse.json(
      { error: 'Failed to remove bookmark.' },
      { status: 500, headers: corsHeaders }
    )
  }
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}
