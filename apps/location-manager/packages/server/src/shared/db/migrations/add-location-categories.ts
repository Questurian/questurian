import Database from "bun:sqlite";

const VALID_CATEGORIES = new Set([
  "dining",
  "accommodations",
  "attractions",
  "nightlife",
]);

/**
 * Migration: Add categories_json field to locations table.
 *
 * Stores one or more categories as a JSON array while keeping the legacy
 * single-category column for backward compatibility.
 */
export function addLocationCategories(db: Database): void {
  console.log("🔄 Starting migration: Add categories_json column to locations table");

  try {
    const tableInfo = db.query("PRAGMA table_info(locations)").all() as Array<{ name: string }>;
    const hasCategoriesJson = tableInfo.some((col) => col.name === "categories_json");

    if (!hasCategoriesJson) {
      console.log("  📝 Adding categories_json column...");
      db.run(`
        ALTER TABLE locations
        ADD COLUMN categories_json TEXT
      `);
    }

    const rows = db.query(`
      SELECT id, category, categories_json as categoriesJson
      FROM locations
      WHERE categories_json IS NULL OR TRIM(categories_json) = ''
    `).all() as Array<{ id: number; category: string | null; categoriesJson: string | null }>;

    if (rows.length > 0) {
      const updateQuery = db.query(`
        UPDATE locations
        SET categories_json = $categories_json
        WHERE id = $id
      `);

      for (const row of rows) {
        const fallback = row.category && VALID_CATEGORIES.has(row.category)
          ? row.category
          : "attractions";
        updateQuery.run({
          $id: row.id,
          $categories_json: JSON.stringify([fallback]),
        });
      }

      console.log(`  ✓ Backfilled categories_json for ${rows.length} row(s)`);
    } else {
      console.log("  ✓ categories_json already populated");
    }

    console.log("  ✅ Migration completed successfully");
  } catch (error) {
    console.error("  ❌ Migration failed:", error);
    throw error;
  }
}
