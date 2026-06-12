import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

const relsTables = ['listicle_itineraries_rels', 'single_type_listicles_rels'] as const

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const tableName of relsTables) {
    await db.execute(
      sql.raw(`
        ALTER TABLE "${tableName}" ADD COLUMN IF NOT EXISTS "tours_id" integer;

        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1
            FROM information_schema.table_constraints
            WHERE constraint_schema = 'public'
              AND constraint_name = '${tableName}_tours_fk'
          ) THEN
            ALTER TABLE "${tableName}"
              ADD CONSTRAINT "${tableName}_tours_fk"
              FOREIGN KEY ("tours_id") REFERENCES "public"."tours"("id")
              ON DELETE cascade ON UPDATE no action;
          END IF;
        END $$;

        CREATE INDEX IF NOT EXISTS "${tableName}_tours_id_idx"
          ON "${tableName}" USING btree ("tours_id");
      `),
    )
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Intentionally left data-preserving.
}
