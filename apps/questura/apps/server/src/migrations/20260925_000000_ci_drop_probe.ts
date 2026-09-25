import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// THROWAWAY: proves the migration-safety check turns a PR red. Never merged.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`DROP TABLE "bookmarks";`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {}
