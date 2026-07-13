import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { addInstagramImageStaging } from "./add-instagram-image-staging";

describe("addInstagramImageStaging", () => {
  test("adds staging fields and consolidates duplicate posts using the richest record", () => {
    const db = new Database(":memory:");
    db.run("PRAGMA foreign_keys = ON");
    db.run("CREATE TABLE entities (id INTEGER PRIMARY KEY)");
    db.run(`CREATE TABLE instagram_embeds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_id INTEGER NOT NULL,
      username TEXT NOT NULL,
      url TEXT NOT NULL,
      embed_code TEXT NOT NULL,
      instagram TEXT,
      images TEXT,
      original_image_urls TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(entity_id) REFERENCES entities(id) ON DELETE CASCADE
    )`);
    db.run(`CREATE TABLE uploads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_id INTEGER NOT NULL,
      imageSets TEXT,
      uploadFormat TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(entity_id) REFERENCES entities(id) ON DELETE CASCADE
    )`);
    db.run("INSERT INTO entities (id) VALUES (144)");
    db.run(`INSERT INTO instagram_embeds
      (id, entity_id, username, url, embed_code, images, original_image_urls)
      VALUES
      (207, 144, '@place', 'https://instagram.com/p/POST?utm=one', 'old', '[]', '[]'),
      (209, 144, '@place', 'https://www.instagram.com/p/POST/', 'new', '[\"cached.jpg\"]', '[\"https://cdn.test/cached.jpg\"]')`);

    addInstagramImageStaging(db);
    addInstagramImageStaging(db);

    const embeds = db.query("SELECT id, url, images FROM instagram_embeds").all() as Array<Record<string, unknown>>;
    expect(embeds).toEqual([{
      id: 209,
      url: "https://www.instagram.com/p/POST/",
      images: '["cached.jpg"]',
    }]);
    const uploadColumns = db.query("PRAGMA table_info(uploads)").all() as Array<{ name: string }>;
    expect(uploadColumns.map((column) => column.name)).toContain("instagram_embed_id");
    expect(db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='rejected_instagram_media'").get()).toBeTruthy();
    db.close();
  });

  test("re-running on an already-migrated db does not touch entities via the updated_at trigger", () => {
    const db = new Database(":memory:");
    db.run("PRAGMA foreign_keys = ON");
    db.run("CREATE TABLE entities (id INTEGER PRIMARY KEY, touch_count INTEGER NOT NULL DEFAULT 0)");
    db.run(`CREATE TABLE instagram_embeds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_id INTEGER NOT NULL,
      username TEXT NOT NULL,
      url TEXT NOT NULL,
      embed_code TEXT NOT NULL,
      instagram TEXT,
      images TEXT,
      original_image_urls TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(entity_id) REFERENCES entities(id) ON DELETE CASCADE
    )`);
    db.run(`CREATE TABLE uploads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_id INTEGER NOT NULL,
      imageSets TEXT,
      uploadFormat TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(entity_id) REFERENCES entities(id) ON DELETE CASCADE
    )`);
    // Production installs touch triggers (split-locations-to-entities) that bump
    // entities.updated_at on ANY instagram_embeds write — including no-op UPDATEs.
    // touch_count stands in for updated_at so the assertion is deterministic.
    db.run(`CREATE TRIGGER touch_entities_from_instagram_embeds_update
      AFTER UPDATE ON instagram_embeds
      FOR EACH ROW
      BEGIN
        UPDATE entities SET touch_count = touch_count + 1 WHERE id = NEW.entity_id;
      END`);
    db.run("INSERT INTO entities (id) VALUES (144)");
    db.run(`INSERT INTO instagram_embeds
      (id, entity_id, username, url, embed_code, images, original_image_urls)
      VALUES (209, 144, '@place', 'https://instagram.com/p/POST?utm=one', 'code', '[]', '[]')`);

    addInstagramImageStaging(db);
    const touchesAfterFirstRun = (db.query("SELECT touch_count FROM entities WHERE id = 144").get() as { touch_count: number }).touch_count;

    addInstagramImageStaging(db);
    const touchesAfterSecondRun = (db.query("SELECT touch_count FROM entities WHERE id = 144").get() as { touch_count: number }).touch_count;

    expect(touchesAfterSecondRun).toBe(touchesAfterFirstRun);
    db.close();
  });
});
