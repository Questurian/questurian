import { getDb } from "@server/shared/db/client";

export interface PayloadSyncState {
  id: number;
  location_id: number;
  payload_collection: "dining" | "accommodations" | "attractions" | "nightlife" | "key-locations";
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
  collection: "dining" | "accommodations" | "attractions" | "nightlife" | "key-locations"
): PayloadSyncState | null {
  try {
    const db = getDb();
    const query = db.query(`
      SELECT id, entity_id as location_id, payload_collection, payload_doc_id, last_synced_at, sync_status, error_message
      FROM payload_sync_state
      WHERE entity_id = $locationId AND payload_collection = $collection
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
 * Get all synced locations, optionally filtered by collection
 */
export function getAllSyncedLocations(
  collection?: "dining" | "accommodations" | "attractions" | "nightlife" | "key-locations"
): PayloadSyncState[] {
  try {
    const db = getDb();

    if (collection) {
      const query = db.query(`
        SELECT id, entity_id as location_id, payload_collection, payload_doc_id, last_synced_at, sync_status, error_message
        FROM payload_sync_state
        WHERE payload_collection = $collection
        ORDER BY last_synced_at DESC
      `);
      const results = query.all({ $collection: collection }) as PayloadSyncState[];
      return results;
    } else {
      const query = db.query(`
        SELECT id, entity_id as location_id, payload_collection, payload_doc_id, last_synced_at, sync_status, error_message
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
  collection: "dining" | "accommodations" | "attractions" | "nightlife" | "key-locations",
  payloadDocId: string,
  status: "success" | "failed" | "pending",
  errorMessage?: string,
  timestamp?: string
): boolean {
  try {
    const db = getDb();
    const syncTimestamp = timestamp || new Date().toISOString();

    const query = db.query(`
      INSERT INTO payload_sync_state (entity_id, payload_collection, payload_doc_id, last_synced_at, sync_status, error_message)
      VALUES ($locationId, $collection, $payloadDocId, $timestamp, $status, $errorMessage)
      ON CONFLICT(entity_id, payload_collection) DO UPDATE SET
        payload_doc_id = CASE WHEN excluded.sync_status = 'success' OR excluded.payload_doc_id <> '' THEN excluded.payload_doc_id ELSE payload_sync_state.payload_doc_id END,
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

export type PayloadCollectionSlug =
  | "dining"
  | "accommodations"
  | "attractions"
  | "nightlife"
  | "key-locations";

export interface PayloadRef {
  collection: PayloadCollectionSlug;
  docId: string;
}

export interface ResolvedPayloadRef extends PayloadRef {
  entityId: number;
}

/**
 * Bulk-resolve Payload (collection, docId) pairs to LM entity IDs.
 * Returns one row per ref that has a sync_state record; missing refs are absent.
 */
export function resolveEntityIdsByPayloadRefs(refs: PayloadRef[]): ResolvedPayloadRef[] {
  if (refs.length === 0) return [];

  const db = getDb();
  const placeholders = refs.map((_, idx) => `($c${idx}, $d${idx})`).join(", ");
  const params: Record<string, string> = {};
  refs.forEach((ref, idx) => {
    params[`$c${idx}`] = ref.collection;
    params[`$d${idx}`] = ref.docId;
  });

  const sql = `
    WITH input(payload_collection, payload_doc_id) AS (VALUES ${placeholders})
    SELECT s.payload_collection, s.payload_doc_id, s.entity_id
    FROM payload_sync_state s
    JOIN input i
      ON i.payload_collection = s.payload_collection
     AND i.payload_doc_id = s.payload_doc_id
  `;

  const rows = db.query(sql).all(params) as Array<{
    payload_collection: PayloadCollectionSlug;
    payload_doc_id: string;
    entity_id: number;
  }>;

  return rows.map((row) => ({
    collection: row.payload_collection,
    docId: row.payload_doc_id,
    entityId: row.entity_id,
  }));
}

/**
 * Delete sync state for a specific location or all locations.
 * Also clears payload_location_ref so the next sync re-resolves a fresh
 * location hierarchy ref (needed when Payload CMS is wiped/rebuilt).
 */
export function deleteSyncState(locationId?: number): boolean {
  try {
    const db = getDb();
    if (locationId !== undefined) {
      db.query("DELETE FROM payload_sync_state WHERE entity_id = $locationId")
        .run({ $locationId: locationId });
      db.query("UPDATE entities SET payload_location_ref = NULL WHERE id = $locationId")
        .run({ $locationId: locationId });
    } else {
      db.query("DELETE FROM payload_sync_state").run();
      db.query("DELETE FROM tour_payload_sync_state").run();
      db.query("UPDATE entities SET payload_location_ref = NULL").run();
    }
    return true;
  } catch (error) {
    console.error("Error deleting sync state:", error);
    return false;
  }
}
