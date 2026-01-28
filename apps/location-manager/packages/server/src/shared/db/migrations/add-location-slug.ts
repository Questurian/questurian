import Database from "bun:sqlite";
import { slugifyLocationPart } from "../../../features/locations/services/geocoding/location-geocoding.helper";

/**
 * Migration: Add slug column to locations table
 *
 * Adds a slug field derived from the location name for URL-friendly identification.
 * Slug format: lowercase, kebab-case (e.g., "panchita-miraflores")
 */
export function addLocationSlug(db: Database): void {
  console.log("🔄 Starting migration: Add slug column to locations table");

  try {
    const tableInfo = db
      .query("PRAGMA table_info(locations)")
      .all() as Array<{ name: string }>;

    const hasSlug = tableInfo.some(col => col.name === "slug");
    if (hasSlug) {
      const slugIndex = db
        .query("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_locations_slug'")
        .get();

      if (!slugIndex) {
        console.log("  🔒 Adding unique constraint on slug...");
        db.run(`
          CREATE UNIQUE INDEX idx_locations_slug ON locations(slug)
        `);
      } else {
        console.log("  ✓ Slug column already exists, skipping migration");
      }
      return;
    }

    // Step 1: Add the slug column
    console.log("  📝 Adding slug column...");
    db.run(`
      ALTER TABLE locations
      ADD COLUMN slug TEXT
    `);

    // Step 2: Populate slugs for existing locations
    console.log("  🔄 Generating slugs for existing locations...");
    const locations = db.query("SELECT id, name FROM locations").all() as Array<{ id: number; name: string }>;

    const updateStmt = db.query("UPDATE locations SET slug = $slug WHERE id = $id");

    locations.forEach(location => {
      const slug = slugifyLocationPart(location.name);
      if (slug) {
        updateStmt.run({ $slug: slug, $id: location.id });
      }
    });

    // Step 3: Add unique constraint (separate step due to SQLite limitations)
    console.log("  🔒 Adding unique constraint on slug...");
    db.run(`
      CREATE UNIQUE INDEX idx_locations_slug ON locations(slug)
    `);

    console.log("  ✅ Migration completed successfully");
  } catch (error) {
    console.error("  ❌ Migration failed:", error);
    throw error;
  }
}
