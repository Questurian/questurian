import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { dropReviewPipelineSchema } from "./drop-review-pipeline-schema";

const openDatabases: Database[] = [];

function createTestDb(): Database {
  const db = new Database(":memory:");
  openDatabases.push(db);
  db.run("PRAGMA foreign_keys = ON");
  db.exec(`
    CREATE TABLE entities (
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
      provenance TEXT,
      pending_suggestions TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(category, name, address)
    );

    CREATE TABLE uploads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_id INTEGER NOT NULL,
      FOREIGN KEY(entity_id) REFERENCES entities(id) ON DELETE CASCADE
    );

    CREATE TABLE translations (
      id INTEGER PRIMARY KEY AUTOINCREMENT
    );

    CREATE INDEX idx_entities_category ON entities(category);
    CREATE INDEX idx_entities_location_key ON entities(locationKey);
    CREATE INDEX idx_entities_updated_at ON entities(updated_at);

    CREATE TRIGGER touch_entities_from_uploads_insert
    AFTER INSERT ON uploads
    FOR EACH ROW
    BEGIN
      UPDATE entities SET updated_at = datetime('now') WHERE id = NEW.entity_id;
    END;

    INSERT INTO entities (
      id, category, name, address, url, reviews_fetched_at, reviews_count,
      reviews_google_count, reviews_tripadvisor_count, reviews_enabled,
      selected_payload_media_set_ids_json, provenance, pending_suggestions
    )
    VALUES (
      1, 'dining', 'Central', 'Lima', 'https://example.test', '2026-01-01',
      4, 2, 2, 1, '["media-set"]', '{"type":"ai"}',
      '{"idealFor":{"value":["Date Night"],"provenance":"ai"}}'
    );

    INSERT INTO uploads (entity_id) VALUES (1);
  `);
  return db;
}

afterEach(() => {
  while (openDatabases.length > 0) {
    openDatabases.pop()?.close();
  }
});

describe("dropReviewPipelineSchema", () => {
  test("rebuilds entities without review columns when child foreign keys exist", () => {
    const db = createTestDb();

    expect(() => dropReviewPipelineSchema(db)).not.toThrow();

    const columns = db
      .query("PRAGMA table_info(entities)")
      .all() as Array<{ name: string }>;
    const columnNames = columns.map((column) => column.name);

    expect(columnNames).not.toContain("reviews_fetched_at");
    expect(columnNames).not.toContain("reviews_count");
    expect(columnNames).not.toContain("reviews_google_count");
    expect(columnNames).not.toContain("reviews_tripadvisor_count");
    expect(columnNames).not.toContain("reviews_enabled");
    expect(columnNames).toContain("pending_suggestions");

    const row = db
      .query(
        `SELECT id, category, name, selected_payload_media_set_ids_json AS mediaSets,
                provenance, pending_suggestions AS pendingSuggestions
         FROM entities WHERE id = 1`
      )
      .get() as {
        id: number;
        category: string;
        name: string;
        mediaSets: string;
        provenance: string;
        pendingSuggestions: string;
      };

    expect(row).toEqual({
      id: 1,
      category: "dining",
      name: "Central",
      mediaSets: '["media-set"]',
      provenance: '{"type":"ai"}',
      pendingSuggestions: '{"idealFor":{"value":["Date Night"],"provenance":"ai"}}',
    });

    const translationsTable = db
      .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'translations'")
      .get();
    expect(translationsTable).toBeNull();

    const foreignKeyViolations = db.query("PRAGMA foreign_key_check").all();
    expect(foreignKeyViolations).toEqual([]);

    expect(
      db
        .query(
          `SELECT name FROM sqlite_master
           WHERE type = 'trigger' AND name = 'touch_entities_from_uploads_insert'`
        )
        .get()
    ).toEqual({ name: "touch_entities_from_uploads_insert" });
    expect(() => db.run("INSERT INTO uploads (entity_id) VALUES (1)")).not.toThrow();
  });
});
