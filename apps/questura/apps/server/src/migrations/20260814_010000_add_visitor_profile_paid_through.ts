import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * Adds `visitor_profiles.paid_through_at` and `visitor_profiles.dunning_grace_until`.
 *
 * Membership entitlement used to be read off `subscription_status`, so a single
 * failed renewal charge revoked paid access immediately even though Stripe goes
 * on retrying that card for weeks (see ADR-0008). The status enum answers "what
 * is Stripe doing", not "has this visitor paid" -- entitlement now reads a date
 * instead.
 *
 * `paid_through_at` is deliberately NOT Stripe's `current_period_end`. Stripe
 * advances the period at the renewal moment, before the charge clears: a real
 * test-clock capture shows the period jumping a month forward while the invoice
 * is still unpaid, and staying there after it fails. Using that value would
 * grant a full month to someone who paid nothing. This column advances only
 * when a period is actually paid, and `dunning_grace_until` carries the bounded
 * extension that keeps a recoverable visitor reading during retries.
 *
 * Deliberately DDL-only, with no backfill. The deploy preflight blocks any
 * `UPDATE` as a data rewrite, and that guard is worth keeping: migrations add
 * shape, and populating rows is a separate, reviewable act.
 *
 * `paid_through_at` is instead populated by
 * `scripts/reconcile-stripe-visitor-profiles.ts`, which derives it from Stripe
 * rather than copying a legacy column. That is better provenance anyway --
 * `membership_expiration` and `subscription_renews_at` are themselves written
 * by the code path this change exists to replace, so trusting them would carry
 * any drift forward. Run the reconcile script right after deploying: until it
 * runs, a subscribed profile has no paid-through date and is not entitled.
 *
 * `dunning_grace_until` needs no backfill at all -- no existing row can be
 * mid-dunning, because the old code revoked instead of granting grace.
 *
 * Both columns are nullable and additive; the legacy columns are left in place
 * and are dropped by a separate migration once this is proven on the host.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(
    sql.raw(`
      ALTER TABLE "visitor_profiles"
        ADD COLUMN IF NOT EXISTS "paid_through_at" timestamp(3) with time zone;

      ALTER TABLE "visitor_profiles"
        ADD COLUMN IF NOT EXISTS "dunning_grace_until" timestamp(3) with time zone;

      CREATE INDEX IF NOT EXISTS "visitor_profiles_paid_through_at_idx"
        ON "visitor_profiles" USING btree ("paid_through_at");
    `),
  )
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(
    sql.raw(`
      DROP INDEX IF EXISTS "visitor_profiles_paid_through_at_idx";

      ALTER TABLE "visitor_profiles"
        DROP COLUMN IF EXISTS "dunning_grace_until";

      ALTER TABLE "visitor_profiles"
        DROP COLUMN IF EXISTS "paid_through_at";
    `),
  )
}
