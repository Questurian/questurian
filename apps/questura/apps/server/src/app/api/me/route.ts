import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@/payload.config'

import { forbiddenOriginResponse, getPrivateCorsHeaders, handleCorsOptions } from '@/shared/utils/cors'
import { getCurrentPrincipal } from '@/features/visitor-auth/lib/current-principal'
import { visitorAuthPool } from '@/features/visitor-auth/lib/better-auth'
import { runPrivateWork } from '@/features/visitor-auth/lib/private-route'
import { hasVisitorSessionCookie } from '@/features/visitor-auth/lib/session-cookie'
import {
  countPoolStatements,
  requestDiagnosticsEnabled,
  serverTimingHeader,
  withRequestReport,
} from '@/shared/observability/request-report'

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

  // Every page's navigation asks this, for every visitor, cached page or not,
  // so its cost is multiplied by campaign traffic more directly than any
  // content read. Counted like the public reads: statements on the session
  // pool (and Payload's, for the profile), Redis round trips, reported only
  // when diagnostics are on.
  const diagnostics = requestDiagnosticsEnabled(req.headers)
  if (diagnostics) {
    countPoolStatements(visitorAuthPool)
    countPoolStatements((await getPayload({ config })).db?.pool)
  }
  // A signed-in identity is a session lookup and two queries; an anonymous
  // one is neither, and must stay that way (CAP-03). A caller with no session
  // cookie — found by name, not by any cookie text that mentions the prefix —
  // is answered here without a lookup, a limiter or a gate. Everyone else runs
  // in the shared private order (`private-route.ts`): ingress, the
  // per-session/per-address guard, then the private gate around the lookup.
  if (!hasVisitorSessionCookie(req.headers)) {
    const { result, report } = await withRequestReport(async () => ({ authenticated: false, principal: null }))
    const response = NextResponse.json(result, { headers: corsHeaders })
    if (diagnostics) response.headers.set('Server-Timing', serverTimingHeader(report))
    return response
  }

  return runPrivateWork(
    { headers: req.headers, signal: req.signal, corsHeaders, route: '/api/me' },
    async () => {
      const { result, report } = await withRequestReport(() => getCurrentPrincipal(req.headers))
      const response = NextResponse.json(result, { headers: corsHeaders })
      if (diagnostics) response.headers.set('Server-Timing', serverTimingHeader(report))
      return response
    },
  )
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}
