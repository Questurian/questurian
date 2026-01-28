import { getDb } from "@server/shared/db/client";
import type { InstagramEmbed } from "../../models/location";

/**
 * Database row interface for instagram_embeds table
 */
interface InstagramEmbedDbRow {
  id: number;
  location_id: number;
  username: string;
  url: string;
  embed_code: string;
  instagram: string | null;
  images: string | null;
  original_image_urls: string | null;
  created_at: string;
}

function mapRow(row: InstagramEmbedDbRow): InstagramEmbed {
  const { instagram: _ignored, images, original_image_urls, ...rest } = row;
  return {
    ...rest,
    images: images ? JSON.parse(images) : [],
    original_image_urls: original_image_urls ? JSON.parse(original_image_urls) : [],
  };
}

export function saveInstagramEmbed(embed: InstagramEmbed): number | boolean {
  try {
    const db = getDb();

    if (embed.id) {
      // Update existing embed
      const query = db.query(`
        UPDATE instagram_embeds
        SET username = $username,
            url = $url,
            embed_code = $embed_code,
            instagram = $instagram,
            images = $images,
            original_image_urls = $original_image_urls
        WHERE id = $id
      `);

      query.run({
        $id: embed.id,
        $username: embed.username,
        $url: embed.url,
        $embed_code: embed.embed_code,
        $instagram: embed.instagram || null,
        $images: embed.images ? JSON.stringify(embed.images) : null,
        $original_image_urls: embed.original_image_urls ? JSON.stringify(embed.original_image_urls) : null,
      });

      return embed.id;
    } else {
      // Insert new embed
      const query = db.query(`
        INSERT INTO instagram_embeds (location_id, username, url, embed_code, instagram, images, original_image_urls)
        VALUES ($location_id, $username, $url, $embed_code, $instagram, $images, $original_image_urls)
      `);

      query.run({
        $location_id: embed.location_id,
        $username: embed.username,
        $url: embed.url,
        $embed_code: embed.embed_code,
        $instagram: embed.instagram || null,
        $images: embed.images ? JSON.stringify(embed.images) : null,
        $original_image_urls: embed.original_image_urls ? JSON.stringify(embed.original_image_urls) : null,
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
    SELECT id, location_id, username, url, embed_code, instagram, images, original_image_urls, created_at
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
    SELECT id, location_id, username, url, embed_code, instagram, images, original_image_urls, created_at
    FROM instagram_embeds
    WHERE location_id = $locationId
    ORDER BY created_at DESC
  `);
  const rows = query.all({ $locationId: locationId }) as InstagramEmbedDbRow[];
  return rows.map(mapRow);
}

export function getAllInstagramEmbeds(): InstagramEmbed[] {
  const db = getDb();
  const query = db.query(`
    SELECT id, location_id, username, url, embed_code, instagram, images, original_image_urls, created_at
    FROM instagram_embeds
    ORDER BY created_at DESC
  `);
  const rows = query.all() as InstagramEmbedDbRow[];
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
    SELECT id, location_id, username, url, embed_code, instagram, images, original_image_urls, created_at
    FROM instagram_embeds
    WHERE location_id IN (${placeholders})
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
