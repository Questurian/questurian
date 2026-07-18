import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

// Author profiles gain the remaining public-site social platforms (the icon
// row renders instagram/x/facebook/linkedin/reddit/youtube, plus patreon).
const COLUMNS = [
  'public_profile_social_links_facebook',
  'public_profile_social_links_linkedin',
  'public_profile_social_links_reddit',
  'public_profile_social_links_youtube',
  'public_profile_social_links_patreon',
]

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const column of COLUMNS) {
    await db.execute(
      sql.raw(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "${column}" varchar;`),
    )
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  for (const column of COLUMNS) {
    await db.execute(sql.raw(`ALTER TABLE "users" DROP COLUMN IF EXISTS "${column}";`))
  }
}
