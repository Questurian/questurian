import type { Database } from "bun:sqlite";

/**
 * Migration: Add pending_suggestions JSON column to entities table.
 *
 * Stores ADR-0002 side-channel: AI re-suggestions that arrived after the operator
 * touched the live field. Map shape: { fieldPath: { value, provenance } }.
 * Null/empty means no pending suggestions.
 */
export function addEntityPendingSuggestions(db: Database): void {
  const columns = db
    .query("PRAGMA table_info(entities)")
    .all() as Array<{ name: string }>;

  if (columns.some((col) => col.name === "pending_suggestions")) return;

  db.run(`ALTER TABLE entities ADD COLUMN pending_suggestions TEXT`);
}
