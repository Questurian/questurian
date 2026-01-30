import { Database } from "bun:sqlite";
import { getDb } from "../client";

/**
 * Migration: Add tripadvisor_places table for SerpAPI place data
 *
 * This table stores TripAdvisor place data fetched from SerpAPI.
 * It's kept separate from the main locations table because:
 * 1. The data may contain duplicates with different perspectives
 * 2. We want to preserve the raw place_result data from SerpAPI
 * 3. This data is used for downloads and exports
 */
export function addTripadvisorPlacesTable(database?: Database): boolean {
  const db = database || getDb();

  try {
    // Check if table already exists
    const tableExists = db.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='tripadvisor_places'"
    ).get();

    if (tableExists) {
      return false;
    }

    console.log("🔄 Creating tripadvisor_places table...");

    db.run(`
      CREATE TABLE tripadvisor_places (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        location_id INTEGER NOT NULL,
        tripadvisor_place_id TEXT NOT NULL,
        place_data TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(location_id) REFERENCES locations(id) ON DELETE CASCADE,
        UNIQUE(location_id, tripadvisor_place_id)
      )
    `);

    console.log("✅ Created tripadvisor_places table");
    return true;
  } catch (error) {
    console.error("❌ Failed to create tripadvisor_places table:", error);
    return false;
  }
}
