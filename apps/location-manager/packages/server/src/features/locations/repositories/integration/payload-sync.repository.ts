import { getDb } from "@server/shared/db/client";

export interface PayloadSyncState {
  id: number;
  location_id: number;
  payload_collection: "dining" | "accommodations" | "attractions" | "nightlife";
  payload_doc_id: string;
  last_synced_at: string;
  sync_status: "success" | "failed" | "pending";
  error_message: string | null;
}

/**
 * Get sync state for a specific location and collection
 */
export function getSyncState(
  locationId: number,
  collection: "dining" | "accommodations" | "attractions" | "nightlife"
): PayloadSyncState | null {
  try {
    const db = getDb();
    const query = db.query(`
      SELECT *
      FROM payload_sync_state
      WHERE location_id = $locationId AND payload_collection = $collection
    `);

    const result = query.get({
      $locationId: locationId,
      $collection: collection,
    }) as PayloadSyncState | null;

    return result;
  } catch (error) {
    console.error("Error fetching sync state:", error);
    return null;
  }
}

/**
 * Get all sync states for a location (across all collections)
 */
export function getSyncStatesByLocationId(locationId: number): PayloadSyncState[] {
  try {
    const db = getDb();
    const query = db.query(`
      SELECT *
      FROM payload_sync_state
      WHERE location_id = $locationId
    `);

    const results = query.all({
      $locationId: locationId,
    }) as PayloadSyncState[];

    return results;
  } catch (error) {
    console.error("Error fetching sync states by location:", error);
    return [];
  }
}

/**
 * Get all synced locations, optionally filtered by collection
 */
export function getAllSyncedLocations(
  collection?: "dining" | "accommodations" | "attractions" | "nightlife"
): PayloadSyncState[] {
  try {
    const db = getDb();

    if (collection) {
      const query = db.query(`
        SELECT *
        FROM payload_sync_state
        WHERE payload_collection = $collection
        ORDER BY last_synced_at DESC
      `);
      const results = query.all({ $collection: collection }) as PayloadSyncState[];
      return results;
    } else {
      const query = db.query(`
        SELECT *
        FROM payload_sync_state
        ORDER BY last_synced_at DESC
      `);
      const results = query.all() as PayloadSyncState[];
      return results;
    }
  } catch (error) {
    console.error("Error fetching all synced locations:", error);
    return [];
  }
}

/**
 * Save or update sync state for a location
 */
export function saveSyncState(
  locationId: number,
  collection: "dining" | "accommodations" | "attractions" | "nightlife",
  payloadDocId: string,
  status: "success" | "failed" | "pending",
  errorMessage?: string,
  timestamp?: string
): boolean {
  try {
    const db = getDb();
    const syncTimestamp = timestamp || new Date().toISOString();

    const query = db.query(`
      INSERT INTO payload_sync_state (location_id, payload_collection, payload_doc_id, last_synced_at, sync_status, error_message)
      VALUES ($locationId, $collection, $payloadDocId, $timestamp, $status, $errorMessage)
      ON CONFLICT(location_id, payload_collection) DO UPDATE SET
        payload_doc_id = CASE WHEN excluded.sync_status = 'success' THEN excluded.payload_doc_id ELSE payload_sync_state.payload_doc_id END,
        last_synced_at = excluded.last_synced_at,
        sync_status = excluded.sync_status,
        error_message = excluded.error_message
    `);

    query.run({
      $locationId: locationId,
      $collection: collection,
      $payloadDocId: payloadDocId,
      $timestamp: syncTimestamp,
      $status: status,
      $errorMessage: errorMessage || null,
    });

    return true;
  } catch (error) {
    console.error("Error saving sync state:", error);
    return false;
  }
}

/**
 * Delete sync state for a location (called when location is deleted)
 */
export function deleteSyncState(locationId: number): boolean {
  try {
    const db = getDb();
    const query = db.query(`
      DELETE FROM payload_sync_state
      WHERE location_id = $locationId
    `);

    query.run({ $locationId: locationId });
    return true;
  } catch (error) {
    console.error("Error deleting sync state:", error);
    return false;
  }
}

/**
 * Get count of synced locations by status
 */
export function getSyncStatistics(): {
  total: number;
  success: number;
  failed: number;
  pending: number;
} {
  try {
    const db = getDb();

    const totalQuery = db.query("SELECT COUNT(*) as count FROM payload_sync_state");
    const successQuery = db.query("SELECT COUNT(*) as count FROM payload_sync_state WHERE sync_status = 'success'");
    const failedQuery = db.query("SELECT COUNT(*) as count FROM payload_sync_state WHERE sync_status = 'failed'");
    const pendingQuery = db.query("SELECT COUNT(*) as count FROM payload_sync_state WHERE sync_status = 'pending'");

    const total = (totalQuery.get() as { count: number }).count;
    const success = (successQuery.get() as { count: number }).count;
    const failed = (failedQuery.get() as { count: number }).count;
    const pending = (pendingQuery.get() as { count: number }).count;

    return { total, success, failed, pending };
  } catch (error) {
    console.error("Error getting sync statistics:", error);
    return { total: 0, success: 0, failed: 0, pending: 0 };
  }
}
