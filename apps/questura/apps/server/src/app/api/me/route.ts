import { NextRequest, NextResponse } from 'next/server'

import { forbiddenOriginResponse, getPrivateCorsHeaders, handleCorsOptions } from '@/shared/utils/cors'
import { getCurrentPrincipal } from '@/features/visitor-auth/lib/current-principal'

/**
 * Who the caller is, plus their membership state. Derived from the session
 * cookie, so the answer differs for every caller and must never be stored by
 * anything sitting between this route and the browser that asked.
 *
 * Next already treats a route that reads headers as dynamic; the marker is
 * declared rather than inferred so the property survives a refactor.
 */
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const corsHeaders = getPrivateCorsHeaders(req)

  // The last cookie-authenticated identity route that skipped this.
  // `subscription-details` states the rule it was added under: a route that
  // authenticates from an ambient cookie and answers with one visitor's state
  // declares its allowed origins, rather than each route being argued about
  // separately. Cross-origin reads are already blocked here by the unreflected
  // `Access-Control-Allow-Origin`, so this closes a gap in the rule rather than
  // a live hole — which is the point: the rule is what survives the next route.
  const blocked = forbiddenOriginResponse(req, corsHeaders)
  if (blocked) return blocked

  const principal = await getCurrentPrincipal(req.headers)

  return NextResponse.json(principal, { headers: corsHeaders })
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}
