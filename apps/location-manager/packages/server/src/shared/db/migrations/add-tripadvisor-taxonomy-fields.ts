import Database from "bun:sqlite";

/**
 * Migration: Add TripAdvisor taxonomy fields to locations table
 *
 * Adds JSON text columns for TripAdvisor meal types, cuisines, and features.
 */
export function addTripadvisorTaxonomyFields(db: Database): void {
  console.log("🔄 Starting migration: Add TripAdvisor taxonomy fields to locations table");

  try {
    const tableInfo = db.query("PRAGMA table_info(locations)").all() as Array<{ name: string }>;
    const hasMealTypes = tableInfo.some((col) => col.name === "tripadvisor_meal_types");
    const hasCuisines = tableInfo.some((col) => col.name === "tripadvisor_cuisines");
    const hasFeatures = tableInfo.some((col) => col.name === "tripadvisor_features");

    if (hasMealTypes && hasCuisines && hasFeatures) {
      console.log("  ⏭️  TripAdvisor taxonomy columns already exist, skipping migration");
      return;
    }

    if (!hasMealTypes) {
      console.log("  📝 Adding tripadvisor_meal_types column...");
      db.run(`
        ALTER TABLE locations
        ADD COLUMN tripadvisor_meal_types TEXT
      `);
    }

    if (!hasCuisines) {
      console.log("  📝 Adding tripadvisor_cuisines column...");
      db.run(`
        ALTER TABLE locations
        ADD COLUMN tripadvisor_cuisines TEXT
      `);
    }

    if (!hasFeatures) {
      console.log("  📝 Adding tripadvisor_features column...");
      db.run(`
        ALTER TABLE locations
        ADD COLUMN tripadvisor_features TEXT
      `);
    }

    console.log("  ✅ Migration completed successfully");
  } catch (error) {
    console.error("  ❌ Migration failed:", error);
    throw error;
  }
}
