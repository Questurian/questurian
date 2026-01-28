import Database from "bun:sqlite";

/**
 * Migration: Add updated_at field to locations table
 *
 * Adds timestamp tracking for location modifications to support change detection
 * for Payload CMS sync operations.
 */
export function addLocationUpdatedAt(db: Database): void {
  console.log("🔄 Starting migration: Add updated_at field to locations table");

  try {
    // Check if column already exists
    const columnExists = db.query(`
      SELECT COUNT(*) as count
      FROM pragma_table_info('locations')
      WHERE name='updated_at'
    `).get() as { count: number };

    if (columnExists.count > 0) {
      console.log("  ✓ updated_at column already exists (migration already applied)");
      return;
    }

    // Add updated_at column with default value of created_at for existing records
    console.log("  📝 Adding updated_at column to locations table...");
    db.run(`
      ALTER TABLE locations
      ADD COLUMN updated_at TEXT DEFAULT NULL
    `);

    // Set updated_at to created_at for existing records where updated_at is null
    console.log("  📝 Setting updated_at for existing records...");
    db.run(`
      UPDATE locations
      SET updated_at = created_at
      WHERE updated_at IS NULL
    `);

    // Make updated_at NOT NULL and add a trigger to auto-update it
    console.log("  📝 Adding trigger to auto-update updated_at on location changes...");
    db.run(`
      CREATE TRIGGER update_location_updated_at
      AFTER UPDATE ON locations
      FOR EACH ROW
      BEGIN
        UPDATE locations
        SET updated_at = datetime('now')
        WHERE id = NEW.id;
      END;
    `);

    // Create index on updated_at for efficient queries
    console.log("  🔍 Creating index on updated_at...");
    db.run(`
      CREATE INDEX IF NOT EXISTS idx_locations_updated_at
      ON locations(updated_at)
    `);

    // Add triggers to update location updated_at when related data changes
    console.log("  📝 Adding triggers for related tables...");

    // Check if triggers already exist before creating them
    const existingTriggers = db.query(`
      SELECT name FROM sqlite_master
      WHERE type='trigger' AND name LIKE 'update_location_updated_at_from_%'
    `).all() as { name: string }[];

    const triggerNames = existingTriggers.map(t => t.name);

    // Triggers for uploads table
    if (!triggerNames.includes('update_location_updated_at_from_uploads_insert')) {
      db.run(`
        CREATE TRIGGER update_location_updated_at_from_uploads_insert
        AFTER INSERT ON uploads
        FOR EACH ROW
        BEGIN
          UPDATE locations
          SET updated_at = datetime('now')
          WHERE id = NEW.location_id;
        END;
      `);
    }

    if (!triggerNames.includes('update_location_updated_at_from_uploads_update')) {
      db.run(`
        CREATE TRIGGER update_location_updated_at_from_uploads_update
        AFTER UPDATE ON uploads
        FOR EACH ROW
        BEGIN
          UPDATE locations
          SET updated_at = datetime('now')
          WHERE id = NEW.location_id;
        END;
      `);
    }

    if (!triggerNames.includes('update_location_updated_at_from_uploads_delete')) {
      db.run(`
        CREATE TRIGGER update_location_updated_at_from_uploads_delete
        AFTER DELETE ON uploads
        FOR EACH ROW
        BEGIN
          UPDATE locations
          SET updated_at = datetime('now')
          WHERE id = OLD.location_id;
        END;
      `);
    }

    // Triggers for instagram_embeds table
    if (!triggerNames.includes('update_location_updated_at_from_instagram_embeds_insert')) {
      db.run(`
        CREATE TRIGGER update_location_updated_at_from_instagram_embeds_insert
        AFTER INSERT ON instagram_embeds
        FOR EACH ROW
        BEGIN
          UPDATE locations
          SET updated_at = datetime('now')
          WHERE id = NEW.location_id;
        END;
      `);
    }

    if (!triggerNames.includes('update_location_updated_at_from_instagram_embeds_update')) {
      db.run(`
        CREATE TRIGGER update_location_updated_at_from_instagram_embeds_update
        AFTER UPDATE ON instagram_embeds
        FOR EACH ROW
        BEGIN
          UPDATE locations
          SET updated_at = datetime('now')
          WHERE id = NEW.location_id;
        END;
      `);
    }

    if (!triggerNames.includes('update_location_updated_at_from_instagram_embeds_delete')) {
      db.run(`
        CREATE TRIGGER update_location_updated_at_from_instagram_embeds_delete
        AFTER DELETE ON instagram_embeds
        FOR EACH ROW
        BEGIN
          UPDATE locations
          SET updated_at = datetime('now')
          WHERE id = OLD.location_id;
        END;
      `);
    }

    console.log("  ✅ Migration completed successfully");
  } catch (error) {
    console.error("  ❌ Migration failed:", error);
    throw error;
  }
}
