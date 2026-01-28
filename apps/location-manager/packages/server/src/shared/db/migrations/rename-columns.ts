import { getDb } from "../client";

export function migrateToTableCase() {
  const db = getDb();

  // SQLite doesn't support RENAME COLUMN directly for multiple columns
  // We need to recreate the table with new column names

  // 1. Create new table with camelCase columns
  db.run(`
    CREATE TABLE location_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      title TEXT,
      address TEXT NOT NULL,
      url TEXT,
      embed_code TEXT,
      instagram TEXT,
      images TEXT,
      lat REAL,
      lng REAL,
      original_image_urls TEXT,
      parent_id INTEGER,
      type TEXT DEFAULT 'maps',
      category TEXT,
      dining_type TEXT,
      locationKey TEXT,
      contactAddress TEXT,
      countryCode TEXT,
      phoneNumber TEXT,
      website TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(name, address),
      FOREIGN KEY(parent_id) REFERENCES location(id) ON DELETE CASCADE
    )
  `);

  // 2. Copy data from old table to new table
  db.run(`
    INSERT INTO location_new
    SELECT
      id, name, title, address, url, embed_code, instagram, images,
      lat, lng, original_image_urls, parent_id, type, category, dining_type,
      location_key, contact_address, country_code, phone_number, website,
      created_at
    FROM location
  `);

  // 3. Drop old table
  db.run(`DROP TABLE location`);

  // 4. Rename new table to original name
  db.run(`ALTER TABLE location_new RENAME TO location`);

  // 5. Do the same for location_taxonomy table
  db.run(`
    CREATE TABLE location_taxonomy_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      country TEXT NOT NULL,
      city TEXT,
      neighborhood TEXT,
      locationKey TEXT UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    INSERT INTO location_taxonomy_new
    SELECT id, country, city, neighborhood, location_key, created_at
    FROM location_taxonomy
  `);

  db.run(`DROP TABLE location_taxonomy`);
  db.run(`ALTER TABLE location_taxonomy_new RENAME TO location_taxonomy`);

  console.log("✅ Database migration completed: Renamed columns to camelCase");
}
