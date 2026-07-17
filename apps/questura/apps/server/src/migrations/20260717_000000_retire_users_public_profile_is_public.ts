import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

// Byline implies visibility: the public authors route never read this flag,
// and author-page visibility is now derived from published work. Retire the
// column instead of leaving a dead control.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(
    sql.raw(`ALTER TABLE "users" DROP COLUMN IF EXISTS "public_profile_is_public";`),
  )
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(
    sql.raw(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "public_profile_is_public" boolean DEFAULT false;`,
    ),
  )
}
