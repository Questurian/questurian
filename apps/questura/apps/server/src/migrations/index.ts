import * as migration_20260514000000_promote_location_cover_image from './20260514000000_promote_location_cover_image'
import * as migration_20260514001000_drop_location_guide_storage from './20260514001000_drop_location_guide_storage'
import * as migration_20260515000000_media_set_source_focal_point from './20260515000000_media_set_source_focal_point'
import * as migration_20260528000000_itinerary_angle_and_list_tone from './20260528000000_itinerary_angle_and_list_tone'
import * as migration_20260529000000_better_auth_visitor_tables from './20260529000000_better_auth_visitor_tables'
import * as migration_20260531_003454_curated_homepage_draft_published_snapshots from './20260531_003454_curated_homepage_draft_published_snapshots'
import * as migration_20260531_005708_main_homepage_global from './20260531_005708_main_homepage_global'
import * as migration_20260531_220632_add_source_block_key from './20260531_220632_add_source_block_key'
import * as migration_20260601_103652_visitor_profiles_payload_schema from './20260601_103652_visitor_profiles_payload_schema'
import * as migration_20260612_023018_add_tour_picks_to_listicle_blocks from './20260612_023018_add_tour_picks_to_listicle_blocks'
import * as migration_20260703_132643_add_itinerary_tour_agency_block_storage from './20260703_132643_add_itinerary_tour_agency_block_storage'
import * as migration_20260704_000000_add_article_source_fields from './20260704_000000_add_article_source_fields'
import * as migration_20260708_060450_reference_grid_registry_cleanup from './20260708_060450_reference_grid_registry_cleanup'
import * as migration_20260711_000000_add_users_author_slug from './20260711_000000_add_users_author_slug'
import * as migration_20260717_000000_retire_users_public_profile_is_public from './20260717_000000_retire_users_public_profile_is_public'
import * as migration_20260717_010000_add_users_social_link_platforms from './20260717_010000_add_users_social_link_platforms'
import * as migration_20260717_020000_add_email_logs from './20260717_020000_add_email_logs'
import * as migration_20260723_060311_add_itinerary_stop_moments from './20260723_060311_add_itinerary_stop_moments'
import * as migration_20260723_180417_add_itinerary_moment_options from './20260723_180417_add_itinerary_moment_options'
import * as migration_20260724_171322_add_stripe_webhook_events from './20260724_171322_add_stripe_webhook_events'
import * as migration_20260811_000000_add_users_status from './20260811_000000_add_users_status'
import * as migration_20260811_010000_add_authors from './20260811_010000_add_authors'
import * as migration_20260811_020000_repoint_bylines_to_authors from './20260811_020000_repoint_bylines_to_authors'
import * as migration_20260811_030000_retire_users_public_profile from './20260811_030000_retire_users_public_profile'

