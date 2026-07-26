import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { splitLocationsToEntities } from "./split-locations-to-entities";
import { validateRowCounts } from "./split-locations-to-entities/validation";

const openDatabases: Database[] = [];

function createLegacyTestDb(): Database {
  const db = new Database(":memory:");
  openDatabases.push(db);
  db.exec(`
    CREATE TABLE locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      name TEXT NOT NULL,
      address TEXT NOT NULL,
      url TEXT NOT NULL
    );

    CREATE TABLE instagram_embeds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      location_id INTEGER NOT NULL,
      username TEXT NOT NULL,
      url TEXT NOT NULL,
      embed_code TEXT NOT NULL,
      instagram TEXT,
      images TEXT,
      original_image_urls TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TRIGGER update_location_updated_at_from_instagram_embeds_insert
    AFTER INSERT ON instagram_embeds
    FOR EACH ROW
    BEGIN
      UPDATE locations SET name = name WHERE id = NEW.location_id;
    END;

    INSERT INTO locations (id, category, name, address, url)
    VALUES (1, 'attractions', 'Museum', 'Lima', 'https://example.test');

    INSERT INTO instagram_embeds (id, location_id, username, url, embed_code)
    VALUES (1, 1, 'museum', 'https://example.test/post', '<blockquote></blockquote>');
  `);
  return db;
}

function createPopulatedLegacyTestDb(): Database {
  const db = new Database(":memory:");
  openDatabases.push(db);
  db.exec(`
    CREATE TABLE locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      name TEXT NOT NULL,
      title TEXT,
      address TEXT NOT NULL,
      url TEXT NOT NULL,
      locationKey TEXT,
      type TEXT,
      hours_json TEXT,
      ideal_for_json TEXT,
      key_locations_details_json TEXT,
      price_level TEXT,
      reviews_enabled INTEGER,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE uploads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      location_id INTEGER NOT NULL,
      imageSets TEXT,
      uploadFormat TEXT,
      created_at TEXT
    );

    CREATE TABLE payload_sync_state (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      location_id INTEGER NOT NULL,
      payload_collection TEXT NOT NULL,
      payload_doc_id TEXT NOT NULL,
      last_synced_at TEXT NOT NULL,
      sync_status TEXT NOT NULL,
      error_message TEXT
    );

    CREATE TABLE tripadvisor_places (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      location_id INTEGER NOT NULL,
      tripadvisor_place_id TEXT NOT NULL,
      place_data TEXT NOT NULL,
      created_at TEXT
    );

    INSERT INTO locations (
      id, category, name, title, address, url, locationKey, type, hours_json,
      ideal_for_json, key_locations_details_json, price_level, reviews_enabled,
      created_at, updated_at
    ) VALUES
      (
        7, 'dining', 'Cafe', 'The Cafe', 'Lima', 'https://example.test/cafe',
        'peru|lima', 'cafe', '{"monday":[]}', '["families"]', NULL, '$$',
        0, '2025-01-01T00:00:00Z', '2025-01-02T00:00:00Z'
      ),
      (
        12, 'key_locations', 'Airport', NULL, 'Lima', 'https://example.test/airport',
        'peru|lima', 'airport', NULL, NULL, '{"kind":"airport"}', NULL,
        1, '2025-02-01T00:00:00Z', NULL
      );

    INSERT INTO uploads (id, location_id, imageSets, uploadFormat, created_at)
    VALUES (4, 7, '{"id":"image-set"}', NULL, '2025-01-03T00:00:00Z');

    INSERT INTO payload_sync_state (
      id, location_id, payload_collection, payload_doc_id, last_synced_at, sync_status, error_message
    ) VALUES (5, 7, 'dining', 'payload-7', '2025-01-04T00:00:00Z', 'success', NULL);

    INSERT INTO tripadvisor_places (
      id, location_id, tripadvisor_place_id, place_data, created_at
    ) VALUES (6, 7, 'ta-7', '{"rating":4.5}', '2025-01-05T00:00:00Z');
  `);
  return db;
}

afterEach(() => {
  while (openDatabases.length > 0) {
    openDatabases.pop()?.close();
  }
});

