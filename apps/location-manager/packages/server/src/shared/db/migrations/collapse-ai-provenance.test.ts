import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { collapseAiProvenance } from "./collapse-ai-provenance";

const openDatabases: Database[] = [];

function createTestDb(schema: string): Database {
  const db = new Database(":memory:");
  openDatabases.push(db);
  db.exec(schema);
  return db;
}

afterEach(() => {
  while (openDatabases.length > 0) {
    openDatabases.pop()?.close();
  }
});

describe("collapseAiProvenance", () => {
  test("skips missing pending_suggestions column", () => {
    const db = createTestDb(`
      CREATE TABLE entities (
        id INTEGER PRIMARY KEY,
        provenance TEXT
      );

      INSERT INTO entities (id, provenance)
      VALUES (1, '{"type":"ai-reviews","idealFor":"ai-google"}');
    `);

    expect(() => collapseAiProvenance(db)).not.toThrow();

    const row = db
      .query("SELECT provenance FROM entities WHERE id = 1")
      .get() as { provenance: string };

    expect(row.provenance).toBe('{"type":"ai","idealFor":"ai"}');
  });

  test("rewrites snake_case pending suggestions column", () => {
    const db = createTestDb(`
      CREATE TABLE entities (
        id INTEGER PRIMARY KEY,
        provenance TEXT,
        pending_suggestions TEXT
      );

      INSERT INTO entities (id, provenance, pending_suggestions)
      VALUES (
        1,
        '{"type":"ai-reviews"}',
        '{"idealFor":{"value":["Date Night"],"provenance":"ai-google"}}'
      );
    `);

    collapseAiProvenance(db);

    const row = db
      .query("SELECT provenance, pending_suggestions AS pendingSuggestions FROM entities WHERE id = 1")
      .get() as { provenance: string; pendingSuggestions: string };

    expect(row.provenance).toBe('{"type":"ai"}');
    expect(row.pendingSuggestions).toBe('{"idealFor":{"value":["Date Night"],"provenance":"ai"}}');
  });
});
