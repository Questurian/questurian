/**
 * Report `visitor_profiles` rows whose `auth_user_id` no longer maps to a
 * Better Auth user.
 *
 * This ran on every boot. A scan of the table holding Stripe linkage and paid
 * entitlement is a diagnostic, not a precondition for serving, and repeating
 * it on every cold start is exactly the cost a sleeping deployment cannot
 * afford — so it is a command now, run when somebody wants the answer.
 *
 * Reports. Never deletes. See `orphaned-visitor-profiles.ts` for why.
 *
 * Exit code 1 when orphans exist, so it can gate a check if anyone wants it to.
 *
 * Usage:
 *   pnpm audit:visitor-auth-orphans
 */

import 'dotenv/config'
import { Pool } from 'pg'

import {
  describeOrphanReport,
  findOrphanedVisitorProfiles,
} from '../src/features/visitor-auth/lib/orphaned-visitor-profiles'

async function main() {
  const connectionString = process.env.DATABASE_URI
  if (!connectionString) {
    console.error('DATABASE_URI is not set.')
    process.exit(1)
  }

  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 10000 })

  try {
    const report = await findOrphanedVisitorProfiles(pool)
    console.log(describeOrphanReport(report))
    process.exitCode = report.orphanCount > 0 ? 1 : 0
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
