import type { Database } from "bun:sqlite";
import { tableExists } from "./database";

export function ensureEntitiesTableAcceptsKeyLocations(db: Database): void {
  if (!tableExists(db, "entities")) return;

  const schemaRow = db
    .query("SELECT sql FROM sqlite_master WHERE type='table' AND name='entities'")
    .get() as { sql: string } | null;
  const sql = schemaRow?.sql ?? "";
  if (sql.includes("'key_locations'")) {
    return;
  }

  db.run("PRAGMA foreign_keys = OFF");
  db.run("BEGIN TRANSACTION");
  try {
    db.run(`
      CREATE TABLE entities_new (
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
        reviews_fetched_at TEXT,
        reviews_count INTEGER,
        reviews_google_count INTEGER,
        reviews_tripadvisor_count INTEGER,
        reviews_enabled INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(category, name, address)
      )
    `);

    db.run(`
      INSERT INTO entities_new (
        id, category, name, title, address, url, lat, lng, locationKey, district,
        contactAddress, countryCode, iana_time_id, phoneNumber, website, email,
        neighborhood_description, slug, place_id, tripadvisor_url, tripadvisor_location_id,
        payload_location_ref, reviews_fetched_at, reviews_count, reviews_google_count,
        reviews_tripadvisor_count, reviews_enabled, created_at, updated_at
      )
      SELECT
        id, category, name, title, address, url, lat, lng, locationKey, district,
        contactAddress, countryCode, iana_time_id, phoneNumber, website, email,
        neighborhood_description, slug, place_id, tripadvisor_url, tripadvisor_location_id,
        payload_location_ref, reviews_fetched_at, reviews_count, reviews_google_count,
        reviews_tripadvisor_count, reviews_enabled, created_at, updated_at
      FROM entities
    `);

    db.run("DROP TABLE entities");
    db.run("ALTER TABLE entities_new RENAME TO entities");
    db.run("COMMIT");
  } catch (error) {
    db.run("ROLLBACK");
    throw error;
  } finally {
    db.run("PRAGMA foreign_keys = ON");
  }
}

export function ensurePayloadSyncStateAcceptsKeyLocations(db: Database): void {
  if (!tableExists(db, "payload_sync_state")) return;

  const schemaRow = db
    .query("SELECT sql FROM sqlite_master WHERE type='table' AND name='payload_sync_state'")
    .get() as { sql: string } | null;
  const sql = schemaRow?.sql ?? "";
  if (sql.includes("'key-locations'")) {
    return;
  }

  db.run("PRAGMA foreign_keys = OFF");
  db.run("BEGIN TRANSACTION");
  try {
    db.run(`
      CREATE TABLE payload_sync_state_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_id INTEGER NOT NULL,
        payload_collection TEXT NOT NULL CHECK(payload_collection IN ('dining', 'accommodations', 'attractions', 'nightlife', 'key-locations')),
        payload_doc_id TEXT NOT NULL,
        last_synced_at TEXT NOT NULL,
        sync_status TEXT NOT NULL DEFAULT 'success' CHECK(sync_status IN ('success', 'failed', 'pending')),
        error_message TEXT,
        FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE,
        UNIQUE(entity_id, payload_collection)
      )
    `);

    db.run(`
      INSERT INTO payload_sync_state_new (
        id, entity_id, payload_collection, payload_doc_id, last_synced_at, sync_status, error_message
      )
      SELECT
        id, entity_id, payload_collection, payload_doc_id, last_synced_at, sync_status, error_message
      FROM payload_sync_state
    `);

    db.run("DROP TABLE payload_sync_state");
    db.run("ALTER TABLE payload_sync_state_new RENAME TO payload_sync_state");
    db.run("COMMIT");
  } catch (error) {
    db.run("ROLLBACK");
    throw error;
  } finally {
    db.run("PRAGMA foreign_keys = ON");
  }
}
