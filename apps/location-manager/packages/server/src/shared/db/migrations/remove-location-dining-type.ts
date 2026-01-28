import Database from "bun:sqlite";

/**
 * Migration: Remove unused dining_type column from locations table
 *
 * The dining_type field in locations was not being used.
 */
export function removeLocationDiningType(db: Database): void {
  console.log("🔄 Starting migration: Remove dining_type field from locations table");

  try {
    // Check if the dining_type column exists in locations table
    const tableInfo = db
      .query("PRAGMA table_info(locations)")
      .all() as Array<{ name: string }>;

    const hasDiningTypeColumn = tableInfo.some(col => col.name === "dining_type");

    if (!hasDiningTypeColumn) {
      console.log("  ✓ dining_type column does not exist in locations table (already removed or never existed)");
      return;
    }

    console.log("  → Found dining_type column in locations table, removing...");

    // SQLite doesn't support DROP COLUMN directly in older versions
    // We need to use the table recreation pattern
    db.run("BEGIN TRANSACTION");

    // 1. Create new locations table without dining_type column
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
        locationKey TEXT,
        contactAddress TEXT,
        countryCode TEXT,
        phoneNumber TEXT,
        website TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(name, address)
      )
    `);

    // 2. Copy data from old table to new (excluding dining_type column)
    db.run(`
      INSERT INTO locations_new (
        id, name, title, address, url, lat, lng, category,
        locationKey, contactAddress, countryCode, phoneNumber, website, created_at
      )
      SELECT
        id, name, title, address, url, lat, lng, category,
        locationKey, contactAddress, countryCode, phoneNumber, website, created_at
      FROM locations
    `);

    // 3. Drop old table
    db.run("DROP TABLE locations");

    // 4. Rename new table to locations
    db.run("ALTER TABLE locations_new RENAME TO locations");

    db.run("COMMIT");

    console.log("  ✓ Successfully removed dining_type column from locations table");
  } catch (error) {
    db.run("ROLLBACK");
    console.error("  ✗ Failed to remove dining_type column:", error);
    throw error;
  }
}
