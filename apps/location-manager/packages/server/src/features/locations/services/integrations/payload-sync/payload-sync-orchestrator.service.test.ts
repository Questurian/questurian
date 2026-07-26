import { describe, expect, mock, test } from "bun:test";
import { PayloadSyncOrchestratorService } from "./payload-sync-orchestrator.service";

describe("PayloadSyncOrchestratorService", () => {
  test("synchronizes tours before listing locations for an unfiltered batch", async () => {
    const events: string[] = [];
    const service = new PayloadSyncOrchestratorService(
      { isConfigured: () => true } as never,
      {
        listLocations: () => {
          events.push("list-locations");
          return [];
        },
      } as never,
      { syncLocation: mock(async () => ({ status: "success" })) } as never,
      {
        syncAllTours: mock(async () => {
          events.push("sync-tours");
        }),
      } as never
    );

    expect(await service.syncAllLocations()).toEqual([]);
    expect(events).toEqual(["sync-tours", "list-locations"]);
  });

  test("skips the tour batch for non-attraction categories", async () => {
    const syncAllTours = mock(async () => {});
    const listLocations = mock(() => []);
    const service = new PayloadSyncOrchestratorService(
      { isConfigured: () => true } as never,
      { listLocations } as never,
      { syncLocation: mock(async () => ({ status: "success" })) } as never,
      { syncAllTours } as never
    );

    await service.syncAllLocations("dining");

    expect(syncAllTours).not.toHaveBeenCalled();
    expect(listLocations).toHaveBeenCalledWith("dining");
  });

  test("rejects the batch before reading local data when Payload is unavailable", async () => {
    const listLocations = mock(() => []);
    const service = new PayloadSyncOrchestratorService(
      { isConfigured: () => false } as never,
      { listLocations } as never,
      { syncLocation: mock(async () => ({ status: "success" })) } as never,
      { syncAllTours: mock(async () => {}) } as never
    );

    await expect(service.syncAllLocations()).rejects.toThrow("Payload CMS");
    expect(listLocations).not.toHaveBeenCalled();
  });
});
