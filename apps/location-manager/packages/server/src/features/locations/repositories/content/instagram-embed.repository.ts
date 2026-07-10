import { getDb } from "@server/shared/db/client";
import type { InstagramEmbed } from "../../models/location";
import { CURRENT_INSTAGRAM_MEDIA_STAGING_VERSION } from "@questurian/lm-shared";

/**
 * Database row interface for instagram_embeds table
 */
interface InstagramEmbedDbRow {
  id: number;
  location_id: number;
  username: string;
  url: string;
  post_identity: string;
  embed_code: string;
  instagram: string | null;
  images: string | null;
  original_image_urls: string | null;
  media_staging_status: string | null;
  media_staging_error: string | null;
  media_item_count: number | null;
  staged_item_count: number | null;
  media_staging_version: number | null;
  created_at: string;
}

function mapRow(row: InstagramEmbedDbRow): InstagramEmbed {
  const { instagram: _ignored, images, original_image_urls, ...rest } = row;
  return {
    ...rest,
    images: images ? JSON.parse(images) : [],
    original_image_urls: original_image_urls ? JSON.parse(original_image_urls) : [],
  } as InstagramEmbed;
}

const SELECT_INSTAGRAM_COLUMNS = `
  id, entity_id as location_id, username, url, post_identity, embed_code, instagram, images,
  original_image_urls, media_staging_status, media_staging_error,
  media_item_count, staged_item_count, media_staging_version, created_at
`;

export function saveInstagramEmbed(embed: InstagramEmbed): number | boolean {
  try {
    const db = getDb();

    if (embed.id) {
      // Update existing embed
      const query = db.query(`
        UPDATE instagram_embeds
        SET username = $username,
            url = $url,
            post_identity = $post_identity,
            embed_code = $embed_code,
            instagram = $instagram,
            images = $images,
            original_image_urls = $original_image_urls,
            media_staging_status = $media_staging_status,
            media_staging_error = $media_staging_error,
            media_item_count = $media_item_count,
            staged_item_count = $staged_item_count,
            media_staging_version = $media_staging_version
        WHERE id = $id
      `);

      query.run({
        $id: embed.id,
        $username: embed.username,
        $url: embed.url,
        $post_identity: embed.post_identity ?? `url:${embed.url}`,
        $embed_code: embed.embed_code,
        $instagram: embed.instagram || null,
        $images: embed.images ? JSON.stringify(embed.images) : null,
        $original_image_urls: embed.original_image_urls ? JSON.stringify(embed.original_image_urls) : null,
        $media_staging_status: embed.media_staging_status ?? null,
        $media_staging_error: embed.media_staging_error ?? null,
        $media_item_count: embed.media_item_count ?? null,
        $staged_item_count: embed.staged_item_count ?? null,
        $media_staging_version: embed.media_staging_version ?? null,
      });

      return embed.id;
    } else {
      // Insert new embed
      const insertSql = `
        INSERT INTO instagram_embeds (
          entity_id, username, url, post_identity, embed_code, instagram, images, original_image_urls,
          media_staging_status, media_staging_error, media_item_count, staged_item_count, media_staging_version
        ) VALUES (
          $location_id, $username, $url, $post_identity, $embed_code, $instagram, $images, $original_image_urls,
          $media_staging_status, $media_staging_error, $media_item_count, $staged_item_count, $media_staging_version
        )
      `;
      db.query(insertSql).run({
        $location_id: embed.location_id,
        $username: embed.username,
        $url: embed.url,
        $post_identity: embed.post_identity ?? `url:${embed.url}`,
        $embed_code: embed.embed_code,
        $instagram: embed.instagram || null,
        $images: embed.images ? JSON.stringify(embed.images) : null,
        $original_image_urls: embed.original_image_urls ? JSON.stringify(embed.original_image_urls) : null,
        $media_staging_status: embed.media_staging_status ?? null,
        $media_staging_error: embed.media_staging_error ?? null,
        $media_item_count: embed.media_item_count ?? null,
        $staged_item_count: embed.staged_item_count ?? null,
        $media_staging_version: embed.media_staging_version ?? null,
      });

      const result = db.query("SELECT last_insert_rowid() as id").get() as { id: number };
      return result.id;
    }
  } catch (error) {
    console.error("Error saving Instagram embed to DB:", error);
    return false;
  }
}

