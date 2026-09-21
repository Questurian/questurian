import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_refresh_jobs_kind" AS ENUM('revalidate', 'search-index');
  CREATE TYPE "public"."enum_refresh_jobs_status" AS ENUM('pending', 'running', 'done', 'failed');
  CREATE TABLE "refresh_jobs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"kind" "enum_refresh_jobs_kind" NOT NULL,
  	"dedupe_key" varchar NOT NULL,
  	"target" jsonb NOT NULL,
  	"reason" varchar,
  	"status" "enum_refresh_jobs_status" DEFAULT 'pending' NOT NULL,
  	"attempts" numeric DEFAULT 0 NOT NULL,
  	"next_attempt_at" timestamp(3) with time zone NOT NULL,
  	"locked_until" timestamp(3) with time zone,
  	"last_error" varchar,
  	"completed_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "refresh_jobs_id" integer;
  CREATE UNIQUE INDEX "refresh_jobs_dedupe_key_idx" ON "refresh_jobs" USING btree ("dedupe_key");
  CREATE INDEX "refresh_jobs_status_idx" ON "refresh_jobs" USING btree ("status");
  CREATE INDEX "refresh_jobs_next_attempt_at_idx" ON "refresh_jobs" USING btree ("next_attempt_at");
  CREATE INDEX "refresh_jobs_updated_at_idx" ON "refresh_jobs" USING btree ("updated_at");
  CREATE INDEX "refresh_jobs_created_at_idx" ON "refresh_jobs" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_refresh_jobs_fk" FOREIGN KEY ("refresh_jobs_id") REFERENCES "public"."refresh_jobs"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_refresh_jobs_id_idx" ON "payload_locked_documents_rels" USING btree ("refresh_jobs_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "refresh_jobs" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "refresh_jobs" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_refresh_jobs_fk";
  
  DROP INDEX "payload_locked_documents_rels_refresh_jobs_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "refresh_jobs_id";
  DROP TYPE "public"."enum_refresh_jobs_kind";
  DROP TYPE "public"."enum_refresh_jobs_status";`)
}
