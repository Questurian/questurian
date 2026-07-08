import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { TaxonomyCorrectionService } from "./taxonomy-correction.service";
import { BadRequestError } from "@server/shared/core/errors/http-error";

const openDatabases: Database[] = [];

function createTestDb(): Database {
  const db = new Database(":memory:");
  openDatabases.push(db);
  db.exec(`
    CREATE TABLE taxonomy_corrections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      incorrect_value TEXT NOT NULL,
      correct_value TEXT NOT NULL,
      part_type TEXT NOT NULL CHECK(part_type IN ('country', 'city', 'neighborhood')),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(incorrect_value, part_type)
    );
    CREATE TABLE location_taxonomy (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      country TEXT NOT NULL,
      city TEXT,
      neighborhood TEXT,
      locationKey TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'approved' CHECK(status IN ('approved', 'pending')),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE entities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      locationKey TEXT
    );
  `);
  return db;
}

function insertTaxonomy(
  db: Database,
  row: {
    country: string;
    city?: string | null;
    neighborhood?: string | null;
    locationKey: string;
    status?: "approved" | "pending";
  }
): void {
  db.query(
    `INSERT INTO location_taxonomy (country, city, neighborhood, locationKey, status)
     VALUES ($country, $city, $neighborhood, $locationKey, $status)`
  ).run({
    $country: row.country,
    $city: row.city ?? null,
    $neighborhood: row.neighborhood ?? null,
    $locationKey: row.locationKey,
    $status: row.status ?? "pending",
  });
}

function insertEntity(db: Database, name: string, locationKey: string): void {
  db.query(`INSERT INTO entities (name, locationKey) VALUES ($name, $key)`).run(
    { $name: name, $key: locationKey }
  );
}

function allTaxonomyKeys(db: Database): string[] {
  return (
    db.query(`SELECT locationKey FROM location_taxonomy ORDER BY locationKey`).all() as Array<{
      locationKey: string;
    }>
  ).map((row) => row.locationKey);
}

function allEntityKeys(db: Database): string[] {
  return (
    db.query(`SELECT locationKey FROM entities ORDER BY locationKey`).all() as Array<{
      locationKey: string;
    }>
  ).map((row) => row.locationKey);
}

afterEach(() => {
  while (openDatabases.length > 0) {
    openDatabases.pop()?.close();
  }
});

