import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import type { Location } from "../../models/location";
import { insertEntity } from "./location-entity-write.repository";

const openDatabases: Database[] = [];

function createTestDb(): Database {
  const db = new Database(":memory:");
  openDatabases.push(db);

  db.exec(`
    CREATE TABLE entities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      name TEXT NOT NULL,
      title TEXT,
      address TEXT NOT NULL,
      url TEXT NOT NULL,
      lat REAL,
      lng REAL,
      locationKey TEXT,
      district TEXT,
      contactAddress TEXT,
      countryCode TEXT,
      iana_time_id TEXT,
      phoneNumber TEXT,
      website TEXT,
      email TEXT,
      neighborhood_description TEXT,
      slug TEXT UNIQUE,
      place_id TEXT,
      tripadvisor_url TEXT,
      tripadvisor_location_id TEXT,
      payload_location_ref TEXT,
      reviews_enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT,
      updated_at TEXT,
      UNIQUE(category, name, address)
    );
  `);

  return db;
}

function buildLocation(overrides: Partial<Location> = {}): Location {
  return {
    name: "BarBarian Barranco",
    title: "BarBarian Barranco",
    address: "Av. Pedro de Osma 144, Lima 15063, Peru",
    url: "http://localhost:3002/place/barbarian-barranco",
    category: "nightlife",
    slug: "barbarian-barranco",
    ...overrides,
  };
}

afterEach(() => {
  while (openDatabases.length > 0) {
    openDatabases.pop()?.close();
  }
});

describe("insertEntity", () => {
  test("adds a numeric suffix when the generated slug already exists", () => {
    const db = createTestDb();

    const firstId = insertEntity(db, "nightlife", buildLocation());
    const secondId = insertEntity(
      db,
      "dining",
      buildLocation({
        category: "dining",
        address: "Av. Almte. Miguel Grau 209-A, Barranco 15063, Peru",
      })
    );

    const rows = db.query(`
      SELECT id, category, slug
      FROM entities
      ORDER BY id
    `).all() as Array<{ id: number; category: string; slug: string | null }>;

    expect(firstId).toBeGreaterThan(0);
    expect(secondId).toBeGreaterThan(firstId);
    expect(rows).toEqual([
      { id: firstId, category: "nightlife", slug: "barbarian-barranco" },
      { id: secondId, category: "dining", slug: "barbarian-barranco-2" },
    ]);
  });
});
