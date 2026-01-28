import Database from "bun:sqlite";

/**
 * Migration: Create taxonomy_corrections table and fix bras-lia data
 *
 * This migration:
 * 1. Creates the taxonomy_corrections table
 * 2. Adds the "bras-lia" -> "brasilia" correction rule
 * 3. Updates all existing locations with "bras-lia" to "brasilia"
 * 4. Updates all taxonomy entries with "bras-lia" to "brasilia"
 */
export function addTaxonomyCorrections(db: Database): void {
  console.log("🔄 Starting migration: Add taxonomy corrections system");

  try {
    // Step 1: Create taxonomy_corrections table
    console.log("  📝 Creating taxonomy_corrections table...");
    db.run(`
      CREATE TABLE IF NOT EXISTS taxonomy_corrections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        incorrect_value TEXT NOT NULL,
        correct_value TEXT NOT NULL,
        part_type TEXT NOT NULL CHECK(part_type IN ('country', 'city', 'neighborhood')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(incorrect_value, part_type)
      )
    `);

    // Step 2: Create index for fast lookups
    console.log("  🔍 Creating index on taxonomy_corrections...");
    db.run(`
      CREATE INDEX IF NOT EXISTS idx_corrections_lookup
      ON taxonomy_corrections(incorrect_value, part_type)
    `);

    // Step 3: Insert the "bras-lia" -> "brasilia" correction
    console.log("  ➕ Adding 'bras-lia' -> 'brasilia' correction rule...");
    db.run(`
      INSERT OR IGNORE INTO taxonomy_corrections (incorrect_value, correct_value, part_type)
      VALUES ('bras-lia', 'brasilia', 'city')
    `);

    // Step 4: Find and fix locations with "bras-lia"
    console.log("  🔍 Finding locations with 'bras-lia'...");
    const locationsQuery = db.query(`
      SELECT id, locationKey
      FROM locations
      WHERE locationKey LIKE '%bras-lia%'
    `);
    const affectedLocations = locationsQuery.all() as Array<{
      id: number;
      locationKey: string;
    }>;

    console.log(`  📍 Found ${affectedLocations.length} locations with 'bras-lia'`);

    // Step 5: Update each location's locationKey
    if (affectedLocations.length > 0) {
      const updateLocationQuery = db.prepare(`
        UPDATE locations
        SET locationKey = ?
        WHERE id = ?
      `);

      affectedLocations.forEach((loc) => {
        const corrected = loc.locationKey.replace(/bras-lia/g, "brasilia");
        updateLocationQuery.run(corrected, loc.id);
        console.log(
          `    ✓ Updated location ${loc.id}: ${loc.locationKey} -> ${corrected}`
        );
      });
    }

    // Step 6: Find and fix taxonomy entries with "bras-lia"
    console.log("  🔍 Finding taxonomy entries with 'bras-lia'...");
    const taxonomyQuery = db.query(`
      SELECT id, locationKey, city
      FROM location_taxonomy
      WHERE locationKey LIKE '%bras-lia%' OR city = 'bras-lia'
    `);
    const affectedTaxonomy = taxonomyQuery.all() as Array<{
      id: number;
      locationKey: string;
      city: string | null;
    }>;

    console.log(`  📍 Found ${affectedTaxonomy.length} taxonomy entries with 'bras-lia'`);

    // Step 7: Update each taxonomy entry
    if (affectedTaxonomy.length > 0) {
      const updateTaxonomyQuery = db.prepare(`
        UPDATE location_taxonomy
        SET locationKey = ?, city = ?
        WHERE id = ?
      `);

      affectedTaxonomy.forEach((tax) => {
        const correctedKey = tax.locationKey.replace(/bras-lia/g, "brasilia");
        const correctedCity = tax.city === "bras-lia" ? "brasilia" : tax.city;
        updateTaxonomyQuery.run(correctedKey, correctedCity, tax.id);
        console.log(
          `    ✓ Updated taxonomy ${tax.id}: ${tax.locationKey} -> ${correctedKey}`
        );
      });
    }

    console.log("  ✅ Migration completed successfully");
    console.log(`    - Created taxonomy_corrections table`);
    console.log(`    - Added 'bras-lia' -> 'brasilia' rule`);
    console.log(`    - Fixed ${affectedLocations.length} location(s)`);
    console.log(`    - Fixed ${affectedTaxonomy.length} taxonomy entries`);
  } catch (error) {
    console.error("  ❌ Migration failed:", error);
    throw error;
  }
}
