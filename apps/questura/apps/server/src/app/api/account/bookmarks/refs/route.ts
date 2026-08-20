import { NextRequest, NextResponse } from 'next/server'

import { requireCurrentPrincipal } from '@/features/visitor-auth/lib/current-principal'
import { listBookmarkRefs } from '@/features/bookmarks/lib/service'
import { forbiddenOriginResponse, getPrivateCorsHeaders, handleCorsOptions } from '@/shared/utils/cors'

/**
 * Every bookmark the signed-in Visitor holds, as bare references.
 *
 * This exists so a grid of article cards can show its bookmark state without a
 * request per card, or a request per grid. The client fetches this once, keeps
 * it, and answers "is this one bookmarked" locally. A batched
 * `POST /bookmarks/status` with the visible ids would work too, but it fires on
 * every listing page and every related shelf; one small list per session does
 * not.
 *
 * It carries no target data — no titles, no paths — so it stays small and says
 * nothing about content the reader could not already see.
 */
export async function GET(req: NextRequest) {
  const corsHeaders = getPrivateCorsHeaders(req)

  const blocked = forbiddenOriginResponse(req, corsHeaders)
  if (blocked) return blocked

  const auth = await requireCurrentPrincipal(req.headers)
  if (auth.error || !auth.principal) {
    // Signed out is an ordinary state for this route: the bookmark control is
    // rendered for everyone, and it asks before it knows who is asking.
    //
    // `authenticated` is reported because an empty `refs` is otherwise
    // ambiguous — a signed-out reader and a signed-in reader who has saved
    // nothing look identical. The control needs to tell them apart to send a
    // signed-out click to the sign-in modal without first flipping itself on.
    return NextResponse.json({ authenticated: false, refs: [] }, { headers: corsHeaders })
  }

  try {
    const refs = await listBookmarkRefs(auth.principal.id)
    return NextResponse.json({ authenticated: true, refs }, { headers: corsHeaders })
  } catch (error) {
    console.error('[bookmarks] failed to list refs', error)
    return NextResponse.json(
      { error: 'Failed to load bookmarks.' },
      { status: 500, headers: corsHeaders }
    )
  }
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}
