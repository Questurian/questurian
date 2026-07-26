import { describe, expect, test } from "bun:test";
import type { LocationResponse } from "../../../models/location";
import type { PayloadSyncState } from "../../../repositories/integration";
import { hasLocationChangedSinceLastSync } from "./payload-sync-change-detector";

const location = (updatedAt = "2026-07-26 12:00:00"): LocationResponse =>
  ({
    id: 42,
    updated_at: updatedAt,
  }) as LocationResponse;

const syncState = (
  status: PayloadSyncState["sync_status"] = "success",
  lastSyncedAt = "2026-07-26 11:59:59"
): PayloadSyncState =>
  ({
    location_id: 42,
    sync_status: status,
    last_synced_at: lastSyncedAt,
  }) as PayloadSyncState;

describe("hasLocationChangedSinceLastSync", () => {
  test("does not label an unsynced or failed location as needing resync", () => {
    expect(hasLocationChangedSinceLastSync(location(), undefined)).toBe(false);
    expect(hasLocationChangedSinceLastSync(location(), syncState("failed"))).toBe(false);
  });

  test("does not require resync when the location has no update timestamp", () => {
    const locationWithoutTimestamp = {
      ...location(),
      updated_at: undefined,
    } as unknown as LocationResponse;

    expect(
      hasLocationChangedSinceLastSync(locationWithoutTimestamp, syncState())
    ).toBe(false);
  });

  test("requires resync only when the location timestamp is later", () => {
    expect(hasLocationChangedSinceLastSync(location(), syncState())).toBe(true);
    expect(
      hasLocationChangedSinceLastSync(
        location("2026-07-26 12:00:00"),
        syncState("success", "2026-07-26 12:00:00")
      )
    ).toBe(false);
    expect(
      hasLocationChangedSinceLastSync(
        location("2026-07-26 11:59:59"),
        syncState("success", "2026-07-26 12:00:00")
      )
    ).toBe(false);
  });
});
