import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { Database } from "bun:sqlite";

let db: Database;

mock.module("@server/shared/db/client", () => ({
  getDb: () => db,
}));

const { getSyncState, saveSyncState } = await import("./payload-sync.repository");

const createSchema = () => {
  db.run(`
    CREATE TABLE payload_sync_state (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_id INTEGER NOT NULL,
      payload_collection TEXT NOT NULL,
      payload_doc_id TEXT NOT NULL DEFAULT '',
      last_synced_at TEXT NOT NULL,
      sync_status TEXT NOT NULL,
      error_message TEXT,
      UNIQUE(entity_id, payload_collection)
    )
  `);
};

beforeEach(() => {
  db = new Database(":memory:");
  createSchema();
});

afterEach(() => {
  db.close();
});

describe("payload sync repository", () => {
  test("keeps a doc id from a failed sync after the doc was created", () => {
    expect(
      saveSyncState(42, "accommodations", "", "pending", undefined, "2026-01-01T00:00:00Z")
    ).toBe(true);

    expect(
      saveSyncState(
        42,
        "accommodations",
        "36",
        "failed",
        "Gallery upload incomplete",
        "2026-01-01T00:01:00Z"
      )
    ).toBe(true);

    expect(getSyncState(42, "accommodations")).toMatchObject({
      location_id: 42,
      payload_collection: "accommodations",
      payload_doc_id: "36",
      sync_status: "failed",
      error_message: "Gallery upload incomplete",
    });
  });

  test("keeps the previous successful doc id when failure has no doc id", () => {
    expect(
      saveSyncState(43, "accommodations", "37", "success", undefined, "2026-01-01T00:00:00Z")
    ).toBe(true);

    expect(
      saveSyncState(
        43,
        "accommodations",
        "",
        "failed",
        "Payload request failed",
        "2026-01-01T00:01:00Z"
      )
    ).toBe(true);

    expect(getSyncState(43, "accommodations")).toMatchObject({
      payload_doc_id: "37",
      sync_status: "failed",
      error_message: "Payload request failed",
    });
  });
});
