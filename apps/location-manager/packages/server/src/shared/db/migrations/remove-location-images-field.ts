import Database from "bun:sqlite";

/**
 * Migration: Remove unused images column from locations table
 *
 * The images field in locations was never used - images are provided
 * through the instagram_embeds and uploads tables instead.
 */
export function removeLocationImagesField(db: Database): void {
  console.log("🔄 Starting migration: Remove images field from locations table");

  try {
    // Check if the images column exists in locations table
    const tableInfo = db
      .query("PRAGMA table_info(locations)")
      .all() as Array<{ name: string }>;

    const hasImagesColumn = tableInfo.some(col => col.name === "images");

    if (!hasImagesColumn) {
      console.log("  ✓ Images column does not exist in locations table (already removed or never existed)");
      return;
    }

    console.log("  → Found images column in locations table, removing...");

    // SQLite doesn't support DROP COLUMN directly in older versions
    // We need to use the table recreation pattern
    db.run("BEGIN TRANSACTION");

    // 1. Create new locations table without images column
    db.run(`
      CREATE TABLE locations_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        title TEXT,
        address TEXT NOT NULL,
        url TEXT NOT NULL,
        lat REAL,
        lng REAL,
        category TEXT DEFAULT 'attractions',
        dining_type TEXT,
        locationKey TEXT,
        contactAddress TEXT,
        countryCode TEXT,
        phoneNumber TEXT,
        website TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(name, address)
      )
    `);

    // 2. Copy data from old table to new (excluding images column)
    db.run(`
      INSERT INTO locations_new (
        id, name, title, address, url, lat, lng, category, dining_type,
        locationKey, contactAddress, countryCode, phoneNumber, website, created_at
      )
      SELECT
        id, name, title, address, url, lat, lng, category, dining_type,
        locationKey, contactAddress, countryCode, phoneNumber, website, created_at
      FROM locations
    `);

    // 3. Drop old table
    db.run("DROP TABLE locations");

    // 4. Rename new table to locations
    db.run("ALTER TABLE locations_new RENAME TO locations");

    db.run("COMMIT");

    console.log("  ✓ Successfully removed images column from locations table");
  } catch (error) {
    db.run("ROLLBACK");
    console.error("  ✗ Failed to remove images column:", error);
    throw error;
  }
}
