/**
 * Operate the refresh outbox (features/refresh-outbox) without the app.
 *
 *   pnpm refresh:jobs -- stats            counts and the oldest due job's age
 *   pnpm refresh:jobs -- drain            do every due job now (loops until none are due)
 *   pnpm refresh:jobs -- failed           list jobs that ran out of attempts
 *   pnpm refresh:jobs -- replay           put failed jobs back in the queue
 *
 * `drain` is also what a platform scheduler should run every minute or so
 * (or call `POST /api/internal/refresh-jobs`), so jobs left behind by a
 * process that died, or by a frontend that was down, still get done.
 * Revalidation needs QUESTURA_CLIENT_URL and QUESTURA_REVALIDATION_SECRET in
 * this environment, exactly as the server does.
 */

import 'dotenv/config'
import { Pool } from 'pg'

import { runDrain, workerHealth } from '../src/features/refresh-outbox/lifecycle'
import {
  listFailedRefreshJobs,
  refreshJobStats,
  replayFailedRefreshJobs,
} from '../src/features/refresh-outbox/worker'

async function main() {
  const command = process.argv.filter((arg) => arg !== '--')[2] ?? 'stats'
  const connectionString = process.env.DATABASE_URI_UNPOOLED || process.env.DATABASE_URI
  if (!connectionString) throw new Error('DATABASE_URI is not set.')

  const pool = new Pool({ connectionString, max: 2, connectionTimeoutMillis: 10_000 })
  try {
    if (command === 'stats') {
      console.log(JSON.stringify({ stats: await refreshJobStats(pool), worker: workerHealth() }, null, 2))
    } else if (command === 'drain') {
      const total = { claimed: 0, done: 0, retried: 0, failed: 0, superseded: 0 }
      for (let round = 0; round < 100; round += 1) {
        const result = await runDrain(pool, { maxJobs: 100, concurrency: 4 })
        for (const key of Object.keys(total) as Array<keyof typeof total>) total[key] += result[key]
        if (result.claimed === 0) break
      }
      console.log(JSON.stringify({ ...total, worker: workerHealth() }))
      if (total.failed > 0) process.exitCode = 2
    } else if (command === 'failed') {
      console.log(JSON.stringify(await listFailedRefreshJobs(pool), null, 2))
    } else if (command === 'replay') {
      console.log(`Replayed ${await replayFailedRefreshJobs(pool)} failed jobs.`)
    } else {
      throw new Error(`Unknown command "${command}". Use stats, drain, failed or replay.`)
    }
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
