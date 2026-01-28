import Database from "bun:sqlite";

/**
 * Migration: Add CHECK constraint to category field
 *
 * Ensures category can only be one of the 4 allowed values:
 * 'dining', 'accommodations', 'attractions', 'nightlife'
 */
export function addCategoryConstraint(db: Database): void {
  console.log("🔄 Starting migration: Add CHECK constraint to category field");

  try {
    const tableSql = db
      .query("SELECT sql FROM sqlite_master WHERE type='table' AND name='locations'")
      .get() as { sql?: string } | undefined;

    if (tableSql?.sql && /CHECK\s*\(\s*category\s+IN\s*\(/i.test(tableSql.sql)) {
      console.log("  ✓ Category CHECK constraint already exists, skipping migration");
      return;
    }

    const tableInfo = db
      .query("PRAGMA table_info(locations)")
      .all() as Array<{ name: string }>;

    const hasCategoryColumn = tableInfo.some(col => col.name === "category");

    if (!hasCategoryColumn) {
      console.log("  ✓ Category column does not exist in locations table");
      return;
    }

    // SQLite doesn't have a direct way to check for CHECK constraints
    // We'll always try to add the constraint (if it exists, the table recreation will fail safely)
    console.log("  → Adding CHECK constraint to category field...");

    db.run("BEGIN TRANSACTION");

    // Recreate table with CHECK constraint
    db.run(`
      CREATE TABLE locations_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        title TEXT,
        address TEXT NOT NULL,
        url TEXT NOT NULL,
        lat REAL,
        lng REAL,
        category TEXT DEFAULT 'attractions'
          CHECK(category IN ('dining', 'accommodations', 'attractions', 'nightlife')),
        locationKey TEXT,
        contactAddress TEXT,
        countryCode TEXT,
        phoneNumber TEXT,
        website TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(name, address)
      )
    `);

    // Copy data, converting invalid categories to 'attractions'
    db.run(`
      INSERT INTO locations_new (
        id, name, title, address, url, lat, lng, category,
        locationKey, contactAddress, countryCode, phoneNumber, website, created_at
      )
      SELECT
        id, name, title, address, url, lat, lng,
        CASE
          WHEN category IN ('dining', 'accommodations', 'attractions', 'nightlife')
          THEN category
          ELSE 'attractions'
        END,
        locationKey, contactAddress, countryCode, phoneNumber, website, created_at
      FROM locations
    `);

    db.run("DROP TABLE locations");
    db.run("ALTER TABLE locations_new RENAME TO locations");

    db.run("COMMIT");

    console.log("  ✓ Successfully added CHECK constraint to category field");
  } catch (error) {
    db.run("ROLLBACK");
    console.error("  ✗ Failed to add CHECK constraint:", error);
    throw error;
  }
}
