import { NextResponse } from 'next/server'

import { workerHealth } from '@/features/refresh-outbox/lifecycle'
import { loadIdentityState } from '@/shared/http/load-identity'
import { sampledDatabaseProbe } from '@/shared/observability/health-probe'
import { readinessState } from '@/shared/observability/readiness'

/**
 * Readiness: may this instance be sent traffic right now?
 *
 * Two things have to be true. Initialisation has succeeded, and the database
 * answers. It used to check only the first, so an instance whose database had
 * frozen kept saying "ready" while every request it took hung
 * (readiness:faults, "database down").
 *
 * The database half is `select 1` under its own short limit
 * (`PROBE_TIMEOUT_MS`), and it is **sampled**: one probe per process per
 * `PROBE_TTL_MS`, shared with `/api/health`, however hard a platform polls. A
 * poll storm against a struggling database is the thing sampling exists to
 * prevent (health-probe.ts).
 *
 * 503 until initialisation has succeeded, without probing. A process that is
 * up and retrying is alive and not ready, and a platform that conflates those
 * restarts the instance that was about to recover.
 *
 * `degraded` is capability, not fitness. A transient Redis failure belongs
 * there: public reads still work under local limits, so taking the instance
 * out of rotation would trade a degraded site for no site. A database that
 * does not answer is different: nothing this instance serves works without it.
 */

export const dynamic = 'force-dynamic'
const NO_STORE = { 'Cache-Control': 'no-store' }

export async function GET() {
  const readiness = readinessState()
  const probe = readiness.ready ? await sampledDatabaseProbe() : null
  const ready = readiness.ready && probe?.ok === true

  return NextResponse.json(
    {
      ready,
      reason: readiness.reason ?? (probe && !probe.ok ? 'database unreachable' : null),
      attempts: readiness.attempts,
      readySince: readiness.readySince,
      degraded: readiness.degraded,
      database: probe
        ? { reachable: probe.ok, responseTimeMs: probe.responseTimeMs, probeAgeMs: Date.now() - probe.at }
        : null,
      releaseSha: process.env.QUESTURA_RELEASE_SHA || 'unknown',
      refreshWorker: workerHealth(),
      // `off` unless an approved load test's key is set (decision D3).
      // `launch:verify` fails on anything else, so a forgotten key cannot
      // outlive its window unnoticed.
      loadIdentity: loadIdentityState(),
    },
    { status: ready ? 200 : 503, headers: NO_STORE },
  )
}
