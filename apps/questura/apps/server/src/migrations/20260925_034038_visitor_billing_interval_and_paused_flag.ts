import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_visitor_profiles_billing_interval" AS ENUM('month', 'year');
  ALTER TABLE "visitor_profiles" ADD COLUMN "billing_interval" "enum_visitor_profiles_billing_interval";
  ALTER TABLE "visitor_profiles" ADD COLUMN "subscription_paused" boolean DEFAULT false;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "visitor_profiles" DROP COLUMN "billing_interval";
  ALTER TABLE "visitor_profiles" DROP COLUMN "subscription_paused";
  DROP TYPE "public"."enum_visitor_profiles_billing_interval";`)
}