export const migrations = [
  {
    up: migration_20260514000000_promote_location_cover_image.up,
    down: migration_20260514000000_promote_location_cover_image.down,
    name: '20260514000000_promote_location_cover_image',
  },
  {
    up: migration_20260514001000_drop_location_guide_storage.up,
    down: migration_20260514001000_drop_location_guide_storage.down,
    name: '20260514001000_drop_location_guide_storage',
  },
  {
    up: migration_20260515000000_media_set_source_focal_point.up,
    down: migration_20260515000000_media_set_source_focal_point.down,
    name: '20260515000000_media_set_source_focal_point',
  },
  {
    up: migration_20260528000000_itinerary_angle_and_list_tone.up,
    down: migration_20260528000000_itinerary_angle_and_list_tone.down,
    name: '20260528000000_itinerary_angle_and_list_tone',
  },
  {
    up: migration_20260529000000_better_auth_visitor_tables.up,
    down: migration_20260529000000_better_auth_visitor_tables.down,
    name: '20260529000000_better_auth_visitor_tables',
  },
  {
    up: migration_20260531_003454_curated_homepage_draft_published_snapshots.up,
    down: migration_20260531_003454_curated_homepage_draft_published_snapshots.down,
    name: '20260531_003454_curated_homepage_draft_published_snapshots',
  },
  {
    up: migration_20260531_005708_main_homepage_global.up,
    down: migration_20260531_005708_main_homepage_global.down,
    name: '20260531_005708_main_homepage_global',
  },
  {
    up: migration_20260531_220632_add_source_block_key.up,
    down: migration_20260531_220632_add_source_block_key.down,
    name: '20260531_220632_add_source_block_key',
  },
  {
    up: migration_20260601_103652_visitor_profiles_payload_schema.up,
    down: migration_20260601_103652_visitor_profiles_payload_schema.down,
    name: '20260601_103652_visitor_profiles_payload_schema',
  },
  {
    up: migration_20260612_023018_add_tour_picks_to_listicle_blocks.up,
    down: migration_20260612_023018_add_tour_picks_to_listicle_blocks.down,
    name: '20260612_023018_add_tour_picks_to_listicle_blocks',
  },
  {
    up: migration_20260703_132643_add_itinerary_tour_agency_block_storage.up,
    down: migration_20260703_132643_add_itinerary_tour_agency_block_storage.down,
    name: '20260703_132643_add_itinerary_tour_agency_block_storage',
  },
  {
    up: migration_20260704_000000_add_article_source_fields.up,
    down: migration_20260704_000000_add_article_source_fields.down,
    name: '20260704_000000_add_article_source_fields',
  },
  {
    up: migration_20260708_060450_reference_grid_registry_cleanup.up,
    down: migration_20260708_060450_reference_grid_registry_cleanup.down,
    name: '20260708_060450_reference_grid_registry_cleanup',
  },
  {
    up: migration_20260711_000000_add_users_author_slug.up,
    down: migration_20260711_000000_add_users_author_slug.down,
    name: '20260711_000000_add_users_author_slug',
  },
  {
    up: migration_20260717_000000_retire_users_public_profile_is_public.up,
    down: migration_20260717_000000_retire_users_public_profile_is_public.down,
    name: '20260717_000000_retire_users_public_profile_is_public',
  },
  {
    up: migration_20260717_010000_add_users_social_link_platforms.up,
    down: migration_20260717_010000_add_users_social_link_platforms.down,
    name: '20260717_010000_add_users_social_link_platforms',
  },
  {
    up: migration_20260717_020000_add_email_logs.up,
    down: migration_20260717_020000_add_email_logs.down,
    name: '20260717_020000_add_email_logs',
  },
  {
    up: migration_20260723_060311_add_itinerary_stop_moments.up,
    down: migration_20260723_060311_add_itinerary_stop_moments.down,
    name: '20260723_060311_add_itinerary_stop_moments',
  },
  {
    up: migration_20260723_180417_add_itinerary_moment_options.up,
    down: migration_20260723_180417_add_itinerary_moment_options.down,
    name: '20260723_180417_add_itinerary_moment_options',
  },
  {
    up: migration_20260724_171322_add_stripe_webhook_events.up,
    down: migration_20260724_171322_add_stripe_webhook_events.down,
    name: '20260724_171322_add_stripe_webhook_events',
  },
  {
    up: migration_20260811_000000_add_users_status.up,
    down: migration_20260811_000000_add_users_status.down,
    name: '20260811_000000_add_users_status',
  },
  {
    up: migration_20260811_010000_add_authors.up,
    down: migration_20260811_010000_add_authors.down,
    name: '20260811_010000_add_authors',
  },
  {
    up: migration_20260811_020000_repoint_bylines_to_authors.up,
    down: migration_20260811_020000_repoint_bylines_to_authors.down,
    name: '20260811_020000_repoint_bylines_to_authors',
  },
  {
    up: migration_20260811_030000_retire_users_public_profile.up,
    down: migration_20260811_030000_retire_users_public_profile.down,
    name: '20260811_030000_retire_users_public_profile',
  },
]