describe("TaxonomyCorrectionService.addRule (retroactive apply)", () => {
  test("city rule updates every matching pending taxonomy row and entity", () => {
    const db = createTestDb();
    insertTaxonomy(db, {
      country: "brazil",
      city: "bras-lia",
      locationKey: "brazil|bras-lia",
    });
    insertTaxonomy(db, {
      country: "brazil",
      city: "bras-lia",
      neighborhood: "asa-sul",
      locationKey: "brazil|bras-lia|asa-sul",
    });
    insertTaxonomy(db, {
      country: "peru",
      city: "lima",
      locationKey: "peru|lima",
      status: "approved",
    });
    insertEntity(db, "hotel-a", "brazil|bras-lia");
    insertEntity(db, "hotel-b", "brazil|bras-lia|asa-sul");
    insertEntity(db, "hotel-c", "peru|lima");

    const service = new TaxonomyCorrectionService(db);
    const result = service.addRule("bras-lia", "brasilia", "city");

    expect(result.updatedPendingCount).toBe(2);
    expect(result.updatedLocationCount).toBe(2);
    expect(result.correction.incorrect_value).toBe("bras-lia");

    expect(allTaxonomyKeys(db)).toEqual([
      "brazil|brasilia",
      "brazil|brasilia|asa-sul",
      "peru|lima",
    ]);
    expect(allEntityKeys(db)).toEqual([
      "brazil|brasilia",
      "brazil|brasilia|asa-sul",
      "peru|lima",
    ]);

    const cityColumns = db
      .query(`SELECT city FROM location_taxonomy WHERE locationKey LIKE 'brazil%' ORDER BY locationKey`)
      .all() as Array<{ city: string }>;
    expect(cityColumns.map((row) => row.city)).toEqual([
      "brasilia",
      "brasilia",
    ]);

    // The persisted rule now corrects incoming keys
    expect(service.applyCorrections("brazil|bras-lia|asa-sul")).toBe(
      "brazil|brasilia|asa-sul"
    );
  });

  test("neighborhood rule rewrites the last segment only and skips two-part keys", () => {
    const db = createTestDb();
    insertTaxonomy(db, {
      country: "peru",
      city: "lima",
      neighborhood: "lima",
      locationKey: "peru|lima|lima",
    });
    insertTaxonomy(db, { country: "peru", city: "lima", locationKey: "peru|lima" });
    insertEntity(db, "hostel-a", "peru|lima|lima");
    insertEntity(db, "hostel-b", "peru|lima");

    const service = new TaxonomyCorrectionService(db);
    const result = service.addRule("lima", "lima-centro", "neighborhood");

    expect(result.updatedPendingCount).toBe(1);
    expect(result.updatedLocationCount).toBe(1);
    expect(allTaxonomyKeys(db)).toEqual(["peru|lima", "peru|lima|lima-centro"]);
    expect(allEntityKeys(db)).toEqual(["peru|lima", "peru|lima|lima-centro"]);
  });

  test("deduplicates pending rows that collide on the corrected key", () => {
    const db = createTestDb();
    // Both keys match the %|a% pattern and REPLACE maps both to x|b|b
    insertTaxonomy(db, {
      country: "x",
      city: "a",
      neighborhood: "b",
      locationKey: "x|a|b",
    });
    insertTaxonomy(db, {
      country: "x",
      city: "b",
      neighborhood: "a",
      locationKey: "x|b|a",
    });

    const service = new TaxonomyCorrectionService(db);
    service.addRule("a", "b", "city");

    expect(allTaxonomyKeys(db)).toEqual(["x|b|b"]);
  });

  test("rolls back the whole transaction when the bulk apply fails", () => {
    const db = createTestDb();
    // "brazil|brasilia" does not match the %|bras-lia% pattern, so it is not
    // deduplicated and the bulk UPDATE hits its UNIQUE locationKey.
    insertTaxonomy(db, {
      country: "brazil",
      city: "brasilia",
      locationKey: "brazil|brasilia",
    });
    insertTaxonomy(db, {
      country: "brazil",
      city: "bras-lia",
      locationKey: "brazil|bras-lia",
    });

    const service = new TaxonomyCorrectionService(db);

    expect(() => service.addRule("bras-lia", "brasilia", "city")).toThrow();

    // Nothing committed: no rule, keys untouched
    expect(service.getAllRules()).toEqual([]);
    expect(allTaxonomyKeys(db)).toEqual(["brazil|bras-lia", "brazil|brasilia"]);
  });

  test("rejects a duplicate rule without touching data", () => {
    const db = createTestDb();
    insertTaxonomy(db, {
      country: "brazil",
      city: "bras-lia",
      locationKey: "brazil|bras-lia",
    });

    const service = new TaxonomyCorrectionService(db);
    service.addRule("bras-lia", "brasilia", "city");

    // Re-adding must fail even though data has already been corrected
    insertTaxonomy(db, {
      country: "brazil",
      city: "bras-lia",
      neighborhood: "lago",
      locationKey: "brazil|bras-lia|lago",
    });
    expect(() => service.addRule("bras-lia", "brasilia", "city")).toThrow(
      BadRequestError
    );
    expect(allTaxonomyKeys(db)).toContain("brazil|bras-lia|lago");
  });
});

describe("TaxonomyCorrectionService.previewCorrection", () => {
  test("reports affected rows with before/after keys without mutating", () => {
    const db = createTestDb();
    insertTaxonomy(db, {
      country: "brazil",
      city: "bras-lia",
      locationKey: "brazil|bras-lia",
    });
    insertEntity(db, "hotel-a", "brazil|bras-lia");
    insertEntity(db, "hotel-b", "peru|lima");

    const service = new TaxonomyCorrectionService(db);
    const preview = service.previewCorrection("bras-lia", "brasilia", "city");

    expect(preview.pendingTaxonomyCount).toBe(1);
    expect(preview.pendingTaxonomySamples).toEqual(["brazil|bras-lia"]);
    expect(preview.locationCount).toBe(1);
    expect(preview.locationSamples).toEqual([
      {
        id: 1,
        name: "hotel-a",
        currentKey: "brazil|bras-lia",
        correctedKey: "brazil|brasilia",
      },
    ]);

    // Preview is read-only
    expect(allTaxonomyKeys(db)).toEqual(["brazil|bras-lia"]);
    expect(allEntityKeys(db)).toEqual(["brazil|bras-lia", "peru|lima"]);
  });
});
