import type { Database } from "bun:sqlite";

const CATEGORY_VALUES = ["dining", "accommodations", "attractions", "nightlife", "key_locations"] as const;

function tableExists(db: Database, tableName: string): boolean {
  const row = db
    .query("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
    .get(tableName) as { name: string } | null;
  return !!row;
}

function getTableColumns(db: Database, tableName: string): Set<string> {
  const rows = db
    .query(`PRAGMA table_info(${tableName})`)
    .all() as Array<{ name: string }>;
  return new Set(rows.map((row) => row.name));
}

function ensureEntitiesTableAcceptsKeyLocations(db: Database): void {
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

function ensurePayloadSyncStateAcceptsKeyLocations(db: Database): void {
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

function ensureEntitySchema(db: Database): void {
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
        reservation_url TEXT,
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
    if (!typedColumns.has("reservation_url")) {
      db.run(`ALTER TABLE ${category}_locations ADD COLUMN reservation_url TEXT`);
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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(title)
    )
  `);

  const tourColumns = getTableColumns(db, "tours");
  if (!tourColumns.has("location_key")) {
    db.run("ALTER TABLE tours ADD COLUMN location_key TEXT");
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

function ensureEntityIndexesAndTriggers(db: Database): void {
  db.run("CREATE INDEX IF NOT EXISTS idx_entities_category ON entities(category)");
  db.run("CREATE INDEX IF NOT EXISTS idx_entities_location_key ON entities(locationKey)");
  db.run("CREATE INDEX IF NOT EXISTS idx_entities_updated_at ON entities(updated_at)");

  db.run("CREATE INDEX IF NOT EXISTS idx_uploads_entity_id ON uploads(entity_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_instagram_embeds_entity_id ON instagram_embeds(entity_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_tripadvisor_places_entity_id ON tripadvisor_places(entity_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_payload_sync_entity ON payload_sync_state(entity_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_payload_sync_status ON payload_sync_state(sync_status)");
  db.run("CREATE INDEX IF NOT EXISTS idx_payload_sync_collection ON payload_sync_state(payload_collection)");
  db.run("CREATE INDEX IF NOT EXISTS idx_tours_updated_at ON tours(updated_at)");
  db.run("CREATE INDEX IF NOT EXISTS idx_attraction_tours_attraction ON attraction_tours(attraction_entity_id, sort_order)");
  db.run("CREATE INDEX IF NOT EXISTS idx_attraction_tours_tour ON attraction_tours(tour_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_tour_payload_sync_status ON tour_payload_sync_state(sync_status)");
  db.run("CREATE INDEX IF NOT EXISTS idx_corrections_lookup ON taxonomy_corrections(incorrect_value, part_type)");
  db.run("CREATE INDEX IF NOT EXISTS idx_location_taxonomy_status_key ON location_taxonomy(status, locationKey)");

  db.run(`
    CREATE TRIGGER IF NOT EXISTS touch_entities_from_uploads_insert
    AFTER INSERT ON uploads
    FOR EACH ROW
    BEGIN
      UPDATE entities SET updated_at = datetime('now') WHERE id = NEW.entity_id;
    END;
  `);
  db.run(`
    CREATE TRIGGER IF NOT EXISTS touch_entities_from_uploads_update
    AFTER UPDATE ON uploads
    FOR EACH ROW
    BEGIN
      UPDATE entities SET updated_at = datetime('now') WHERE id = NEW.entity_id;
    END;
  `);
  db.run(`
    CREATE TRIGGER IF NOT EXISTS touch_entities_from_uploads_delete
    AFTER DELETE ON uploads
    FOR EACH ROW
    BEGIN
      UPDATE entities SET updated_at = datetime('now') WHERE id = OLD.entity_id;
    END;
  `);

  db.run(`
    CREATE TRIGGER IF NOT EXISTS touch_entities_from_instagram_embeds_insert
    AFTER INSERT ON instagram_embeds
    FOR EACH ROW
    BEGIN
      UPDATE entities SET updated_at = datetime('now') WHERE id = NEW.entity_id;
    END;
  `);
  db.run(`
    CREATE TRIGGER IF NOT EXISTS touch_entities_from_instagram_embeds_update
    AFTER UPDATE ON instagram_embeds
    FOR EACH ROW
    BEGIN
      UPDATE entities SET updated_at = datetime('now') WHERE id = NEW.entity_id;
    END;
  `);
  db.run(`
    CREATE TRIGGER IF NOT EXISTS touch_entities_from_instagram_embeds_delete
    AFTER DELETE ON instagram_embeds
    FOR EACH ROW
    BEGIN
      UPDATE entities SET updated_at = datetime('now') WHERE id = OLD.entity_id;
    END;
  `);

  db.run(`
    CREATE TRIGGER IF NOT EXISTS touch_entities_from_tripadvisor_places_insert
    AFTER INSERT ON tripadvisor_places
    FOR EACH ROW
    BEGIN
      UPDATE entities SET updated_at = datetime('now') WHERE id = NEW.entity_id;
    END;
  `);
  db.run(`
    CREATE TRIGGER IF NOT EXISTS touch_entities_from_tripadvisor_places_update
    AFTER UPDATE ON tripadvisor_places
    FOR EACH ROW
    BEGIN
      UPDATE entities SET updated_at = datetime('now') WHERE id = NEW.entity_id;
    END;
  `);
  db.run(`
    CREATE TRIGGER IF NOT EXISTS touch_entities_from_tripadvisor_places_delete
    AFTER DELETE ON tripadvisor_places
    FOR EACH ROW
    BEGIN
      UPDATE entities SET updated_at = datetime('now') WHERE id = OLD.entity_id;
    END;
  `);

  db.run(`
    CREATE TRIGGER IF NOT EXISTS touch_tours_update
    AFTER UPDATE ON tours
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
    BEGIN
      UPDATE tours SET updated_at = datetime('now') WHERE id = NEW.id;
    END;
  `);
  db.run(`
    CREATE TRIGGER IF NOT EXISTS touch_entities_from_attraction_tours_insert
    AFTER INSERT ON attraction_tours
    FOR EACH ROW
    BEGIN
      UPDATE entities SET updated_at = datetime('now') WHERE id = NEW.attraction_entity_id;
    END;
  `);
  db.run(`
    CREATE TRIGGER IF NOT EXISTS touch_entities_from_attraction_tours_delete
    AFTER DELETE ON attraction_tours
    FOR EACH ROW
    BEGIN
      UPDATE entities SET updated_at = datetime('now') WHERE id = OLD.attraction_entity_id;
    END;
  `);

  db.run(`
    INSERT OR IGNORE INTO taxonomy_corrections (incorrect_value, correct_value, part_type)
    VALUES ('bras-lia', 'brasilia', 'city')
  `);
}

function bumpSequence(db: Database, tableName: string): void {
  try {
    db.run(
      `INSERT OR REPLACE INTO sqlite_sequence(name, seq)
       VALUES (?, COALESCE((SELECT MAX(id) FROM ${tableName}), 0))`,
      [tableName]
    );
  } catch {
    // sqlite_sequence may not exist yet; ignore.
  }
}

function renameLegacyTable(db: Database, tableName: string): string | null {
  if (!tableExists(db, tableName)) return null;

  const backupName = `${tableName}_legacy_backup`;
  if (tableExists(db, backupName)) {
    throw new Error(
      `Expected to create backup table "${backupName}", but it already exists. ` +
      `Manual intervention required before migration can continue.`
    );
  }

  db.run(`ALTER TABLE ${tableName} RENAME TO ${backupName}`);
  return backupName;
}

function migrateLocationsBackupIntoEntities(db: Database, backupTable: string): void {
  const columns = getTableColumns(db, backupTable);
  const col = (name: string, fallback = "NULL") => (columns.has(name) ? name : fallback);

  db.run(`
    INSERT INTO entities (
      id, category, name, title, address, url, lat, lng, locationKey, district,
      contactAddress, countryCode, iana_time_id, phoneNumber, website, email,
      neighborhood_description, slug, place_id, tripadvisor_url, tripadvisor_location_id,
      payload_location_ref, reviews_fetched_at, reviews_count, reviews_google_count,
      reviews_tripadvisor_count, reviews_enabled, created_at, updated_at
    )
    SELECT
      id,
      COALESCE(${col("category", "'attractions'")}, 'attractions'),
      ${col("name", "''")},
      ${col("title")},
      ${col("address", "''")},
      ${col("url", "''")},
      ${col("lat")},
      ${col("lng")},
      ${col("locationKey")},
      ${col("district")},
      ${col("contactAddress")},
      ${col("countryCode")},
      ${col("iana_time_id")},
      ${col("phoneNumber")},
      ${col("website")},
      ${col("email")},
      ${col("neighborhood_description")},
      ${col("slug")},
      ${col("place_id")},
      ${col("tripadvisor_url")},
      ${col("tripadvisor_location_id")},
      ${col("payload_location_ref")},
      ${col("reviews_fetched_at")},
      ${col("reviews_count")},
      ${col("reviews_google_count")},
      ${col("reviews_tripadvisor_count")},
      COALESCE(${col("reviews_enabled", "1")}, 1),
      COALESCE(${col("created_at", "CURRENT_TIMESTAMP")}, CURRENT_TIMESTAMP),
      COALESCE(${col("updated_at")}, ${col("created_at", "CURRENT_TIMESTAMP")}, CURRENT_TIMESTAMP)
    FROM ${backupTable}
  `);

  for (const category of CATEGORY_VALUES) {
    db.run(`
      INSERT INTO ${category}_locations (
        entity_id, type, hours_json, ideal_for_json, nightlife_details_json, accommodations_details_json, attractions_details_json,
        key_locations_details_json,
        tripadvisor_meal_types, tripadvisor_cuisines, tripadvisor_features, price_level
      )
      SELECT
        id,
        ${col("type")},
        ${col("hours_json")},
        ${col("ideal_for_json")},
        ${col("nightlife_details_json")},
        ${col("accommodations_details_json")},
        ${col("attractions_details_json")},
        ${col("key_locations_details_json")},
        ${col("tripadvisor_meal_types")},
        ${col("tripadvisor_cuisines")},
        ${col("tripadvisor_features")},
        ${col("price_level")}
      FROM ${backupTable}
      WHERE COALESCE(${col("category", "'attractions'")}, 'attractions') = '${category}'
    `);
  }
}

function migrateLegacyChildren(db: Database, tableName: string | null): void {
  if (!tableName) return;

  if (tableName.startsWith("instagram_embeds")) {
    const columns = getTableColumns(db, tableName);
    const fkColumn = columns.has("location_id") ? "location_id" : "entity_id";
    db.run(`
      INSERT INTO instagram_embeds (
        id, entity_id, username, url, embed_code, instagram, images, original_image_urls, created_at
      )
      SELECT
        id, ${fkColumn}, username, url, embed_code, instagram, images, original_image_urls, created_at
      FROM ${tableName}
    `);
    return;
  }

  if (tableName.startsWith("uploads")) {
    const columns = getTableColumns(db, tableName);
    const fkColumn = columns.has("location_id") ? "location_id" : "entity_id";
    const imageSetsExpr = columns.has("imageSets") ? "imageSets" : "NULL";
    const uploadFormatExpr = columns.has("uploadFormat") ? "uploadFormat" : "'imageset'";

    db.run(`
      INSERT INTO uploads (id, entity_id, imageSets, uploadFormat, created_at)
      SELECT id, ${fkColumn}, ${imageSetsExpr}, COALESCE(${uploadFormatExpr}, 'imageset'), created_at
      FROM ${tableName}
    `);
    return;
  }

  if (tableName.startsWith("payload_sync_state")) {
    const columns = getTableColumns(db, tableName);
    const fkColumn = columns.has("location_id") ? "location_id" : "entity_id";
    db.run(`
      INSERT INTO payload_sync_state (
        id, entity_id, payload_collection, payload_doc_id, last_synced_at, sync_status, error_message
      )
      SELECT
        id, ${fkColumn}, payload_collection, payload_doc_id, last_synced_at, sync_status, error_message
      FROM ${tableName}
    `);
    return;
  }

  if (tableName.startsWith("tripadvisor_places")) {
    const columns = getTableColumns(db, tableName);
    const fkColumn = columns.has("location_id") ? "location_id" : "entity_id";
    db.run(`
      INSERT INTO tripadvisor_places (
        id, entity_id, tripadvisor_place_id, place_data, created_at
      )
      SELECT
        id, ${fkColumn}, tripadvisor_place_id, place_data, created_at
      FROM ${tableName}
    `);
  }
}

function validateRowCounts(db: Database, legacyLocationsTable: string | null): void {
  if (!legacyLocationsTable) return;

  const legacyLocationCount = db.query(`SELECT COUNT(*) as count FROM ${legacyLocationsTable}`).get() as { count: number };
  const entitiesCount = db.query("SELECT COUNT(*) as count FROM entities").get() as { count: number };
  const typedCount = db.query(`
    SELECT
      (SELECT COUNT(*) FROM dining_locations) +
      (SELECT COUNT(*) FROM nightlife_locations) +
      (SELECT COUNT(*) FROM accommodations_locations) +
      (SELECT COUNT(*) FROM attractions_locations) +
      (SELECT COUNT(*) FROM key_locations_locations) AS count
  `).get() as { count: number };

  if (legacyLocationCount.count !== entitiesCount.count || entitiesCount.count !== typedCount.count) {
    throw new Error(
      `Entity migration row count mismatch. ` +
      `legacy=${legacyLocationCount.count}, entities=${entitiesCount.count}, typed=${typedCount.count}`
    );
  }
}

export function splitLocationsToEntities(db: Database): void {
  const alreadyMigrated = tableExists(db, "entities");
  if (alreadyMigrated) {
    ensureEntitySchema(db);
    ensureEntityIndexesAndTriggers(db);
    return;
  }

  db.run("PRAGMA foreign_keys = OFF");
  db.run("BEGIN TRANSACTION");

  try {
    const legacyLocationsTable = renameLegacyTable(db, "locations");
    const legacyInstagramTable = renameLegacyTable(db, "instagram_embeds");
    const legacyUploadsTable = renameLegacyTable(db, "uploads");
    const legacyPayloadSyncTable = renameLegacyTable(db, "payload_sync_state");
    const legacyTripadvisorPlacesTable = renameLegacyTable(db, "tripadvisor_places");

    ensureEntitySchema(db);

    if (legacyLocationsTable) {
      migrateLocationsBackupIntoEntities(db, legacyLocationsTable);
    }

    migrateLegacyChildren(db, legacyInstagramTable);
    migrateLegacyChildren(db, legacyUploadsTable);
    migrateLegacyChildren(db, legacyPayloadSyncTable);
    migrateLegacyChildren(db, legacyTripadvisorPlacesTable);

    validateRowCounts(db, legacyLocationsTable);

    ensureEntityIndexesAndTriggers(db);

    bumpSequence(db, "entities");
    bumpSequence(db, "instagram_embeds");
    bumpSequence(db, "uploads");
    bumpSequence(db, "tripadvisor_places");
    bumpSequence(db, "payload_sync_state");

    db.run("COMMIT");
  } catch (error) {
    db.run("ROLLBACK");
    throw error;
  } finally {
    db.run("PRAGMA foreign_keys = ON");
  }
}
