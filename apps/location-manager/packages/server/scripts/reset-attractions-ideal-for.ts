import { closeDb, getDb, initDb } from "../src/shared/db/client";
import type { Database } from "bun:sqlite";

type AttractionsRow = {
  entityId: number;
  idealForJson: string | null;
  attractionsDetailsJson: string | null;
};

export interface ResetAttractionsIdealForResult {
  processedLocations: number;
  clearedIdealForRows: number;
  strippedNestedIdealForRows: number;
  clearedSyncStates: number;
  clearedPayloadRefs: number;
}

export function stripAttractionsIdealForFromDetails(
  detailsJson: string | null
): string | null {
  if (!detailsJson || detailsJson.trim().length === 0) {
    return detailsJson;
  }

  try {
    const parsed = JSON.parse(detailsJson);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return detailsJson;
    }

    const root = parsed as Record<string, unknown>;
    const visit = root.visit;
    if (!visit || typeof visit !== "object" || Array.isArray(visit)) {
      return detailsJson;
    }

    if (!Object.prototype.hasOwnProperty.call(visit, "ideal_for")) {
      return detailsJson;
    }

    const nextVisit = { ...(visit as Record<string, unknown>) };
    delete nextVisit.ideal_for;

    return JSON.stringify({
      ...root,
      visit: nextVisit,
    });
  } catch {
    return detailsJson;
  }
}

export function resetAttractionsIdealForData(
  db: Database
): ResetAttractionsIdealForResult {
  const rows = db
    .query(
      `
        SELECT
          entity_id AS entityId,
          ideal_for_json AS idealForJson,
          attractions_details_json AS attractionsDetailsJson
        FROM attractions_locations
      `
    )
    .all() as AttractionsRow[];

  let clearedIdealForRows = 0;
  let strippedNestedIdealForRows = 0;

  const updateAttractionRow = db.query(
    `
      UPDATE attractions_locations
      SET
        ideal_for_json = $idealForJson,
        attractions_details_json = $attractionsDetailsJson
      WHERE entity_id = $entityId
    `
  );

  const transaction = db.transaction(() => {
    for (const row of rows) {
      const nextDetailsJson = stripAttractionsIdealForFromDetails(
        row.attractionsDetailsJson
      );
      const shouldClearIdealFor = row.idealForJson !== null;
      const shouldStripNestedIdealFor = nextDetailsJson !== row.attractionsDetailsJson;

      if (!shouldClearIdealFor && !shouldStripNestedIdealFor) {
        continue;
      }

      if (shouldClearIdealFor) {
        clearedIdealForRows++;
      }

      if (shouldStripNestedIdealFor) {
        strippedNestedIdealForRows++;
      }

      updateAttractionRow.run({
        $entityId: row.entityId,
        $idealForJson: null,
        $attractionsDetailsJson: nextDetailsJson,
      });
    }

    const clearedSyncStates = db
      .query(`DELETE FROM payload_sync_state WHERE payload_collection = 'attractions'`)
      .run().changes;

    const clearedPayloadRefs = db
      .query(
        `
          UPDATE entities
          SET payload_location_ref = NULL
          WHERE category = 'attractions' AND payload_location_ref IS NOT NULL
        `
      )
      .run().changes;

    return {
      processedLocations: rows.length,
      clearedIdealForRows,
      strippedNestedIdealForRows,
      clearedSyncStates,
      clearedPayloadRefs,
    };
  });

  return transaction();
}

async function main() {
  console.log("🧹 Resetting attractions Ideal For data and Payload sync state...\n");

  initDb();
  const db = getDb();
  const result = resetAttractionsIdealForData(db);

  console.log(`Processed attraction rows: ${result.processedLocations}`);
  console.log(`Cleared top-level ideal_for_json rows: ${result.clearedIdealForRows}`);
  console.log(
    `Stripped nested visit.ideal_for rows: ${result.strippedNestedIdealForRows}`
  );
  console.log(`Deleted attraction sync-state rows: ${result.clearedSyncStates}`);
  console.log(`Cleared attraction payload_location_ref values: ${result.clearedPayloadRefs}`);
  console.log("\n✅ Attractions Ideal For reset complete.");
}

if (import.meta.main) {
  main()
    .catch((error) => {
      console.error("❌ Failed to reset attractions Ideal For data:", error);
      process.exitCode = 1;
    })
    .finally(() => {
      closeDb();
    });
}
