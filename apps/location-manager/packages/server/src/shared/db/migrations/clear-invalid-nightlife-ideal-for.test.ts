import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { clearInvalidNightlifeIdealFor } from "./clear-invalid-nightlife-ideal-for";

const openDatabases: Database[] = [];

function createTestDb(): Database {
  const db = new Database(":memory:");
  openDatabases.push(db);

  db.exec(`
    CREATE TABLE entities (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL
    );

    CREATE TABLE nightlife_locations (
      entity_id INTEGER PRIMARY KEY,
      ideal_for_json TEXT,
      nightlife_details_json TEXT,
      FOREIGN KEY(entity_id) REFERENCES entities(id) ON DELETE CASCADE
    );
  `);

  return db;
}

afterEach(() => {
  while (openDatabases.length > 0) {
    openDatabases.pop()?.close();
  }
});

describe("clearInvalidNightlifeIdealFor", () => {
  test("clears invalid top-level tags and strips nested nightlife idealFor copies", () => {
    const db = createTestDb();

    db.exec(`
      INSERT INTO entities (id, name) VALUES
        (1, 'Valid Nightlife'),
        (2, 'Mixed Nightlife'),
        (3, 'Malformed Nightlife'),
        (4, 'Nested Only Nightlife');

      INSERT INTO nightlife_locations (entity_id, ideal_for_json, nightlife_details_json) VALUES
        (1, '["Friends Night","Live Music"]', '{"core":{"idealFor":["Friends Night","Live Music"]},"name":"Valid Nightlife"}'),
        (2, '["Friends'' Night Out","Live Music"]', '{"core":{"idealFor":["Friends'' Night Out","Live Music"]},"name":"Mixed Nightlife"}'),
        (3, 'not-json', '{"name":"Malformed Nightlife"}'),
        (4, NULL, '{"core":{"idealFor":["Friends'' Night Out","Live Music"]},"name":"Nested Only Nightlife"}');
    `);

    const result = clearInvalidNightlifeIdealFor(db);

    expect(result.scanned).toBe(4);
    expect(result.cleared).toBe(4);
    expect(result.rows.map((row) => row.entityId)).toEqual([1, 2, 3, 4]);

    const storedValues = db.query(`
      SELECT
        entity_id AS entityId,
        ideal_for_json AS idealForJson,
        nightlife_details_json AS nightlifeDetailsJson
      FROM nightlife_locations
      ORDER BY entity_id
    `).all() as Array<{
      entityId: number;
      idealForJson: string | null;
      nightlifeDetailsJson: string | null;
    }>;

    expect(storedValues).toEqual([
      {
        entityId: 1,
        idealForJson: '["Friends Night","Live Music"]',
        nightlifeDetailsJson: '{"core":{},"name":"Valid Nightlife"}',
      },
      {
        entityId: 2,
        idealForJson: null,
        nightlifeDetailsJson: '{"core":{},"name":"Mixed Nightlife"}',
      },
      {
        entityId: 3,
        idealForJson: null,
        nightlifeDetailsJson: '{"name":"Malformed Nightlife"}',
      },
      {
        entityId: 4,
        idealForJson: null,
        nightlifeDetailsJson: '{"core":{},"name":"Nested Only Nightlife"}',
      },
    ]);
  });
});
