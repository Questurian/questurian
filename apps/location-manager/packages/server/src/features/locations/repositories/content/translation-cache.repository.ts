import { getDb } from "@server/shared/db/client";
import { TRANSLATOR_VERSION } from "../../constants/translate-merge-reviews.constants";
import type { ReviewSource } from "../../types/translate-merge-reviews.types";

export interface TranslationCacheKey {
  source: ReviewSource;
  reviewId: string;
}

export interface CachedTranslation {
  source: ReviewSource;
  reviewId: string;
  originalLanguage: string | null;
  translatedText: string | null;
  translatedTitle: string | null;
}

export interface TranslationCacheUpsert extends CachedTranslation {
  locationId: number;
}

interface TranslationRow {
  source: ReviewSource;
  review_id: string;
  original_language: string | null;
  translated_text: string | null;
  translated_title: string | null;
}

export function lookupTranslations(
  keys: TranslationCacheKey[]
): Map<string, CachedTranslation> {
  const hits = new Map<string, CachedTranslation>();
  if (keys.length === 0) {
    return hits;
  }

  const db = getDb();
  const placeholders = keys.map(() => "(?, ?)").join(", ");
  const params: (string | number)[] = [];
  for (const key of keys) {
    params.push(key.source, key.reviewId);
  }
  params.push(TRANSLATOR_VERSION);

  const rows = db
    .query(
      `SELECT source, review_id, original_language, translated_text, translated_title
       FROM translations
       WHERE (source, review_id) IN (VALUES ${placeholders})
         AND translator_version = ?`
    )
    .all(...params) as TranslationRow[];

  for (const row of rows) {
    hits.set(cacheKey(row.source, row.review_id), {
      source: row.source,
      reviewId: row.review_id,
      originalLanguage: row.original_language,
      translatedText: row.translated_text,
      translatedTitle: row.translated_title,
    });
  }

  return hits;
}

export function upsertTranslations(entries: TranslationCacheUpsert[]): void {
  if (entries.length === 0) {
    return;
  }

  const db = getDb();
  const insert = db.prepare(
    `INSERT INTO translations
       (source, review_id, location_id, translator_version, original_language, translated_text, translated_title)
     VALUES ($source, $review_id, $location_id, $translator_version, $original_language, $translated_text, $translated_title)
     ON CONFLICT(source, review_id, translator_version) DO UPDATE SET
       location_id = excluded.location_id,
       original_language = excluded.original_language,
       translated_text = excluded.translated_text,
       translated_title = excluded.translated_title,
       translated_at = CURRENT_TIMESTAMP`
  );

  const tx = db.transaction((rows: TranslationCacheUpsert[]) => {
    for (const row of rows) {
      insert.run({
        $source: row.source,
        $review_id: row.reviewId,
        $location_id: row.locationId,
        $translator_version: TRANSLATOR_VERSION,
        $original_language: row.originalLanguage,
        $translated_text: row.translatedText,
        $translated_title: row.translatedTitle,
      });
    }
  });

  tx(entries);
}

export function cacheKey(source: ReviewSource, reviewId: string): string {
  return `${source}:${reviewId}`;
}
