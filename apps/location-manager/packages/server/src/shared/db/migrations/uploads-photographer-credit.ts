import { getDb } from "../client";

export function migrateUploadsToPhotographerCredit() {
  const db = getDb();

  // Check if uploads table exists
  const tableCheck = db.query(`
    SELECT name FROM sqlite_master
    WHERE type='table' AND name='uploads'
  `).get();

  if (!tableCheck) {
    console.log("⏭️  Skipping uploads migration: table does not exist");
    return;
  }

  // Check if photographerCredit column already exists
  const columnCheck = db.query(`
    PRAGMA table_info(uploads)
  `).all() as any[];

  const hasPhotographerCredit = columnCheck.some((col: any) => col.name === 'photographerCredit');
  const hasName = columnCheck.some((col: any) => col.name === 'name');

  if (hasPhotographerCredit && !hasName) {
    console.log("⏭️  Skipping uploads migration: already migrated");
    return;
  }

  // Skip if images column doesn't exist - this migration may have been made obsolete
  // by later migrations that removed the images column entirely
  const hasImages = columnCheck.some((col: any) => col.name === 'images');
  if (!hasImages) {
    console.log("⏭️  Skipping uploads migration: images column not found (migration may be obsolete)");
    return;
  }

  console.log("🔄 Migrating uploads table: replacing name/address/url with photographerCredit...");

  // 1. Drop uploads_new table if it exists (cleanup from failed previous migrations)
  try {
    db.run(`DROP TABLE IF EXISTS uploads_new`);
  } catch (error) {
    console.log("  ⚠️  Could not drop existing uploads_new table, continuing...");
  }

  // 2. Create new table with photographerCredit instead of name/address/url
  db.run(`
    CREATE TABLE uploads_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      location_id INTEGER NOT NULL,
      photographerCredit TEXT,
      images TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(location_id) REFERENCES locations(id) ON DELETE CASCADE
    )
  `);

  // 2. Copy data from old table to new table, setting photographerCredit to empty for existing records
  db.run(`
    INSERT INTO uploads_new (id, location_id, photographerCredit, images, created_at)
    SELECT
      id,
      location_id,
      '',
      images,
      created_at
    FROM uploads
  `);

  // 3. Drop old table
  db.run(`DROP TABLE uploads`);

  // 4. Rename new table to original name
  db.run(`ALTER TABLE uploads_new RENAME TO uploads`);

  console.log("✅ Database migration completed: uploads now uses photographerCredit field");
}
