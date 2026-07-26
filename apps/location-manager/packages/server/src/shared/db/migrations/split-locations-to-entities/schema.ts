import type { Database } from "bun:sqlite";
import { CATEGORY_VALUES } from "./categories";
import { getTableColumns } from "./database";
import {
  ensureEntitiesTableAcceptsKeyLocations,
  ensurePayloadSyncStateAcceptsKeyLocations,
} from "./schema-compatibility";

export function ensureEntitySchema(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS entities (
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
      selected_payload_media_set_ids_json TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(category, name, address)
    )
  `);

  ensureEntitiesTableAcceptsKeyLocations(db);

  const entityColumns = getTableColumns(db, "entities");
  if (!entityColumns.has("selected_payload_media_set_ids_json")) {
    db.run("ALTER TABLE entities ADD COLUMN selected_payload_media_set_ids_json TEXT");
  }

  for (const category of CATEGORY_VALUES) {
    db.run(`
      CREATE TABLE IF NOT EXISTS ${category}_locations (
        entity_id INTEGER PRIMARY KEY,
        type TEXT,
        hours_json TEXT,
        ideal_for_json TEXT,
        nightlife_details_json TEXT,
        accommodations_details_json TEXT,
        attractions_details_json TEXT,
        key_locations_details_json TEXT,
        tripadvisor_meal_types TEXT,
        tripadvisor_cuisines TEXT,
        tripadvisor_features TEXT,
        menu_url TEXT,
        booking_url TEXT,
        price_level TEXT,
        FOREIGN KEY(entity_id) REFERENCES entities(id) ON DELETE CASCADE
      )
    `);

    const typedColumns = getTableColumns(db, `${category}_locations`);
    if (!typedColumns.has("accommodations_details_json")) {
      db.run(`ALTER TABLE ${category}_locations ADD COLUMN accommodations_details_json TEXT`);
    }
    if (!typedColumns.has("attractions_details_json")) {
      db.run(`ALTER TABLE ${category}_locations ADD COLUMN attractions_details_json TEXT`);
    }
    if (!typedColumns.has("key_locations_details_json")) {
      db.run(`ALTER TABLE ${category}_locations ADD COLUMN key_locations_details_json TEXT`);
    }
    if (!typedColumns.has("menu_url")) {
      db.run(`ALTER TABLE ${category}_locations ADD COLUMN menu_url TEXT`);
    }
    if (!typedColumns.has("booking_url") && !typedColumns.has("reservation_url")) {
      db.run(`ALTER TABLE ${category}_locations ADD COLUMN booking_url TEXT`);
    }
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS instagram_embeds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_id INTEGER NOT NULL,
      username TEXT NOT NULL,
      url TEXT NOT NULL,
      embed_code TEXT NOT NULL,
      instagram TEXT,
      images TEXT,
      original_image_urls TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(entity_id) REFERENCES entities(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS uploads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_id INTEGER NOT NULL,
      imageSets TEXT,
      uploadFormat TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(entity_id) REFERENCES entities(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS tripadvisor_places (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_id INTEGER NOT NULL,
      tripadvisor_place_id TEXT NOT NULL,
      place_data TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(entity_id) REFERENCES entities(id) ON DELETE CASCADE,
      UNIQUE(entity_id, tripadvisor_place_id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS payload_sync_state (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_id INTEGER NOT NULL,
      payload_collection TEXT NOT NULL CHECK(payload_collection IN ('dining', 'accommodations', 'attractions', 'nightlife', 'key-locations')),
      payload_doc_id TEXT NOT NULL,
      last_synced_at TEXT NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'success' CHECK(sync_status IN ('success', 'failed', 'pending')),
      error_message TEXT,
      FOREIGN KEY(entity_id) REFERENCES entities(id) ON DELETE CASCADE,
      UNIQUE(entity_id, payload_collection)
    )
  `);
  ensurePayloadSyncStateAcceptsKeyLocations(db);

  db.run(`
    CREATE TABLE IF NOT EXISTS tours (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      img_payload_media_set_id TEXT NOT NULL,
      booking_link TEXT NOT NULL,
      price TEXT NOT NULL,
      location_key TEXT,
      source_provider TEXT,
      source_url TEXT,
      source_title TEXT,
      source_image_url TEXT,
      source_product_code TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(title)
    )
  `);

  const tourColumns = getTableColumns(db, "tours");
  if (!tourColumns.has("location_key")) {
    db.run("ALTER TABLE tours ADD COLUMN location_key TEXT");
  }
  if (!tourColumns.has("source_provider")) {
    db.run("ALTER TABLE tours ADD COLUMN source_provider TEXT");
  }
  if (!tourColumns.has("source_url")) {
    db.run("ALTER TABLE tours ADD COLUMN source_url TEXT");
  }
  if (!tourColumns.has("source_title")) {
    db.run("ALTER TABLE tours ADD COLUMN source_title TEXT");
  }
  if (!tourColumns.has("source_image_url")) {
    db.run("ALTER TABLE tours ADD COLUMN source_image_url TEXT");
  }
  if (!tourColumns.has("source_product_code")) {
    db.run("ALTER TABLE tours ADD COLUMN source_product_code TEXT");
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS attraction_tours (
      attraction_entity_id INTEGER NOT NULL,
      tour_id INTEGER NOT NULL,
      sort_order INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(attraction_entity_id, tour_id),
      FOREIGN KEY(attraction_entity_id) REFERENCES entities(id) ON DELETE CASCADE,
      FOREIGN KEY(tour_id) REFERENCES tours(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS tour_payload_sync_state (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tour_id INTEGER NOT NULL,
      payload_doc_id TEXT NOT NULL,
      last_synced_at TEXT NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'success' CHECK(sync_status IN ('success', 'failed', 'pending')),
      error_message TEXT,
      FOREIGN KEY(tour_id) REFERENCES tours(id) ON DELETE CASCADE,
      UNIQUE(tour_id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS location_taxonomy (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      country TEXT NOT NULL,
      city TEXT,
      neighborhood TEXT,
      locationKey TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'approved' CHECK(status IN ('approved', 'pending')),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS taxonomy_corrections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      incorrect_value TEXT NOT NULL,
      correct_value TEXT NOT NULL,
      part_type TEXT NOT NULL CHECK(part_type IN ('country', 'city', 'neighborhood')),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(incorrect_value, part_type)
    )
  `);
}
