import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

// Delivery log for transactional emails (email-logs collection). The
// collection opts out of document locking, so no payload_locked_documents_rels
// column is needed.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "public"."enum_email_logs_status" AS ENUM('sent', 'failed');
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `)

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "email_logs" (
      "id" serial PRIMARY KEY NOT NULL,
      "email_type" varchar NOT NULL,
      "recipient" varchar NOT NULL,
      "subject" varchar,
      "status" "enum_email_logs_status" NOT NULL,
      "error" varchar,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
  `)

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "email_logs_email_type_idx" ON "email_logs" USING btree ("email_type");
    CREATE INDEX IF NOT EXISTS "email_logs_recipient_idx" ON "email_logs" USING btree ("recipient");
    CREATE INDEX IF NOT EXISTS "email_logs_updated_at_idx" ON "email_logs" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "email_logs_created_at_idx" ON "email_logs" USING btree ("created_at");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS "email_logs";`)
  await db.execute(sql`DROP TYPE IF EXISTS "public"."enum_email_logs_status";`)
}
