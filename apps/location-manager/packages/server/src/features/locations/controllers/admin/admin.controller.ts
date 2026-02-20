import type { Context} from "hono";
import { getDb } from "@server/shared/db/client";
import { ServiceContainer } from "@server/features/locations/container/service-container";
import { successResponse } from "@shared/types/api-response";
import { BadRequestError } from "@shared/errors/http-error";

const container = ServiceContainer.getInstance();

export async function clearDatabase(c: Context) {
  const db = getDb();
  const normalizedTables = [
    "entities",
    "dining_locations",
    "nightlife_locations",
    "accommodations_locations",
    "attractions_locations",
    "key_locations_locations",
    "instagram_embeds",
    "uploads",
    "tripadvisor_places",
    "location_taxonomy",
    "taxonomy_corrections",
    "payload_sync_state",
  ] as const;

  db.run("BEGIN TRANSACTION");
  try {
    // Parent first cascades typed/media tables; explicit deletes keep intent obvious.
    db.run("DELETE FROM entities");
    db.run("DELETE FROM dining_locations");
    db.run("DELETE FROM nightlife_locations");
    db.run("DELETE FROM accommodations_locations");
    db.run("DELETE FROM attractions_locations");
    db.run("DELETE FROM key_locations_locations");
    db.run("DELETE FROM instagram_embeds");
    db.run("DELETE FROM uploads");
    db.run("DELETE FROM tripadvisor_places");
    db.run("DELETE FROM location_taxonomy");
    db.run("DELETE FROM taxonomy_corrections");
    db.run("DELETE FROM payload_sync_state");

    db.run("DELETE FROM sqlite_sequence WHERE name='entities'");
    db.run("DELETE FROM sqlite_sequence WHERE name='instagram_embeds'");
    db.run("DELETE FROM sqlite_sequence WHERE name='uploads'");
    db.run("DELETE FROM sqlite_sequence WHERE name='tripadvisor_places'");
    db.run("DELETE FROM sqlite_sequence WHERE name='location_taxonomy'");
    db.run("DELETE FROM sqlite_sequence WHERE name='taxonomy_corrections'");
    db.run("DELETE FROM sqlite_sequence WHERE name='payload_sync_state'");

    db.run("COMMIT");
  } catch (error) {
    db.run("ROLLBACK");
    throw error;
  }

  // Clean up file size after mass deletes
  db.run("VACUUM");

  return c.json({
    success: true,
    message: `Database cleared successfully (${normalizedTables.join(", ")})`,
  });
}

export async function scanOrphanedFiles(c: Context) {
  const result = await container.imageStorage.scanOrphanedFiles();

  return c.json(successResponse({
    totalOrphanedFiles: result.totalOrphanedFiles,
    totalSizeBytes: result.totalSizeBytes,
    orphanedByLocation: Object.fromEntries(result.orphanedByLocation)
  }));
}

export async function cleanupOrphanedFiles(c: Context) {
  const { confirm } = c.req.query();

  if (confirm !== "true") {
    throw new BadRequestError("Must set confirm=true to proceed with cleanup");
  }

  const scanResult = await container.imageStorage.scanOrphanedFiles();
  const allOrphanedPaths = Array.from(scanResult.orphanedByLocation.values())
    .flatMap(loc => loc.paths);

  const deletionResult = await container.imageStorage.deleteOrphanedFiles(allOrphanedPaths);

  return c.json(successResponse({
    deletedCount: deletionResult.deletedCount,
    failedCount: deletionResult.failedCount,
    errors: deletionResult.errors
  }));
}

export function getPayloadLocationRefs(c: Context) {
  const db = getDb();

  const locationRefs = db.query(`
    SELECT
      id,
      name,
      locationKey,
      payload_location_ref,
      created_at
    FROM entities
    ORDER BY id DESC
  `).all();

  return c.json(successResponse({ locationRefs }));
}
