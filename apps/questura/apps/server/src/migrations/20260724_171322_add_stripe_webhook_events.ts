import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS "stripe_webhook_events" (
      "id" serial PRIMARY KEY NOT NULL,
      "event_id" varchar NOT NULL,
      "event_type" varchar NOT NULL,
      "event_created" numeric NOT NULL,
      "subscription_id" varchar,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS "stripe_webhook_events_event_id_idx" ON "stripe_webhook_events" USING btree ("event_id");
    CREATE INDEX IF NOT EXISTS "stripe_webhook_events_event_created_idx" ON "stripe_webhook_events" USING btree ("event_created");
    CREATE INDEX IF NOT EXISTS "stripe_webhook_events_subscription_id_idx" ON "stripe_webhook_events" USING btree ("subscription_id");
    CREATE INDEX IF NOT EXISTS "stripe_webhook_events_updated_at_idx" ON "stripe_webhook_events" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "stripe_webhook_events_created_at_idx" ON "stripe_webhook_events" USING btree ("created_at");

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "stripe_webhook_events_id" integer;

    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels"
        ADD CONSTRAINT "payload_locked_documents_rels_stripe_webhook_events_fk"
        FOREIGN KEY ("stripe_webhook_events_id")
        REFERENCES "public"."stripe_webhook_events"("id")
        ON DELETE cascade
        ON UPDATE no action;
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_stripe_webhook_events_id_idx" ON "payload_locked_documents_rels" USING btree ("stripe_webhook_events_id");
  `))
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql.raw(`
    DROP INDEX IF EXISTS "payload_locked_documents_rels_stripe_webhook_events_id_idx";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "stripe_webhook_events_id";
    DROP TABLE IF EXISTS "stripe_webhook_events";
  `))
}
