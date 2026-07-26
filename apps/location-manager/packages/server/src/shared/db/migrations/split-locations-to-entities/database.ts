import type { Database } from "bun:sqlite";

export function tableExists(db: Database, tableName: string): boolean {
  const row = db
    .query("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
    .get(tableName) as { name: string } | null;
  return !!row;
}

export function getTableColumns(db: Database, tableName: string): Set<string> {
  const rows = db
    .query(`PRAGMA table_info(${tableName})`)
    .all() as Array<{ name: string }>;
  return new Set(rows.map((row) => row.name));
}

export function dropLegacyLocationUpdatedAtTriggers(db: Database): void {
  const triggers = db
    .query(
      `SELECT name FROM sqlite_master
       WHERE type = 'trigger'
         AND (name = 'update_location_updated_at'
           OR name LIKE 'update_location_updated_at_from_%')`
    )
    .all() as Array<{ name: string }>;

  for (const { name } of triggers) {
    db.run(`DROP TRIGGER "${name.replaceAll('"', '""')}"`);
  }
}

export function bumpSequence(db: Database, tableName: string): void {
  try {
    db.run(
      `INSERT OR REPLACE INTO sqlite_sequence(name, seq)
       VALUES (?, COALESCE((SELECT MAX(id) FROM ${tableName}), 0))`,
      [tableName]
    );
  } catch {
    // sqlite_sequence may not exist yet; ignore.
  }
}
