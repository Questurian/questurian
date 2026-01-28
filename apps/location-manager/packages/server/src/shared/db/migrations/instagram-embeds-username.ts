import { getDb } from "../client";

export function migrateInstagramEmbedsToUsername() {
  const db = getDb();

  // Check if instagram_embeds table exists
  const tableCheck = db.query(`
    SELECT name FROM sqlite_master
    WHERE type='table' AND name='instagram_embeds'
  `).get();

  if (!tableCheck) {
    console.log("⏭️  Skipping instagram_embeds migration: table does not exist");
    return;
  }

  // Check if username column already exists
  const columnCheck = db.query(`
    PRAGMA table_info(instagram_embeds)
  `).all() as any[];

  const hasUsername = columnCheck.some((col: any) => col.name === 'username');
  const hasName = columnCheck.some((col: any) => col.name === 'name');

  if (hasUsername && !hasName) {
    console.log("⏭️  Skipping instagram_embeds migration: already migrated");
    return;
  }

  console.log("🔄 Migrating instagram_embeds table: replacing name/address with username...");

  // 1. Create new table with username instead of name/address
  db.run(`
    CREATE TABLE instagram_embeds_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      location_id INTEGER NOT NULL,
      username TEXT NOT NULL,
      url TEXT NOT NULL,
      embed_code TEXT NOT NULL,
      instagram TEXT,
      images TEXT,
      original_image_urls TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(location_id) REFERENCES locations(id) ON DELETE CASCADE
    )
  `);

  // 2. Copy data from old table to new table, extracting username from name field
  db.run(`
    INSERT INTO instagram_embeds_new (id, location_id, username, url, embed_code, instagram, images, original_image_urls, created_at)
    SELECT
      id,
      location_id,
      COALESCE(name, 'Unknown'),
      url,
      embed_code,
      instagram,
      images,
      original_image_urls,
      created_at
    FROM instagram_embeds
  `);

  // 3. Drop old table
  db.run(`DROP TABLE instagram_embeds`);

  // 4. Rename new table to original name
  db.run(`ALTER TABLE instagram_embeds_new RENAME TO instagram_embeds`);

  console.log("✅ Database migration completed: instagram_embeds now uses username field");
}
