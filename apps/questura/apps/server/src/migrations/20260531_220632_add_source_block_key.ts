import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

const blockTables = [
  'location_homepages_blocks_featured_article',
  'location_homepages_blocks_featured_article_carousel',
  'location_homepages_blocks_featured_articles',
  'location_homepages_blocks_article_grid',
  'location_homepages_blocks_location_grid',
  'location_homepages_blocks_questurian_maps',
  'location_homepages_blocks_hotel_grid',
  'location_homepages_blocks_tour_grid',
  'location_homepages_blocks_where_to_eat_drink',
  'location_homepages_blocks_things_to_do_listicles',
  'location_homepages_blocks_things_to_do_attractions',
  'location_homepages_blocks_newsletter_signup',
  'location_homepages_blocks_article_list',
] as const

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const tableName of blockTables) {
    await db.execute(
      sql.raw(`ALTER TABLE "${tableName}" ADD COLUMN IF NOT EXISTS "source_block_key" varchar;`),
    )
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Intentionally left data-preserving.
}
