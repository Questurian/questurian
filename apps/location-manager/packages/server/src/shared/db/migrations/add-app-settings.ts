import type { Database } from "bun:sqlite";

/**
 * Adds the app_settings key-value table backing Integration Toggles
 * (see LM CONTEXT.md "Integration Toggle"). Absence of a row means the
 * toggle's registry default applies, so no seeding is required.
 */
export function addAppSettings(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
}
