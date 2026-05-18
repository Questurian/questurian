import type { Database } from "bun:sqlite";

/**
 * Migration (ADR-0005): collapse `ai-reviews` / `ai-google` provenance values to `ai`.
 *
 * After removing the review pipeline, the AI-suggestion path always uses
 * grounded Google Search — the two prior provenance values no longer mean
 * different things. Rewrites both `provenance` and `pending_suggestions` JSON
 * columns on the `entities` table.
 */
export function collapseAiProvenance(db: Database): void {
  const columns = db
    .query("PRAGMA table_info(entities)")
    .all() as Array<{ name: string }>;
  const columnNames = new Set(columns.map((col) => col.name));

  const replace = (column: string) => {
    if (!columnNames.has(column)) return;

    db.run(
      `UPDATE entities
       SET ${column} = replace(replace(${column}, '"ai-reviews"', '"ai"'), '"ai-google"', '"ai"')
       WHERE ${column} IS NOT NULL
         AND (${column} LIKE '%"ai-reviews"%' OR ${column} LIKE '%"ai-google"%')`
    );
  };

  replace("provenance");
  replace("pending_suggestions");
}
