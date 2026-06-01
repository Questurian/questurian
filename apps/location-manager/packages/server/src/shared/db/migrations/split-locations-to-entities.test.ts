import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { splitLocationsToEntities } from "./split-locations-to-entities";

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
});