describe("splitLocationsToEntities", () => {
  test("drops legacy triggers that still update the removed locations table", () => {
    const db = createLegacyTestDb();

    expect(() => splitLocationsToEntities(db)).not.toThrow();

    const trigger = db
      .query(
        `SELECT name FROM sqlite_master
         WHERE type = 'trigger'
           AND name = 'update_location_updated_at_from_instagram_embeds_insert'`
      )
      .get();

    expect(trigger).toBeNull();
    expect(db.query("SELECT COUNT(*) AS count FROM entities").get()).toEqual({ count: 1 });
    expect(db.query("SELECT COUNT(*) AS count FROM instagram_embeds").get()).toEqual({ count: 1 });
  });

  test("preserves legacy entity, category, and child data and remains idempotent", () => {
    const db = createPopulatedLegacyTestDb();

    splitLocationsToEntities(db);
    splitLocationsToEntities(db);

    expect(
      db
        .query(
          `SELECT id, category, name, title, locationKey, reviews_enabled, created_at, updated_at
           FROM entities ORDER BY id`
        )
        .all()
    ).toEqual([
      {
        id: 7,
        category: "dining",
        name: "Cafe",
        title: "The Cafe",
        locationKey: "peru|lima",
        reviews_enabled: 0,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-02T00:00:00Z",
      },
      {
        id: 12,
        category: "key_locations",
        name: "Airport",
        title: null,
        locationKey: "peru|lima",
        reviews_enabled: 1,
        created_at: "2025-02-01T00:00:00Z",
        updated_at: "2025-02-01T00:00:00Z",
      },
    ]);
    expect(db.query("SELECT entity_id, type, hours_json, ideal_for_json, price_level FROM dining_locations").get()).toEqual({
      entity_id: 7,
      type: "cafe",
      hours_json: '{"monday":[]}',
      ideal_for_json: '["families"]',
      price_level: "$$",
    });
    expect(db.query("SELECT entity_id, type, key_locations_details_json FROM key_locations_locations").get()).toEqual({
      entity_id: 12,
      type: "airport",
      key_locations_details_json: '{"kind":"airport"}',
    });
    expect(db.query("SELECT id, entity_id, imageSets, uploadFormat FROM uploads").get()).toEqual({
      id: 4,
      entity_id: 7,
      imageSets: '{"id":"image-set"}',
      uploadFormat: "imageset",
    });
    expect(db.query("SELECT id, entity_id, payload_doc_id FROM payload_sync_state").get()).toEqual({
      id: 5,
      entity_id: 7,
      payload_doc_id: "payload-7",
    });
    expect(db.query("SELECT id, entity_id, tripadvisor_place_id FROM tripadvisor_places").get()).toEqual({
      id: 6,
      entity_id: 7,
      tripadvisor_place_id: "ta-7",
    });
    expect(db.query("SELECT COUNT(*) AS count FROM dining_locations").get()).toEqual({ count: 1 });
    expect(db.query("SELECT COUNT(*) AS count FROM key_locations_locations").get()).toEqual({ count: 1 });

    db.run(
      `INSERT INTO entities (category, name, address, url)
       VALUES ('attractions', 'Gallery', 'Lima', 'https://example.test/gallery')`
    );
    expect(db.query("SELECT id FROM entities WHERE name = 'Gallery'").get()).toEqual({ id: 13 });
  });
});

describe("split locations validation", () => {
  test("rejects a partial category backfill", () => {
    const db = new Database(":memory:");
    openDatabases.push(db);
    db.exec(`
      CREATE TABLE locations_legacy_backup (id INTEGER PRIMARY KEY);
      INSERT INTO locations_legacy_backup (id) VALUES (1), (2);
      CREATE TABLE entities (id INTEGER PRIMARY KEY);
      INSERT INTO entities (id) VALUES (1), (2);
      CREATE TABLE dining_locations (entity_id INTEGER PRIMARY KEY);
      INSERT INTO dining_locations (entity_id) VALUES (1);
      CREATE TABLE nightlife_locations (entity_id INTEGER PRIMARY KEY);
      CREATE TABLE accommodations_locations (entity_id INTEGER PRIMARY KEY);
      CREATE TABLE attractions_locations (entity_id INTEGER PRIMARY KEY);
      CREATE TABLE key_locations_locations (entity_id INTEGER PRIMARY KEY);
    `);

    expect(() => validateRowCounts(db, "locations_legacy_backup")).toThrow(
      "Entity migration row count mismatch. legacy=2, entities=2, typed=1"
    );
  });
});
