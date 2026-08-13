import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * Completes 20260811_040000_add_service_accounts.
 *
 * That migration added `service_accounts_id` to `payload_locked_documents_rels`
 * but not to `payload_preferences_rels`. Payload builds one FK column per
 * auth-enabled collection on *both* rels tables, so admin dashboard loads —
 * which read `payload_preferences` for the current user — died with
 * `column ...service_accounts_id does not exist` (42703) the moment
 * ServiceAccounts became an auth collection.
 *
 * The failure surfaces only after a successful login, which makes it read like
 * a credentials problem. It is not.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(
    sql.raw(`
      ALTER TABLE "payload_preferences_rels"
        ADD COLUMN IF NOT EXISTS "service_accounts_id" integer;

      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.table_constraints
          WHERE constraint_schema = 'public'
            AND constraint_name = 'payload_preferences_rels_service_accounts_fk'
        ) THEN
          ALTER TABLE "payload_preferences_rels"
            ADD CONSTRAINT "payload_preferences_rels_service_accounts_fk"
            FOREIGN KEY ("service_accounts_id")
            REFERENCES "public"."service_accounts"("id")
            ON DELETE cascade
            ON UPDATE no action;
        END IF;
      END $$;

      CREATE INDEX IF NOT EXISTS "payload_preferences_rels_service_accounts_id_idx"
        ON "payload_preferences_rels" USING btree ("service_accounts_id");
    `),
  )
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(
    sql.raw(`
      DROP INDEX IF EXISTS "payload_preferences_rels_service_accounts_id_idx";
      ALTER TABLE "payload_preferences_rels"
        DROP CONSTRAINT IF EXISTS "payload_preferences_rels_service_accounts_fk",
        DROP COLUMN IF EXISTS "service_accounts_id";
    `),
  )
}
