import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { bulkUpdateLocationKeys } from "./location-bulk.repository";

const openDatabases: Database[] = [];

function createTestDb(): Database {
  const db = new Database(":memory:");
  openDatabases.push(db);
  db.exec(`
    CREATE TABLE entities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      locationKey TEXT
    );
  `);
  return db;
}

afterEach(() => {
  while (openDatabases.length > 0) {
    openDatabases.pop()?.close();
  }
});

describe("bulkUpdateLocationKeys (neighborhood)", () => {
  test("peru|lima|lima becomes peru|lima|lima-centro", () => {
    const db = createTestDb();
    db.run(`INSERT INTO entities (name, locationKey) VALUES ('a', 'peru|lima|lima')`);

    const n = bulkUpdateLocationKeys("lima", "lima-centro", "neighborhood", db);
    expect(n).toBe(1);

    const key = db
      .query("SELECT locationKey FROM entities WHERE id = 1")
      .get() as { locationKey: string };
    expect(key.locationKey).toBe("peru|lima|lima-centro");
  });

  test("two-part peru|lima is unchanged", () => {
    const db = createTestDb();
    db.run(`INSERT INTO entities (name, locationKey) VALUES ('b', 'peru|lima')`);

    const n = bulkUpdateLocationKeys("lima", "lima-centro", "neighborhood", db);
    expect(n).toBe(0);

    const key = db
      .query("SELECT locationKey FROM entities WHERE id = 1")
      .get() as { locationKey: string };
    expect(key.locationKey).toBe("peru|lima");
  });

  test("peru|cusco|lima becomes peru|cusco|lima-centro", () => {
    const db = createTestDb();
    db.run(
      `INSERT INTO entities (name, locationKey) VALUES ('c', 'peru|cusco|lima')`
    );

    const n = bulkUpdateLocationKeys("lima", "lima-centro", "neighborhood", db);
    expect(n).toBe(1);

    const key = db
      .query("SELECT locationKey FROM entities WHERE id = 1")
      .get() as { locationKey: string };
    expect(key.locationKey).toBe("peru|cusco|lima-centro");
  });
});
