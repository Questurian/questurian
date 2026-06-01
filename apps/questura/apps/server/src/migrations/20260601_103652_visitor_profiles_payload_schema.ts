import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_type
        JOIN pg_namespace ON pg_namespace.oid = pg_type.typnamespace
        WHERE pg_namespace.nspname = 'public'
          AND pg_type.typname = 'enum_visitor_profiles_subscription_status'
      ) THEN
        CREATE TYPE "public"."enum_visitor_profiles_subscription_status"
          AS ENUM('none', 'active', 'cancelled', 'past_due');
      END IF;
    END $$;

    CREATE TABLE IF NOT EXISTS "visitor_profiles" (
      "id" serial PRIMARY KEY NOT NULL,
      "auth_user_id" varchar NOT NULL,
      "email" varchar NOT NULL,
      "first_name" varchar,
      "last_name" varchar,
      "subscription_status" "enum_visitor_profiles_subscription_status" DEFAULT 'none' NOT NULL,
      "subscription_renews_at" timestamp(3) with time zone,
      "membership_expiration" timestamp(3) with time zone,
      "cancel_at_period_end" boolean DEFAULT false,
      "stripe_customer_id" varchar,
      "stripe_subscription_id" varchar,
      "affiliate_referral_id" varchar,
      "affiliate_referred_at" timestamp(3) with time zone,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS "visitor_profiles_auth_user_id_idx"
      ON "visitor_profiles" USING btree ("auth_user_id");
    CREATE INDEX IF NOT EXISTS "visitor_profiles_email_idx"
      ON "visitor_profiles" USING btree ("email");
    CREATE INDEX IF NOT EXISTS "visitor_profiles_stripe_customer_id_idx"
      ON "visitor_profiles" USING btree ("stripe_customer_id");
    CREATE INDEX IF NOT EXISTS "visitor_profiles_updated_at_idx"
      ON "visitor_profiles" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "visitor_profiles_created_at_idx"
      ON "visitor_profiles" USING btree ("created_at");

    ALTER TABLE "payload_locked_documents_rels"
      ADD COLUMN IF NOT EXISTS "visitor_profiles_id" integer;

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_schema = 'public'
          AND constraint_name = 'payload_locked_documents_rels_visitor_profiles_fk'
      ) THEN
        ALTER TABLE "payload_locked_documents_rels"
          ADD CONSTRAINT "payload_locked_documents_rels_visitor_profiles_fk"
          FOREIGN KEY ("visitor_profiles_id")
          REFERENCES "public"."visitor_profiles"("id")
          ON DELETE cascade
          ON UPDATE no action;
      END IF;
    END $$;

    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_visitor_profiles_id_idx"
      ON "payload_locked_documents_rels" USING btree ("visitor_profiles_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "payload_locked_documents_rels_visitor_profiles_id_idx";

    ALTER TABLE "payload_locked_documents_rels"
      DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_visitor_profiles_fk",
      DROP COLUMN IF EXISTS "visitor_profiles_id";

    DROP TABLE IF EXISTS "visitor_profiles";
    DROP TYPE IF EXISTS "public"."enum_visitor_profiles_subscription_status";
  `)
}
