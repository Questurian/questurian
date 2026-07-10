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
      (207, 144, '@place', 'https://www.instagram.com/p/POST/?utm=one', 'old', '[]', '[]'),
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
});
