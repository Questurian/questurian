import type { Database } from "bun:sqlite";
import { getDb } from "../client";

export function addTranslationsCacheTable(database?: Database): boolean {
  const db = database || getDb();

  try {
    const tableExists = db
      .query("SELECT name FROM sqlite_master WHERE type='table' AND name='translations'")
      .get();

    if (tableExists) {
      return false;
    }

    console.log("🔄 Creating translations cache table...");

    db.run(`
      CREATE TABLE translations (
        source TEXT NOT NULL CHECK(source IN ('google', 'tripadvisor')),
        review_id TEXT NOT NULL,
        location_id INTEGER NOT NULL,
        translator_version TEXT NOT NULL,
        original_language TEXT,
        translated_text TEXT,
        translated_title TEXT,
        translated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (source, review_id, translator_version)
      )
    `);

    db.run(`CREATE INDEX idx_translations_location ON translations(location_id)`);

    console.log("✅ Created translations cache table");
    return true;
  } catch (error) {
    console.error("❌ Failed to create translations table:", error);
    return false;
  }
}
