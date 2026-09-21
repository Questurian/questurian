/**
 * Orphaned visitor profiles: `visitor_profiles` rows whose `auth_user_id` no
 * longer maps to a `visitor_auth_users` row.
 *
 * They arise when the Better Auth tables are dropped and recreated empty while
 * the Payload-owned profile table survives — a restore, a `push`-mode boot, a
 * wrong `DATABASE_URI`.
 *
 * Reports. Never deletes.
 *
 * This used to `DELETE` on every boot, justified as keeping the sign-in
 * email-existence check consistent with the auth source of truth. That
 * justification does not hold: the account check (`findVisitorAccountByEmail`)
 * resolves entirely against `visitor_auth_users` and never reads
 * `visitor_profiles`. Orphans are inert — `authUserId` is unique and lookups
 * are keyed on it, so a stale row can never be matched by a live session, and
 * `email` is not unique, so it cannot collide with a re-registered visitor.
 *
 * The rows are not cheap, though: `visitor_profiles` holds the Stripe linkage
 * (`stripe_customer_id`, `stripe_subscription_id`) and the paid entitlement
 * (`paid_through_at`). Deleting them means a restore-ordering mistake or a
 * wrong URI silently destroys billing linkage with no FK, no soft-delete, no
 * audit and no row-count guard.
 *
 * It is also no longer a boot step. A scan of the billing table is a
 * diagnostic, not a precondition for serving, and repeating it on every cold
 * start is exactly the cost a sleeping deployment cannot afford.
 */

export type VisitorProfileOrphanReport = {
  /** False when `visitor_profiles` does not exist, e.g. a fresh database. */
  tablePresent: boolean
  orphanCount: number
  sampleIds: string[]
}

type Queryable = {
  query: <T>(sql: string) => Promise<{ rows: T[] }>
}

export async function findOrphanedVisitorProfiles(
  pool: Queryable,
): Promise<VisitorProfileOrphanReport> {
  const { rows: tableRows } = await pool.query<{ present: boolean }>(`
    SELECT to_regclass('public.visitor_profiles') IS NOT NULL AS present;
  `)

  if (!tableRows[0]?.present) {
    return { tablePresent: false, orphanCount: 0, sampleIds: [] }
  }

  const { rows } = await pool.query<{ orphan_count: string; sample_ids: string[] | null }>(`
    SELECT
      COUNT(*)::text AS orphan_count,
      (ARRAY_AGG(vp."id"::text ORDER BY vp."id"))[1:20] AS sample_ids
    FROM "visitor_profiles" vp
    WHERE vp."auth_user_id" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM "visitor_auth_users" u WHERE u."id" = vp."auth_user_id"
      );
  `)

  return {
    tablePresent: true,
    orphanCount: Number(rows[0]?.orphan_count ?? '0'),
    sampleIds: rows[0]?.sample_ids ?? [],
  }
}

export function describeOrphanReport(report: VisitorProfileOrphanReport): string {
  if (!report.tablePresent) return 'visitor_profiles does not exist; nothing to audit.'
  if (report.orphanCount === 0) return 'No orphaned visitor_profiles rows.'

  return (
    `${report.orphanCount} orphaned visitor_profiles row(s) ` +
    '(auth_user_id with no matching visitor_auth_users row). These rows are retained: ' +
    `they may carry Stripe billing linkage. Sample ids: ${report.sampleIds.join(', ')}`
  )
}
