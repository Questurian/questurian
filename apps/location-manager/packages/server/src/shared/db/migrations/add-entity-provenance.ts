import type { Database } from "bun:sqlite";

/**
 * Migration: Add provenance JSON column to entities table.
 *
 * Stores a sidecar map (per ADR-0002) keyed by field name → FieldProvenance.
 * Null/empty means all fields are operator-supplied (the implicit default).
 */
export function addEntityProvenance(db: Database): void {
  const columns = db
    .query("PRAGMA table_info(entities)")
    .all() as Array<{ name: string }>;

  if (columns.some((col) => col.name === "provenance")) return;

  db.run(`ALTER TABLE entities ADD COLUMN provenance TEXT`);
}
