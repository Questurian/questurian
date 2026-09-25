/**
 * The website's page-speed beacon (launch fix plan item 13).
 *
 * The sibling of `/api/client-errors`: the website runs no vendor SDK, so its
 * readers' browsers post their Core Web Vitals (LCP, INP, CLS, plus FCP and
 * TTFB) here once per page view, and each accepted batch becomes one log line
 * (`message: "Web vitals"`) with the numbers as flat fields. That is how real
 * readers' page speed is visible after launch; the CI budgets
 * (apps/questura/perf/budgets.json) only see the sandbox.
 *
 * Not forwarded to Sentry: Sentry is the error alarm (decision D1), and
 * performance data there is tracing, a separate decision with its own quota.
 *
 * Unauthenticated by nature, so it is guarded like the error beacon: the body
 * is size-capped and validated field by field (`web-vitals-report.ts`), the
 * caller is limited per address, the endpoint is limited in total so a flood
 * cannot fill the logs, and the answer is always an uninformative 204. It
 * never reads the session.
 */

import { NextRequest, NextResponse } from 'next/server'

import { MAX_VITALS_BYTES, parseWebVitalsReport, webVitalsLogFields } from '@/shared/observability/web-vitals-report'
import { getClientIp, hashIdentifier, incrementCounters } from '@/shared/lib/rate-limit-counter'
import { logger } from '@/shared/utils/logger'
import { forbiddenOriginResponse, getCorsHeaders, handleCorsOptions } from '@/shared/utils/cors'

const WINDOW_SECONDS = 60
/** One batch per page view; a reader opening 60 pages a minute is plenty. */
export const MAX_VITALS_PER_ADDRESS = 60
/** Across everyone. Past this the minute's samples are dropped, not queued. */
export const MAX_VITALS_TOTAL = 1200

function accepted(corsHeaders: Record<string, string>) {
  return new NextResponse(null, { status: 204, headers: { ...corsHeaders, 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const corsHeaders = getCorsHeaders(req)
  const forbidden = forbiddenOriginResponse(req, corsHeaders)
  if (forbidden) return forbidden

  const declared = Number(req.headers.get('content-length') ?? 0)
  if (declared > MAX_VITALS_BYTES) {
    return new NextResponse(null, { status: 413, headers: corsHeaders })
  }

  const report = parseWebVitalsReport(await req.text())
  if (!report) return new NextResponse(null, { status: 400, headers: corsHeaders })

  try {
    const [perAddress, total] = await incrementCounters(
      [`web-vitals:ip:${hashIdentifier(getClientIp(req.headers))}`, 'web-vitals:all'],
      WINDOW_SECONDS,
    )
    if (perAddress.count > MAX_VITALS_PER_ADDRESS || total.count > MAX_VITALS_TOTAL) {
      return accepted(corsHeaders)
    }
  } catch {
    // No counter, no sample: an unbounded log writer is worse than a gap.
    return accepted(corsHeaders)
  }

  logger.info('Web vitals', webVitalsLogFields(report))
  return accepted(corsHeaders)
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}
