import { NextResponse } from 'next/server'

import { workerHealth } from '@/features/refresh-outbox/lifecycle'
import { readinessState } from '@/shared/observability/readiness'

/**
 * Readiness, separate from liveness, and free.
 *
 * `/api/health` answers the liveness question by running a database query. A
 * platform that polls it every few seconds across every instance turns a
 * database outage into a database outage plus a poll storm — the one moment
 * when the extra queries cost the most. This route reads process state and
 * touches nothing: it can be polled as hard as a platform likes.
 *
 * 503 until initialisation has succeeded. A process that is up and retrying
 * is alive and not ready, and a platform that conflates those restarts the
 * instance that was about to recover.
 *
 * `degraded` is capability, not fitness. A transient Redis failure belongs
 * there: public reads still work under local limits, so taking the instance
 * out of rotation would trade a degraded site for no site.
 */

export const dynamic = 'force-dynamic'
const NO_STORE = { 'Cache-Control': 'no-store' }

export async function GET() {
  const readiness = readinessState()

  return NextResponse.json(
    {
      ready: readiness.ready,
      reason: readiness.reason,
      attempts: readiness.attempts,
      readySince: readiness.readySince,
      degraded: readiness.degraded,
      releaseSha: process.env.QUESTURA_RELEASE_SHA || 'unknown',
      refreshWorker: workerHealth(),
    },
    { status: readiness.ready ? 200 : 503, headers: NO_STORE },
  )
}
