import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { findLocationsByPlaceIds } from "./location-place-id.repository";

let db: Database;

beforeEach(() => {
  db = new Database(":memory:");
  db.run(`
    CREATE TABLE entities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      name TEXT NOT NULL,
      place_id TEXT
    )
  `);
  const insert = db.query("INSERT INTO entities (category, name, place_id) VALUES (?, ?, ?)");
  insert.run("dining", "Papacho's", "place-papachos");
  insert.run("nightlife", "BarBarian Barranco", "place-barbarian");
  insert.run("dining", "BarBarian (old row)", "place-barbarian");
  insert.run("dining", "No Google yet", null);
});

afterEach(() => {
  db.close();
});

describe("findLocationsByPlaceIds", () => {
  test("returns every row holding a requested Place ID, duplicates included", () => {
    const rows = findLocationsByPlaceIds(["place-barbarian", "place-missing"], db);

    expect(rows.map((row) => [row.name, row.category, row.placeId])).toEqual([
      ["BarBarian Barranco", "nightlife", "place-barbarian"],
      ["BarBarian (old row)", "dining", "place-barbarian"],
    ]);
  });

  test("ignores blanks and repeats instead of querying for them", () => {
    expect(findLocationsByPlaceIds(["", "  "], db)).toEqual([]);
    expect(findLocationsByPlaceIds(["place-papachos", "place-papachos"], db)).toHaveLength(1);
  });
});
