import type { LocationResponse } from "../../../models/location";
import type { PayloadSyncState } from "../../../repositories/integration";

/**
 * Compares location and successful-sync timestamps.
 *
 * A missing or failed state represents "needs initial sync", not "needs resync".
 */
export function hasLocationChangedSinceLastSync(
  location: LocationResponse,
  syncState: PayloadSyncState | null | undefined
): boolean {
  if (!syncState || syncState.sync_status !== "success") {
    console.log(
      `🔍 Location ${location.id}: No sync state or not successful - needsResync=false`
    );
    return false;
  }

  if (!location.updated_at) {
    console.log(`🔍 Location ${location.id}: No updated_at - needsResync=false`);
    return false;
  }

  const lastModified = new Date(location.updated_at);
  const lastSynced = new Date(syncState.last_synced_at);

  console.log(`🔍 Location ${location.id} timestamp comparison:`);
  console.log(
    `   location.updated_at: ${location.updated_at} (Date: ${lastModified.toISOString()})`
  );
  console.log(
    `   syncState.last_synced_at: ${syncState.last_synced_at} (Date: ${lastSynced.toISOString()})`
  );
  console.log(`   needsResync: ${lastModified > lastSynced}`);

  return lastModified > lastSynced;
}