export function getInstagramEmbedById(id: number): InstagramEmbed | null {
  const db = getDb();
  const query = db.query(`
    SELECT ${SELECT_INSTAGRAM_COLUMNS}
    FROM instagram_embeds
    WHERE id = $id
  `);
  const row = query.get({ $id: id }) as InstagramEmbedDbRow | undefined;
  if (!row) return null;
  return mapRow(row);
}

export function getInstagramEmbedsByLocationId(locationId: number): InstagramEmbed[] {
  const db = getDb();
  const query = db.query(`
    SELECT ${SELECT_INSTAGRAM_COLUMNS}
    FROM instagram_embeds
    WHERE entity_id = $locationId
    ORDER BY created_at DESC
  `);
  const rows = query.all({ $locationId: locationId }) as InstagramEmbedDbRow[];
  return rows.map(mapRow);
}

/**
 * Efficiently fetch instagram embeds for multiple location IDs
 * Returns a Map of location_id -> InstagramEmbed[] for O(1) lookup
 * This prevents N+1 query problems when fetching multiple locations
 */
export function getInstagramEmbedsByLocationIds(locationIds: number[]): Map<number, InstagramEmbed[]> {
  if (locationIds.length === 0) {
    return new Map();
  }

  const db = getDb();
  const placeholders = locationIds.map(() => '?').join(',');
  const query = db.query(`
    SELECT ${SELECT_INSTAGRAM_COLUMNS}
    FROM instagram_embeds
    WHERE entity_id IN (${placeholders})
    ORDER BY created_at DESC
  `);

  const rows = query.all(...locationIds) as InstagramEmbedDbRow[];
  const embedsByLocation = new Map<number, InstagramEmbed[]>();

  // Group embeds by location_id
  rows.forEach((row) => {
    const embed = mapRow(row);
    const locationId = embed.location_id!;
    if (!embedsByLocation.has(locationId)) {
      embedsByLocation.set(locationId, []);
    }
    embedsByLocation.get(locationId)!.push(embed);
  });

  return embedsByLocation;
}

export function getInstagramEmbedByLocationAndIdentity(locationId: number, identity: string): InstagramEmbed | null {
  const db = getDb();
  const row = db.query(`
    SELECT ${SELECT_INSTAGRAM_COLUMNS}
    FROM instagram_embeds
    WHERE entity_id = $locationId AND post_identity = $identity
  `).get({ $locationId: locationId, $identity: identity }) as InstagramEmbedDbRow | undefined;
  return row ? mapRow(row) : null;
}

export function getInstagramEmbedsForBackfill(): InstagramEmbed[] {
  const db = getDb();
  const rows = db.query(`
    SELECT ${SELECT_INSTAGRAM_COLUMNS}
    FROM instagram_embeds
    WHERE media_staging_version IS NULL OR media_staging_version < $version
       OR media_staging_status IS NULL
       OR media_staging_status IN ('pending', 'processing')
    ORDER BY id
  `).all({ $version: CURRENT_INSTAGRAM_MEDIA_STAGING_VERSION }) as InstagramEmbedDbRow[];
  return rows.map(mapRow);
}

export function deleteInstagramEmbedById(id: number): boolean {
  try {
    const db = getDb();
    const query = db.query("DELETE FROM instagram_embeds WHERE id = $id");
    query.run({ $id: id });
    return true;
  } catch (error) {
    console.error("Error deleting Instagram embed:", error);
    return false;
  }
}
