/**
 * The website's error beacon.
 *
 * The website (a Cloudflare Worker, ADR-0014) does not run a Sentry SDK of its
 * own; docs/procedures/sentry-setup.md says why. Its error boundaries post
 * here from the browser, and its `onRequestError` posts here from the
 * Worker. Each accepted report becomes one redacted log line and, when
 * `SENTRY_DSN` is set, one Sentry event tagged `service: questura-client`, so
 * both apps' errors alert from one place.
 *
 * Unauthenticated by nature: anyone can post. So the body is size-capped and
 * validated field by field (`client-error-report.ts`), the caller is limited
 * per address, the whole endpoint is limited in total so a flood cannot spend
 * the Sentry quota, and the answer is always an uninformative 204. It never
 * reads the session: a report says what broke, not who saw it.
 */

import { NextRequest, NextResponse } from 'next/server'

import { MAX_REPORT_BYTES, parseClientErrorReport } from '@/shared/observability/client-error-report'
import { reportClientError } from '@/shared/observability/error-reporting'
import { REQUEST_ID_HEADER, wellFormedRequestId } from '@/shared/observability/request-id'
import { getClientIp, hashIdentifier, incrementCounters } from '@/shared/lib/rate-limit-counter'
import { forbiddenOriginResponse, getCorsHeaders, handleCorsOptions } from '@/shared/utils/cors'

const WINDOW_SECONDS = 60
/** One reader hitting a broken page reloads it a few times; this is plenty. */
export const MAX_REPORTS_PER_ADDRESS = 20
/** Across everyone. A real outage is one issue in Sentry, not ten thousand. */
export const MAX_REPORTS_TOTAL = 300

function accepted(corsHeaders: Record<string, string>) {
  return new NextResponse(null, { status: 204, headers: { ...corsHeaders, 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const corsHeaders = getCorsHeaders(req)
  const forbidden = forbiddenOriginResponse(req, corsHeaders)
  if (forbidden) return forbidden

  const declared = Number(req.headers.get('content-length') ?? 0)
  if (declared > MAX_REPORT_BYTES) {
    return new NextResponse(null, { status: 413, headers: corsHeaders })
  }

  const raw = await req.text()
  const report = parseClientErrorReport(raw)
  if (!report) return new NextResponse(null, { status: 400, headers: corsHeaders })

  try {
    const [perAddress, total] = await incrementCounters(
      [`client-errors:ip:${hashIdentifier(getClientIp(req.headers))}`, 'client-errors:all'],
      WINDOW_SECONDS,
    )
    if (perAddress.count > MAX_REPORTS_PER_ADDRESS || total.count > MAX_REPORTS_TOTAL) {
      return accepted(corsHeaders)
    }
  } catch {
    // No counter, no report. Dropping a report costs less than an unbounded
    // endpoint that writes logs and spends quota; the server's own errors
    // during a Redis outage are still reported through onRequestError.
    return accepted(corsHeaders)
  }

  reportClientError(report, wellFormedRequestId(req.headers.get(REQUEST_ID_HEADER)))
  return accepted(corsHeaders)
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}
