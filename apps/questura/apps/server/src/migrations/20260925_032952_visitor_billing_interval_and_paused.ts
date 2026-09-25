import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_visitor_profiles_billing_interval" AS ENUM('month', 'year');
  ALTER TYPE "public"."enum_visitor_profiles_subscription_status" ADD VALUE 'paused';
  ALTER TABLE "visitor_profiles" ADD COLUMN "billing_interval" "enum_visitor_profiles_billing_interval";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "visitor_profiles" ALTER COLUMN "subscription_status" SET DATA TYPE text;
  ALTER TABLE "visitor_profiles" ALTER COLUMN "subscription_status" SET DEFAULT 'none'::text;
  DROP TYPE "public"."enum_visitor_profiles_subscription_status";
  CREATE TYPE "public"."enum_visitor_profiles_subscription_status" AS ENUM('none', 'active', 'cancelled', 'past_due');
  ALTER TABLE "visitor_profiles" ALTER COLUMN "subscription_status" SET DEFAULT 'none'::"public"."enum_visitor_profiles_subscription_status";
  ALTER TABLE "visitor_profiles" ALTER COLUMN "subscription_status" SET DATA TYPE "public"."enum_visitor_profiles_subscription_status" USING "subscription_status"::"public"."enum_visitor_profiles_subscription_status";
  ALTER TABLE "visitor_profiles" DROP COLUMN "billing_interval";
  DROP TYPE "public"."enum_visitor_profiles_billing_interval";`)
}
