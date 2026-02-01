import Database from "bun:sqlite";

/**
 * Migration: Add reviews tracking fields to locations table
 *
 * Adds columns to track reviews fetching status and counts from Google and TripAdvisor.
 */
export function addReviewsTracking(db: Database): void {
  console.log("🔄 Starting migration: Add reviews tracking fields to locations table");

  try {
    const tableInfo = db.query("PRAGMA table_info(locations)").all() as Array<{ name: string }>;
    const hasReviewsFetchedAt = tableInfo.some(col => col.name === "reviews_fetched_at");
    const hasReviewsCount = tableInfo.some(col => col.name === "reviews_count");
    const hasReviewsGoogleCount = tableInfo.some(col => col.name === "reviews_google_count");
    const hasReviewsTripadvisorCount = tableInfo.some(col => col.name === "reviews_tripadvisor_count");

    if (hasReviewsFetchedAt && hasReviewsCount && hasReviewsGoogleCount && hasReviewsTripadvisorCount) {
      console.log("  ⏭️  Reviews tracking columns already exist, skipping migration");
      return;
    }

    if (!hasReviewsFetchedAt) {
      console.log("  📝 Adding reviews_fetched_at column...");
      db.run(`
        ALTER TABLE locations
        ADD COLUMN reviews_fetched_at TEXT
      `);
    }

    if (!hasReviewsCount) {
      console.log("  📝 Adding reviews_count column...");
      db.run(`
        ALTER TABLE locations
        ADD COLUMN reviews_count INTEGER
      `);
    }

    if (!hasReviewsGoogleCount) {
      console.log("  📝 Adding reviews_google_count column...");
      db.run(`
        ALTER TABLE locations
        ADD COLUMN reviews_google_count INTEGER
      `);
    }

    if (!hasReviewsTripadvisorCount) {
      console.log("  📝 Adding reviews_tripadvisor_count column...");
      db.run(`
        ALTER TABLE locations
        ADD COLUMN reviews_tripadvisor_count INTEGER
      `);
    }

    console.log("  ✅ Migration completed successfully");
  } catch (error) {
    console.error("  ❌ Migration failed:", error);
    throw error;
  }
}
