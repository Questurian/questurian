import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(
    sql.raw(`ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "source_feature" varchar;`),
  )
  await db.execute(
    sql.raw(`ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "source_run_id" varchar;`),
  )
  await db.execute(
    sql.raw(
      `CREATE INDEX IF NOT EXISTS "articles_source_feature_idx" ON "articles" ("source_feature");`,
    ),
  )
  await db.execute(
    sql.raw(
      `CREATE INDEX IF NOT EXISTS "articles_source_run_id_idx" ON "articles" ("source_run_id");`,
    ),
  )
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql.raw(`DROP INDEX IF EXISTS "articles_source_feature_idx";`))
  await db.execute(sql.raw(`DROP INDEX IF EXISTS "articles_source_run_id_idx";`))
  await db.execute(sql.raw(`ALTER TABLE "articles" DROP COLUMN IF EXISTS "source_feature";`))
  await db.execute(sql.raw(`ALTER TABLE "articles" DROP COLUMN IF EXISTS "source_run_id";`))
}
