/**
 * One process of the rehearsal fleet. Started by `fleet-rehearsal.ts`; not
 * useful on its own.
 *
 * Claims and works refresh jobs in a loop against the shared disposable
 * database, exactly as a serving instance's periodic drain would, and prints
 * one JSON line per drain so the parent can see what each process actually
 * did rather than inferring it from the queue afterwards.
 *
 * It also takes a cross-process advisory lock on request, because "two
 * processes cannot both hold this" is not a claim a single process can test.
 */

import { Pool } from 'pg'

const DATABASE = process.env.READINESS_DATABASE_URI!
const NAME = process.env.READINESS_WORKER_NAME ?? 'worker'
const SCHEMA = process.env.READINESS_SCHEMA

async function main(): Promise<void> {
  process.env.DATABASE_URI = DATABASE
  process.env.QUESTURA_RELEASE_SHA = process.env.READINESS_RELEASE ?? 'rehearsal'
  process.env.APP_ROLE = NAME

  const { drainRefreshJobs } = await import('../../src/features/refresh-outbox/worker')
  const { applicationName } = await import('../../src/shared/database/fleet-manifest')

  const pool = new Pool({
    connectionString: DATABASE,
    max: Number(process.env.READINESS_POOL_MAX ?? 4),
    application_name: applicationName('payload'),
    ...(SCHEMA ? { options: `-c search_path=${SCHEMA}` } : {}),
  })

  const say = (event: Record<string, unknown>) => {
    process.stdout.write(JSON.stringify({ worker: NAME, pid: process.pid, ...event }) + '\n')
  }

  say({ event: 'started' })

  let stopping = false
  process.on('SIGTERM', () => {
    stopping = true
  })

  // Advisory-lock probe: hold a named lock for as long as told, so the parent
  // can watch a second process fail to take it.
  if (process.env.READINESS_LOCK_KEY) {
    const key = Number(process.env.READINESS_LOCK_KEY)
    const holdMs = Number(process.env.READINESS_LOCK_HOLD_MS ?? 1_000)
    const client = await pool.connect()
    const taken = await client.query('SELECT pg_try_advisory_lock($1) AS got', [key])
    say({ event: 'lock', got: taken.rows[0].got })
    if (taken.rows[0].got) {
      await new Promise((resolve) => setTimeout(resolve, holdMs))
      await client.query('SELECT pg_advisory_unlock($1)', [key])
      say({ event: 'unlock' })
    }
    client.release()
    await pool.end()
    return
  }

  while (!stopping) {
    try {
      const result = await drainRefreshJobs(pool as never, { concurrency: 2, maxJobs: 8, maxMs: 2_000 })
      if (result.claimed > 0) say({ event: 'drain', ...result })
    } catch (error) {
      say({ event: 'error', message: error instanceof Error ? error.message : String(error) })
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  say({ event: 'stopped' })
  await pool.end()
}

main().catch((error) => {
  process.stdout.write(JSON.stringify({ worker: NAME, event: 'fatal', message: String(error) }) + '\n')
  process.exit(1)
})
