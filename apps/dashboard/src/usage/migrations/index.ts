import type { Database } from "bun:sqlite";
import { createApiEventsTable } from "./001-api-events";

/**
 * Boot migrations, applied in order on every start.
 *
 * Each one must be write-idempotent: running it against an already-migrated
 * database must issue no writes at all. `CREATE ... IF NOT EXISTS` satisfies
 * that; a no-op `UPDATE` would not, and in this repo that mistake has already
 * cost a mass re-sync once (see lm-server's boot migrations).
 */
export const MIGRATIONS: ReadonlyArray<(db: Database) => void> = [createApiEventsTable];

export function applyMigrations(db: Database): void {
  for (const migration of MIGRATIONS) migration(db);
}
