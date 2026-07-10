import { getDb } from "@server/shared/db/client";

export function isInstagramMediaRejected(embedId: number, mediaKey: string): boolean {
  return !!getDb().query(`
    SELECT 1 FROM rejected_instagram_media
    WHERE instagram_embed_id = $embedId AND media_key = $mediaKey
  `).get({ $embedId: embedId, $mediaKey: mediaKey });
}

export function rejectInstagramMedia(embedId: number, mediaKey: string, sourcePosition: number): void {
  getDb().query(`
    INSERT OR IGNORE INTO rejected_instagram_media (instagram_embed_id, media_key, source_position)
    VALUES ($embedId, $mediaKey, $sourcePosition)
  `).run({ $embedId: embedId, $mediaKey: mediaKey, $sourcePosition: sourcePosition });
}
