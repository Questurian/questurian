import type { NextResponse } from 'next/server'

import {
  countPoolStatements,
  requestDiagnosticsEnabled,
  serverTimingHeader,
  withRequestReport,
} from './request-report'

type PayloadLike = { db?: { pool?: unknown } }

/**
 * Run a public read handler with its work counted, and hand the counts back
 * on the response when diagnostics are on.
 *
 * Wrapping is deliberate rather than automatic: middleware cannot see the
 * Payload instance, and the counts only mean something for handlers that do
 * database work.
 */
export async function withPublicReadDiagnostics(
  payload: PayloadLike,
  requestHeaders: Headers | undefined,
  handle: () => Promise<NextResponse>,
): Promise<NextResponse> {
  countPoolStatements(payload.db?.pool)

  const { result, report } = await withRequestReport(handle)

  if (requestDiagnosticsEnabled(requestHeaders)) {
    result.headers.set('Server-Timing', serverTimingHeader(report))
  }

  return result
}
