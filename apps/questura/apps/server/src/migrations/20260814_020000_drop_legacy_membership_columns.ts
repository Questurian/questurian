import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * Drops `visitor_profiles.subscription_renews_at` and
 * `visitor_profiles.membership_expiration`.
 *
 * Both held the same Stripe value, `current_period_end`, stored under two names
 * chosen by what was expected to happen next -- which is why neither was
 * populated during a failed renewal, and why entitlement fell back to reading
 * the status enum instead (ADR-0008). `paid_through_at` replaced them, and
 * nothing has read either column since that shipped and was verified live.
 *
 * This is destructive and the data is not recoverable from the database. It is
 * recoverable from Stripe, which is the actual source of truth for what a
 * visitor paid for: `scripts/reconcile-stripe-visitor-profiles.ts` rebuilds
 * `paid_through_at` from live subscriptions and does not consult either column.
 * `down()` restores the columns but not their contents; run the reconcile
 * script after a rollback rather than expecting the old values back.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(
    sql.raw(`
      ALTER TABLE "visitor_profiles"
        DROP COLUMN IF EXISTS "subscription_renews_at";

      ALTER TABLE "visitor_profiles"
        DROP COLUMN IF EXISTS "membership_expiration";
    `),
  )
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(
    sql.raw(`
      ALTER TABLE "visitor_profiles"
        ADD COLUMN IF NOT EXISTS "subscription_renews_at" timestamp(3) with time zone;

      ALTER TABLE "visitor_profiles"
        ADD COLUMN IF NOT EXISTS "membership_expiration" timestamp(3) with time zone;
    `),
  )
}
