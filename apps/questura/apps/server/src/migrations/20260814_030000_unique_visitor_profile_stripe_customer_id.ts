import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * Makes `visitor_profiles.stripe_customer_id` unique.
 *
 * Subscription webhooks resolve a profile from the Stripe customer id alone
 * (`findVisitorProfileByStripeCustomerId`, a `limit: 1` query with no
 * ordering). A second profile carrying the same customer id therefore makes
 * that lookup a coin toss: one person's payment could grant — or one person's
 * cancellation revoke — another person's membership, and the customer portal
 * would show them each other's cards and invoices.
 *
 * Application code no longer links a customer it cannot prove the visitor owns
 * (`payments/lib/customer-linkage.ts`), but only the database can refuse the
 * second row. Postgres permits any number of NULLs under a unique index, so
 * visitors who have never reached Stripe are unaffected.
 *
 * Additive on purpose. The natural form of this change — drop the plain index,
 * recreate it unique — trips the `DROP` guard in
 * `scripts/deploy/check-pending-migrations.mjs` and blocks every deploy until
 * someone applies it by hand on the host. Dropping an index destroys no data,
 * so the guard is a false positive here, but a second index on a table this
 * small is cheaper than the manual procedure. The existing
 * `visitor_profiles_stripe_customer_id_idx` stays; this adds the constraint
 * beside it under its own name.
 *
 * It will refuse to build if duplicates already exist, which is the point —
 * check with:
 *
 *   SELECT stripe_customer_id, count(*) FROM visitor_profiles
 *   WHERE stripe_customer_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1;
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(
    sql.raw(`
      CREATE UNIQUE INDEX IF NOT EXISTS "visitor_profiles_stripe_customer_id_unique_idx"
        ON "visitor_profiles" USING btree ("stripe_customer_id");
    `),
  )
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(
    sql.raw(`
      DROP INDEX IF EXISTS "visitor_profiles_stripe_customer_id_unique_idx";
    `),
  )
}
