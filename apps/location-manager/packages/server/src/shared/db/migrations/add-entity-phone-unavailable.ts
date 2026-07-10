import Database from "bun:sqlite";

/**
 * Migration: Add phone_unavailable flag to the entities table.
 *
 * Lets operators mark a location as having no phone on purpose. The
 * completeness check treats `phone_unavailable = 1` as satisfied (green) even
 * though `phoneNumber` stays NULL, so genuinely phone-less places stop being
 * flagged as missing data. Mirrors the existing "no TripAdvisor listing"
 * operator-confirmation pattern.
 */
export function addEntityPhoneUnavailable(db: Database): void {
  console.log("🔄 Starting migration: Add phone_unavailable column to entities table");

  try {
    const tableInfo = db.query("PRAGMA table_info(entities)").all() as Array<{ name: string }>;
    const hasColumn = tableInfo.some((col) => col.name === "phone_unavailable");

    if (hasColumn) {
      console.log("  ⏭️  Column phone_unavailable already exists, skipping migration");
      return;
    }

    console.log("  📝 Adding phone_unavailable column...");
    db.run(`
      ALTER TABLE entities
      ADD COLUMN phone_unavailable INTEGER NOT NULL DEFAULT 0
    `);

    console.log("  ✅ Migration completed successfully");
  } catch (error) {
    console.error("  ❌ Migration failed:", error);
    throw error;
  }
}
