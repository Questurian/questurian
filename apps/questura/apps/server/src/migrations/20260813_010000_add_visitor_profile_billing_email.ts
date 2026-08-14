import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * Adds `visitor_profiles.billing_email`.
 *
 * Checkout no longer requires a verified email (see the comment in
 * `app/api/payments/create-checkout-session/route.ts`): the verification wall
 * cost the sale at peak intent to guard against a rare mistyped signup
 * address. Stripe collects its own email during checkout and the payment
 * confirms the customer actually reached it, which makes that address the
 * better fallback contact when the account address is wrong.
 *
 * `handleCheckoutSessionCompleted` writes this column only when the Stripe
 * address differs from the account address, so a populated value is exactly
 * the "signup email may be mistyped" signal — queryable from the admin UI.
 *
 * Nullable and additive: existing rows keep working untouched.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(
    sql.raw(`
      ALTER TABLE "visitor_profiles"
        ADD COLUMN IF NOT EXISTS "billing_email" varchar;

      CREATE INDEX IF NOT EXISTS "visitor_profiles_billing_email_idx"
        ON "visitor_profiles" USING btree ("billing_email");
    `),
  )
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(
    sql.raw(`
      DROP INDEX IF EXISTS "visitor_profiles_billing_email_idx";
      ALTER TABLE "visitor_profiles"
        DROP COLUMN IF EXISTS "billing_email";
    `),
  )
}
