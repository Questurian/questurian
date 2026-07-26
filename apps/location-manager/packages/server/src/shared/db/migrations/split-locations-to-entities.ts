import type { Database } from "bun:sqlite";
import {
  bumpSequence,
  dropLegacyLocationUpdatedAtTriggers,
  tableExists,
} from "./split-locations-to-entities/database";
import { ensureEntityIndexesAndTriggers } from "./split-locations-to-entities/indexes-and-triggers";
import {
  migrateLegacyChildren,
  migrateLocationsBackupIntoEntities,
  renameLegacyTable,
} from "./split-locations-to-entities/legacy-backfill";
import { ensureEntitySchema } from "./split-locations-to-entities/schema";
import { validateRowCounts } from "./split-locations-to-entities/validation";

export function splitLocationsToEntities(db: Database): void {
  const alreadyMigrated = tableExists(db, "entities");
  if (alreadyMigrated) {
    dropLegacyLocationUpdatedAtTriggers(db);
    ensureEntitySchema(db);
    ensureEntityIndexesAndTriggers(db);
    return;
  }

  db.run("PRAGMA foreign_keys = OFF");
  db.run("BEGIN TRANSACTION");

  try {
    const legacyLocationsTable = renameLegacyTable(db, "locations");
    const legacyInstagramTable = renameLegacyTable(db, "instagram_embeds");
    const legacyUploadsTable = renameLegacyTable(db, "uploads");
    const legacyPayloadSyncTable = renameLegacyTable(db, "payload_sync_state");
    const legacyTripadvisorPlacesTable = renameLegacyTable(db, "tripadvisor_places");

    dropLegacyLocationUpdatedAtTriggers(db);
    ensureEntitySchema(db);

    if (legacyLocationsTable) {
      migrateLocationsBackupIntoEntities(db, legacyLocationsTable);
    }

    migrateLegacyChildren(db, legacyInstagramTable);
    migrateLegacyChildren(db, legacyUploadsTable);
    migrateLegacyChildren(db, legacyPayloadSyncTable);
    migrateLegacyChildren(db, legacyTripadvisorPlacesTable);

    validateRowCounts(db, legacyLocationsTable);

    ensureEntityIndexesAndTriggers(db);

    bumpSequence(db, "entities");
    bumpSequence(db, "instagram_embeds");
    bumpSequence(db, "uploads");
    bumpSequence(db, "tripadvisor_places");
    bumpSequence(db, "payload_sync_state");

    db.run("COMMIT");
  } catch (error) {
    db.run("ROLLBACK");
    throw error;
  } finally {
    db.run("PRAGMA foreign_keys = ON");
  }
}
