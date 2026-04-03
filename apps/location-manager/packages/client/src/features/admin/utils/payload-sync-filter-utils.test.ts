import {
  buildFacetOptions,
  extractPayloadSyncLocationScope,
  isPayloadSyncCategory,
  isReadyForPayloadBulkSync,
  matchesFacetFilter,
} from "./payload-sync-filter-utils";

declare const describe: (name: string, callback: () => void) => void;
declare const test: (name: string, callback: () => void) => void;
declare const expect: (value: unknown) => {
  toBe: (expected: unknown) => void;
  toEqual: (expected: unknown) => void;
  toBeNull: () => void;
};

describe("payload sync filter utils", () => {
  test("extracts country, city, and neighborhood from the location key", () => {
    const scope = extractPayloadSyncLocationScope({
      location: "Peru > Lima > Miraflores",
      locationKey: "peru|lima|miraflores",
      country: null,
    });

    expect(scope).toEqual({
      location: "Peru > Lima > Miraflores",
      locationKey: "peru|lima|miraflores",
      country: "peru",
      city: "lima",
      neighborhood: "miraflores",
    });
  });

  test("falls back to the provided country when locationKey is missing", () => {
    const scope = extractPayloadSyncLocationScope({
      location: null,
      locationKey: null,
      country: "peru",
    });

    expect(scope.country).toBe("peru");
    expect(scope.city).toBeNull();
    expect(scope.neighborhood).toBeNull();
  });

  test("derives city and neighborhood from the display location when locationKey is missing", () => {
    const scope = extractPayloadSyncLocationScope({
      location: "Peru > Lima > Barranco",
      locationKey: null,
      country: "peru",
    });

    expect(scope.country).toBe("peru");
    expect(scope.city).toBe("lima");
    expect(scope.neighborhood).toBe("barranco");
  });

  test("builds sorted facet options and counts unspecified entries", () => {
    const result = buildFacetOptions(
      [
        { neighborhood: "miraflores" },
        { neighborhood: "barranco" },
        { neighborhood: "miraflores" },
        { neighborhood: null },
      ],
      (item) => item.neighborhood,
      (value) => value.toUpperCase()
    );

    expect(result).toEqual({
      options: [
        { value: "barranco", label: "BARRANCO", count: 1 },
        { value: "miraflores", label: "MIRAFLORES", count: 2 },
      ],
      unspecifiedCount: 1,
    });
  });

  test("matches all, unspecified, and exact facet filters", () => {
    expect(matchesFacetFilter("lima", "all", "__unspecified__")).toBe(true);
    expect(matchesFacetFilter(null, "__unspecified__", "__unspecified__")).toBe(true);
    expect(matchesFacetFilter("lima", "lima", "__unspecified__")).toBe(true);
    expect(matchesFacetFilter("cusco", "lima", "__unspecified__")).toBe(false);
  });

  test("identifies payload-supported categories", () => {
    expect(isPayloadSyncCategory("dining")).toBe(true);
    expect(isPayloadSyncCategory("beaches")).toBe(false);
  });

  test("marks complete unsynced locations as ready for bulk sync", () => {
    expect(
      isReadyForPayloadBulkSync({
        category: "dining",
        isComplete: true,
        synced: false,
        needsResync: false,
      })
    ).toBe(true);
  });

  test("marks resync candidates as ready for bulk sync", () => {
    expect(
      isReadyForPayloadBulkSync({
        category: "nightlife",
        isComplete: true,
        synced: true,
        needsResync: true,
        syncState: { sync_status: "success" },
      })
    ).toBe(true);
  });

  test("excludes incomplete, failed, pending, and unsupported rows from bulk sync", () => {
    expect(
      isReadyForPayloadBulkSync({
        category: "dining",
        isComplete: false,
        synced: false,
        needsResync: false,
      })
    ).toBe(false);

    expect(
      isReadyForPayloadBulkSync({
        category: "dining",
        isComplete: true,
        synced: false,
        needsResync: false,
        syncState: { sync_status: "failed" },
      })
    ).toBe(false);

    expect(
      isReadyForPayloadBulkSync({
        category: "dining",
        isComplete: true,
        synced: false,
        needsResync: false,
        syncState: { sync_status: "pending" },
      })
    ).toBe(false);

    expect(
      isReadyForPayloadBulkSync({
        category: "beaches",
        isComplete: true,
        synced: false,
        needsResync: false,
      })
    ).toBe(false);
  });
});
