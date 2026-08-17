import { NextRequest, NextResponse } from 'next/server'

import { getPrivateCorsHeaders, handleCorsOptions } from '@/shared/utils/cors'
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
  const principal = await getCurrentPrincipal(req.headers)

  return NextResponse.json(principal, {
    headers: getPrivateCorsHeaders(req),
  })
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}
