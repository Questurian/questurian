import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@/payload.config'

import { AdmissionRefused } from '@/shared/http/admission'
import { admitPublicWork, overloadedResponse } from '@/shared/http/public-read'
import { forbiddenOriginResponse, getPrivateCorsHeaders, handleCorsOptions } from '@/shared/utils/cors'
import { getCurrentPrincipal } from '@/features/visitor-auth/lib/current-principal'
import { visitorAuthPool } from '@/features/visitor-auth/lib/better-auth'
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

/**
 * Better Auth's cookie prefix (`features/visitor-auth/lib/better-auth.ts`).
 * Matched on presence only: whether the cookie is *valid* is the session
 * lookup's job, and asking that question here would be the database work this
 * check exists to avoid.
 */
const SESSION_COOKIE = /questura_visitor/

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
  // one is neither, and must stay that way (CAP-03). So the budget applies to
  // the expensive half only: a caller with no session cookie never reaches
  // the gate, and a public burst cannot starve signed-in readers of the
  // budget they were promised — or be starved by them.
  const signedIn = SESSION_COOKIE.test(req.headers.get('cookie') ?? '')

  let principal: Awaited<ReturnType<typeof getCurrentPrincipal>>
  let report: Awaited<ReturnType<typeof withRequestReport>>['report']
  try {
    const outcome = signedIn
      ? await admitPublicWork('private', () => withRequestReport(() => getCurrentPrincipal(req.headers)), req.signal ?? undefined)
      : await withRequestReport(() => getCurrentPrincipal(req.headers))
    principal = outcome.result
    report = outcome.report
  } catch (error) {
    // Still private, still `no-store`, still retryable — a refusal here must
    // not become something a cache can hold or a client treats as a logout.
    if (error instanceof AdmissionRefused) {
      const refused = overloadedResponse(error)
      for (const [name, value] of Object.entries(corsHeaders)) refused.headers.set(name, value)
      return refused
    }
    throw error
  }

  const response = NextResponse.json(principal, { headers: corsHeaders })
  if (diagnostics) {
    response.headers.set('Server-Timing', serverTimingHeader(report))
  }
  return response
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}
