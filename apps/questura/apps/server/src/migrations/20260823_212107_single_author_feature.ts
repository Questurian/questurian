import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "location_homepages_blocks_author_feature" ALTER COLUMN "image_style" SET DEFAULT 'portrait';
  ALTER TABLE "location_homepages_blocks_author_feature_author_cards" ALTER COLUMN "is_emphasized" SET DEFAULT false;`)
}

export async function down({ db, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "location_homepages_blocks_author_feature_author_cards" ALTER COLUMN "is_emphasized" SET DEFAULT false;
  ALTER TABLE "location_homepages_blocks_author_feature" ALTER COLUMN "image_style" SET DEFAULT 'mixed';`)
}
