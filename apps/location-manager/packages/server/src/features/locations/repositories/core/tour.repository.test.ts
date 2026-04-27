import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { Database } from "bun:sqlite";
import { splitLocationsToEntities } from "../../../../shared/db/migrations/split-locations-to-entities";

let db: Database;

mock.module("@server/shared/db/client", () => ({
  getDb: () => db,
}));

const {
  createTour,
  getAttractionTours,
  getTourSyncState,
  listTours,
  saveTourSyncState,
  setAttractionTours,
  updateTour,
} = await import("./tour.repository");

function insertLocation(category: "attractions" | "dining", name: string): number {
  db
    .query(`
      INSERT INTO entities (category, name, title, address, url)
      VALUES ($category, $name, $name, $address, $url)
    `)
    .run({
      $category: category,
      $name: name,
      $address: `${name} address`,
      $url: `https://example.com/${name.toLowerCase().replaceAll(" ", "-")}`,
    });

  const row = db.query("SELECT last_insert_rowid() as id").get() as { id: number };
  return row.id;
}

beforeEach(() => {
  db = new Database(":memory:");
  db.run("PRAGMA foreign_keys = ON");
  splitLocationsToEntities(db);
});

afterEach(() => {
  db.close();
});

describe("tour repository", () => {
  test("persists tours and ordered attraction links", () => {
    const attractionId = insertLocation("attractions", "Larco Museum");
    const diningId = insertLocation("dining", "Central");
    const first = createTour({
      title: "Museum Highlights",
      imgPayloadMediaSetId: "media-1",
      bookingLink: "https://example.com/museum",
      price: "From $35",
      locationKey: "peru|lima|miraflores",
    });
    expect(first.locationKey).toBe("peru|lima|miraflores");
    const second = createTour({
      title: "Lima City Tour",
      imgPayloadMediaSetId: "media-2",
      bookingLink: "https://example.com/lima",
      price: "$49",
    });

    const updated = updateTour(first.id, { price: "From $40" });
    expect(updated.price).toBe("From $40");
    expect(updated.locationKey).toBe("peru|lima|miraflores");

    const clearedPlace = updateTour(first.id, { locationKey: null });
    expect(clearedPlace.locationKey).toBeNull();
    expect(listTours({ query: "Lima" }).map((tour) => tour.id)).toEqual([second.id]);

    const linkedTours = setAttractionTours(attractionId, [second.id, first.id, second.id]);
    expect(linkedTours.map((tour) => tour.id)).toEqual([second.id, first.id]);
    expect(getAttractionTours(attractionId).map((tour) => tour.title)).toEqual([
      "Lima City Tour",
      "Museum Highlights",
    ]);

    expect(() => setAttractionTours(attractionId, [999])).toThrow(
      "One or more selected tours do not exist"
    );
    expect(() => setAttractionTours(diningId, [first.id])).toThrow("Attraction");
  });

  test("stores tour Payload sync state and keeps the last successful doc ID on failure", () => {
    const tour = createTour({
      title: "Sacred Valley Day Tour",
      imgPayloadMediaSetId: "media-3",
      bookingLink: "https://example.com/sacred-valley",
      price: "From $80",
    });

    expect(
      saveTourSyncState(tour.id, "payload-1", "success", undefined, "2026-01-01 12:00:00")
    ).toBe(true);
    expect(getTourSyncState(tour.id)).toMatchObject({
      tourId: tour.id,
      payloadDocId: "payload-1",
      lastSyncedAt: "2026-01-01 12:00:00",
      syncStatus: "success",
      errorMessage: null,
    });

    expect(saveTourSyncState(tour.id, "", "failed", "Payload rejected image")).toBe(true);
    expect(getTourSyncState(tour.id)).toMatchObject({
      payloadDocId: "payload-1",
      syncStatus: "failed",
      errorMessage: "Payload rejected image",
    });

    expect(
      saveTourSyncState(tour.id, "payload-2", "success", undefined, "2026-01-02 09:30:00")
    ).toBe(true);
    expect(getTourSyncState(tour.id)).toMatchObject({
      payloadDocId: "payload-2",
      lastSyncedAt: "2026-01-02 09:30:00",
      syncStatus: "success",
    });
  });
});
