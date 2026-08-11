import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * Machine identity gets its own collection (ADR-0006).
 *
 * No email, no password, no role: `disableLocalStrategy` means the only
 * credential is an API key. `api_key_index` is the HMAC Payload actually
 * queries on; `api_key` holds the encrypted key.
 *
 * Additive. The Location Manager keeps authenticating as a `users` row until
 * its client is switched over, which is a separate change.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(
    sql.raw(`
      CREATE TABLE IF NOT EXISTS "service_accounts" (
        "id" serial PRIMARY KEY NOT NULL,
        "name" varchar NOT NULL,
        "description" varchar,
        "enable_a_p_i_key" boolean,
        "api_key" varchar,
        "api_key_index" varchar,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
      );
    `),
  )

  await db.execute(
    sql.raw(`CREATE UNIQUE INDEX IF NOT EXISTS "service_accounts_name_idx" ON "service_accounts" ("name");`),
  )
  await db.execute(
    sql.raw(
      `CREATE INDEX IF NOT EXISTS "service_accounts_updated_at_idx" ON "service_accounts" ("updated_at");`,
    ),
  )
  await db.execute(
    sql.raw(
      `CREATE INDEX IF NOT EXISTS "service_accounts_created_at_idx" ON "service_accounts" ("created_at");`,
    ),
  )

  // Document locking keeps one FK column per lockable collection; without it
  // every admin edit fails on a missing column.
  await db.execute(
    sql.raw(`
      ALTER TABLE "payload_locked_documents_rels"
        ADD COLUMN IF NOT EXISTS "service_accounts_id" integer;

      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.table_constraints
          WHERE constraint_schema = 'public'
            AND constraint_name = 'payload_locked_documents_rels_service_accounts_fk'
        ) THEN
          ALTER TABLE "payload_locked_documents_rels"
            ADD CONSTRAINT "payload_locked_documents_rels_service_accounts_fk"
            FOREIGN KEY ("service_accounts_id")
            REFERENCES "public"."service_accounts"("id")
            ON DELETE cascade
            ON UPDATE no action;
        END IF;
      END $$;

      CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_service_accounts_id_idx"
        ON "payload_locked_documents_rels" USING btree ("service_accounts_id");
    `),
  )
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(
    sql.raw(`
      DROP INDEX IF EXISTS "payload_locked_documents_rels_service_accounts_id_idx";
      ALTER TABLE "payload_locked_documents_rels"
        DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_service_accounts_fk",
        DROP COLUMN IF EXISTS "service_accounts_id";
    `),
  )
  await db.execute(sql.raw(`DROP TABLE IF EXISTS "service_accounts";`))
}
