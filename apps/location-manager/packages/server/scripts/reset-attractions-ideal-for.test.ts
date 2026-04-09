import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import {
  resetAttractionsIdealForData,
  stripAttractionsIdealForFromDetails,
} from "./reset-attractions-ideal-for";

const databases: Database[] = [];

afterEach(() => {
  for (const db of databases.splice(0)) {
    db.close();
  }
});

function createTestDb() {
  const db = new Database(":memory:");
  databases.push(db);

  db.exec(`
    CREATE TABLE entities (
      id INTEGER PRIMARY KEY,
      category TEXT NOT NULL,
      payload_location_ref TEXT
    );

    CREATE TABLE attractions_locations (
      entity_id INTEGER PRIMARY KEY,
      ideal_for_json TEXT,
      attractions_details_json TEXT
    );

    CREATE TABLE payload_sync_state (
      id INTEGER PRIMARY KEY,
      entity_id INTEGER NOT NULL,
      payload_collection TEXT NOT NULL,
      payload_doc_id TEXT,
      last_synced_at TEXT,
      sync_status TEXT,
      error_message TEXT
    );
  `);

  return db;
}

describe("stripAttractionsIdealForFromDetails", () => {
  test("removes nested visit.ideal_for and preserves the rest of the JSON", () => {
    const nextJson = stripAttractionsIdealForFromDetails(
      JSON.stringify({
        core: { attraction_type: "museum" },
        visit: {
          booking_required: true,
          ideal_for: ["Families"],
          hours: { monday: "09:00 - 17:00" },
        },
      })
    );

    expect(JSON.parse(nextJson!)).toEqual({
      core: { attraction_type: "museum" },
      visit: {
        booking_required: true,
        hours: { monday: "09:00 - 17:00" },
      },
    });
  });
});

describe("resetAttractionsIdealForData", () => {
  test("clears attraction idealFor storage and leaves other categories untouched", () => {
    const db = createTestDb();

    db.exec(`
      INSERT INTO entities (id, category, payload_location_ref) VALUES
        (1, 'attractions', 'payload-attraction'),
        (2, 'dining', 'payload-dining');

      INSERT INTO attractions_locations (entity_id, ideal_for_json, attractions_details_json) VALUES
        (1, '["Families","History Buffs"]', '{"core":{"attraction_type":"museum"},"visit":{"booking_required":1,"ideal_for":["Families","History Buffs"]}}');

      INSERT INTO payload_sync_state (id, entity_id, payload_collection, payload_doc_id, last_synced_at, sync_status, error_message) VALUES
        (1, 1, 'attractions', 'doc-attraction', '2026-01-01 00:00:00', 'success', NULL),
        (2, 2, 'dining', 'doc-dining', '2026-01-01 00:00:00', 'success', NULL);
    `);

    const result = resetAttractionsIdealForData(db);

    expect(result).toEqual({
      processedLocations: 1,
      clearedIdealForRows: 1,
      strippedNestedIdealForRows: 1,
      clearedSyncStates: 1,
      clearedPayloadRefs: 1,
    });

    const attractionRow = db
      .query(
        `
          SELECT ideal_for_json AS idealForJson, attractions_details_json AS attractionsDetailsJson
          FROM attractions_locations
          WHERE entity_id = 1
        `
      )
      .get() as { idealForJson: string | null; attractionsDetailsJson: string | null };

    expect(attractionRow.idealForJson).toBeNull();
    expect(JSON.parse(attractionRow.attractionsDetailsJson!)).toEqual({
      core: { attraction_type: "museum" },
      visit: { booking_required: 1 },
    });

    const attractionSyncCount = db
      .query(`SELECT COUNT(*) AS count FROM payload_sync_state WHERE payload_collection = 'attractions'`)
      .get() as { count: number };
    const diningSyncCount = db
      .query(`SELECT COUNT(*) AS count FROM payload_sync_state WHERE payload_collection = 'dining'`)
      .get() as { count: number };
    const attractionEntity = db
      .query(`SELECT payload_location_ref AS payloadLocationRef FROM entities WHERE id = 1`)
      .get() as { payloadLocationRef: string | null };
    const diningEntity = db
      .query(`SELECT payload_location_ref AS payloadLocationRef FROM entities WHERE id = 2`)
      .get() as { payloadLocationRef: string | null };

    expect(attractionSyncCount.count).toBe(0);
    expect(diningSyncCount.count).toBe(1);
    expect(attractionEntity.payloadLocationRef).toBeNull();
    expect(diningEntity.payloadLocationRef).toBe("payload-dining");
  });
});
