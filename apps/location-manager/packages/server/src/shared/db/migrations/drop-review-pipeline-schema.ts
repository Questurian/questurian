import type { Database } from "bun:sqlite";

/**
 * Migration (ADR-0005): drop schema artifacts created by the review pipeline.
 *
 * Removes the `translations` cache table and the per-entity reviews tracking
 * columns (`reviews_fetched_at`, `reviews_count`, `reviews_google_count`,
 * `reviews_tripadvisor_count`, `reviews_enabled`). Pre-launch — no data
 * preservation required.
 *
 * Idempotent: each step is gated on existence, so re-running the migration
 * after a successful run is a no-op.
 */
export function dropReviewPipelineSchema(db: Database): void {
  db.run("DROP TABLE IF EXISTS translations");

  const columns = db
    .query("PRAGMA table_info(entities)")
    .all() as Array<{ name: string }>;
  const existing = new Set(columns.map((c) => c.name));

  const toDrop = [
    "reviews_fetched_at",
    "reviews_count",
    "reviews_google_count",
    "reviews_tripadvisor_count",
    "reviews_enabled",
  ];

  if (!toDrop.some((column) => existing.has(column))) {
    return;
  }

  const foreignKeysRow = db
    .query("PRAGMA foreign_keys")
    .get() as { foreign_keys: number } | null;
  const foreignKeysEnabled = foreignKeysRow?.foreign_keys === 1;

  db.run("PRAGMA foreign_keys = OFF");
  db.run("BEGIN TRANSACTION");
  try {
    db.run("DROP TABLE IF EXISTS entities_without_review_pipeline");
    db.run(`
      CREATE TABLE entities_without_review_pipeline (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL CHECK(category IN ('dining', 'accommodations', 'attractions', 'nightlife', 'key_locations')),
        name TEXT NOT NULL,
        title TEXT,
        address TEXT NOT NULL,
        url TEXT NOT NULL,
        lat REAL,
        lng REAL,
        locationKey TEXT,
        district TEXT,
        contactAddress TEXT,
        countryCode TEXT,
        iana_time_id TEXT,
        phoneNumber TEXT,
        website TEXT,
        email TEXT,
        neighborhood_description TEXT,
        slug TEXT UNIQUE,
        place_id TEXT,
        tripadvisor_url TEXT,
        tripadvisor_location_id TEXT,
        payload_location_ref TEXT,
        selected_payload_media_set_ids_json TEXT,
        provenance TEXT,
        pending_suggestions TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(category, name, address)
      )
    `);

    db.run(`
      INSERT INTO entities_without_review_pipeline (
        id, category, name, title, address, url, lat, lng, locationKey, district,
        contactAddress, countryCode, iana_time_id, phoneNumber, website, email,
        neighborhood_description, slug, place_id, tripadvisor_url, tripadvisor_location_id,
        payload_location_ref, selected_payload_media_set_ids_json, provenance, pending_suggestions,
        created_at, updated_at
      )
      SELECT
        id, category, name, title, address, url, lat, lng, locationKey, district,
        contactAddress, countryCode, iana_time_id, phoneNumber, website, email,
        neighborhood_description, slug, place_id, tripadvisor_url, tripadvisor_location_id,
        payload_location_ref, selected_payload_media_set_ids_json, provenance, pending_suggestions,
        created_at, updated_at
      FROM entities
    `);

    db.run("DROP TABLE entities");
    db.run("ALTER TABLE entities_without_review_pipeline RENAME TO entities");
    db.run("CREATE INDEX IF NOT EXISTS idx_entities_category ON entities(category)");
    db.run("CREATE INDEX IF NOT EXISTS idx_entities_location_key ON entities(locationKey)");
    db.run("CREATE INDEX IF NOT EXISTS idx_entities_updated_at ON entities(updated_at)");
    db.run(
      `INSERT OR REPLACE INTO sqlite_sequence(name, seq)
       VALUES ('entities', COALESCE((SELECT MAX(id) FROM entities), 0))`
    );
    db.run("COMMIT");
  } catch (error) {
    db.run("ROLLBACK");
    throw error;
  } finally {
    if (foreignKeysEnabled) {
      db.run("PRAGMA foreign_keys = ON");
    }
  }
}
