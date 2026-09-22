import { createHash, timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@/payload.config'
import {
  drainRefreshJobs,
  listFailedRefreshJobs,
  refreshJobStats,
  replayFailedRefreshJobs,
  type WorkerPool,
} from '@/features/refresh-outbox/worker'

/**
 * The refresh outbox's operator surface (features/refresh-outbox).
 *
 * GET   → counts, oldest due age, the most recent failed jobs.
 * POST  → `?action=drain` (default) does due jobs now — the endpoint a
 *         platform scheduler calls every minute; `?action=replay` requeues
 *         failed jobs.
 *
 * Secret-gated like `/api/internal/db-stats`: `Authorization: Bearer <secret>`
 * with `REFRESH_WORKER_SECRET`, compared through equal-length digests. Unset
 * secret → 503, never open.
 */

const NO_STORE = { 'Cache-Control': 'no-store' }

function authorized(req: NextRequest): NextResponse | null {
  const configured = process.env.REFRESH_WORKER_SECRET?.trim()
  if (!configured) {
    return NextResponse.json({ message: 'REFRESH_WORKER_SECRET is not configured.' }, { status: 503, headers: NO_STORE })
  }
  const header = req.headers.get('authorization') ?? ''
  const provided = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
  const digest = (value: string) => createHash('sha256').update(value).digest()
  if (!timingSafeEqual(digest(provided), digest(configured))) {
    return NextResponse.json({ message: 'Unauthorized.' }, { status: 401, headers: NO_STORE })
  }
  return null
}

async function pool(): Promise<WorkerPool> {
  const payload = await getPayload({ config })
  return (payload.db as unknown as { pool: WorkerPool }).pool
}

export async function GET(req: NextRequest) {
  const refused = authorized(req)
  if (refused) return refused

  const db = await pool()
  return NextResponse.json(
    { stats: await refreshJobStats(db), failed: await listFailedRefreshJobs(db, 20) },
    { headers: NO_STORE },
  )
}

export async function POST(req: NextRequest) {
  const refused = authorized(req)
  if (refused) return refused

  const db = await pool()
  const action = req.nextUrl.searchParams.get('action') ?? 'drain'
  if (action === 'replay') {
    return NextResponse.json({ replayed: await replayFailedRefreshJobs(db) }, { headers: NO_STORE })
  }
  if (action !== 'drain') {
    return NextResponse.json({ message: `Unknown action "${action}".` }, { status: 400, headers: NO_STORE })
  }
  // Bounded by jobs *and* wall clock. The old call asked for a hundred jobs
  // in one claim, which leased ninety-odd of them for a minute before the
  // worker had started any — invisible to every other drain, and reclaimed
  // elsewhere if the lease ran out mid-work (features/refresh-outbox/worker.ts).
  return NextResponse.json(
    { drained: await drainRefreshJobs(db, { maxJobs: 100, concurrency: 4 }) },
    { headers: NO_STORE },
  )
}
