import { getDb } from "../client";

/**
 * Migration: Split the polymorphic `location` table into three normalized tables
 *
 * Before:
 * - Single `location` table with type discriminator ('maps', 'instagram', 'upload')
 *
 * After:
 * - `locations` table (for type='maps')
 * - `instagram_embeds` table (for type='instagram')
 * - `uploads` table (for type='upload')
 */
export function splitLocationTables(): boolean {
  const db = getDb();

  try {
    console.log("🔄 Starting migration: Split location tables...");

    // Start transaction for atomicity
    db.run("BEGIN TRANSACTION");

    // Check if old location table exists
    const tableCheck = db.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='location'"
    ).get();

    if (!tableCheck) {
      console.log("⚠️  Old 'location' table not found. Migration may have already run.");
      db.run("ROLLBACK");
      return false;
    }

    // Count existing records for validation
    const counts = db.query(`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'maps' OR type IS NULL THEN 1 ELSE 0 END), 0) as maps_count,
        COALESCE(SUM(CASE WHEN type = 'instagram' THEN 1 ELSE 0 END), 0) as instagram_count,
        COALESCE(SUM(CASE WHEN type = 'upload' THEN 1 ELSE 0 END), 0) as upload_count
      FROM location
    `).get() as { maps_count: number; instagram_count: number; upload_count: number };

    console.log(`📊 Found ${counts.maps_count} maps, ${counts.instagram_count} instagram embeds, ${counts.upload_count} uploads`);

    // Create new locations table
    db.run(`
      CREATE TABLE locations (
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
    console.log("✅ Created 'locations' table");

    // Create instagram_embeds table
    db.run(`
      CREATE TABLE instagram_embeds (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        location_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        address TEXT NOT NULL DEFAULT 'Instagram Embed',
        url TEXT NOT NULL,
        embed_code TEXT NOT NULL,
        instagram TEXT,
        images TEXT,
        original_image_urls TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(location_id) REFERENCES locations(id) ON DELETE CASCADE
      )
    `);
    console.log("✅ Created 'instagram_embeds' table");

    // Create uploads table
    db.run(`
      CREATE TABLE uploads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        location_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        address TEXT NOT NULL DEFAULT 'Direct Upload',
        url TEXT NOT NULL DEFAULT '',
        images TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(location_id) REFERENCES locations(id) ON DELETE CASCADE
      )
    `);
    console.log("✅ Created 'uploads' table");

    // Migrate data: Maps (type='maps' or NULL) → locations
    db.run(`
      INSERT INTO locations (id, name, title, address, url, lat, lng, category, locationKey, contactAddress, countryCode, phoneNumber, website, created_at)
      SELECT id, name, title, address, url, lat, lng, category, locationKey, contactAddress, countryCode, phoneNumber, website, created_at
      FROM location
      WHERE type = 'maps' OR type IS NULL
    `);
    console.log(`✅ Migrated ${counts.maps_count} records to 'locations' table`);

    // Migrate data: Instagram embeds → instagram_embeds
    db.run(`
      INSERT INTO instagram_embeds (id, location_id, name, address, url, embed_code, instagram, images, original_image_urls, created_at)
      SELECT id, parent_id, name, address, url, embed_code, instagram, images, original_image_urls, created_at
      FROM location
      WHERE type = 'instagram'
    `);
    console.log(`✅ Migrated ${counts.instagram_count} records to 'instagram_embeds' table`);

    // Migrate data: Uploads → uploads
    db.run(`
      INSERT INTO uploads (id, location_id, name, address, url, images, created_at)
      SELECT id, parent_id, name, address, url, images, created_at
      FROM location
      WHERE type = 'upload'
    `);
    console.log(`✅ Migrated ${counts.upload_count} records to 'uploads' table`);

    // Drop old location table
    db.run("DROP TABLE location");
    console.log("✅ Dropped old 'location' table");

    // Commit transaction
    db.run("COMMIT");

    // Verify migration
    const newCounts = {
      locations: db.query("SELECT COUNT(*) as count FROM locations").get() as { count: number },
      instagram_embeds: db.query("SELECT COUNT(*) as count FROM instagram_embeds").get() as { count: number },
      uploads: db.query("SELECT COUNT(*) as count FROM uploads").get() as { count: number },
    };

    console.log(`📊 Verification: ${newCounts.locations.count} locations, ${newCounts.instagram_embeds.count} instagram embeds, ${newCounts.uploads.count} uploads`);

    if (
      newCounts.locations.count === counts.maps_count &&
      newCounts.instagram_embeds.count === counts.instagram_count &&
      newCounts.uploads.count === counts.upload_count
    ) {
      console.log("✅ Migration completed successfully!");
      return true;
    } else {
      console.error("❌ Migration verification failed - row counts don't match!");
      return false;
    }
  } catch (error) {
    console.error("❌ Migration failed:", error);
    try {
      db.run("ROLLBACK");
      console.log("⏮️  Transaction rolled back");
    } catch (rollbackError) {
      console.error("❌ Rollback failed:", rollbackError);
    }
    return false;
  }
}
