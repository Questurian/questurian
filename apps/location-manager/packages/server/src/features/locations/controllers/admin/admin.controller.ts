import type { Context} from "hono";
import { getDb } from "@server/shared/db/client";
import { ServiceContainer } from "@server/features/locations/container/service-container";
import { successResponse } from "@shared/types/api-response";
import { BadRequestError } from "@shared/errors/http-error";

const container = ServiceContainer.getInstance();

export async function clearDatabase(c: Context) {
  const db = getDb();

  // Discover available tables so we can support both old and new schemas
  const tableRows = db
    .query("SELECT name FROM sqlite_master WHERE type='table'")
    .all() as { name: string }[];
  const tables = new Set(tableRows.map((row) => row.name));

  // Clear all rows but keep table structure
  // New normalized tables
  if (tables.has("locations")) {
    db.run("DELETE FROM locations");
    db.run("DELETE FROM sqlite_sequence WHERE name='locations'");
  }
  if (tables.has("instagram_embeds")) {
    db.run("DELETE FROM instagram_embeds");
    db.run("DELETE FROM sqlite_sequence WHERE name='instagram_embeds'");
  }
  if (tables.has("uploads")) {
    db.run("DELETE FROM uploads");
    db.run("DELETE FROM sqlite_sequence WHERE name='uploads'");
  }

  // Legacy single table schema
  if (tables.has("location")) {
    db.run("DELETE FROM location");
    db.run("DELETE FROM sqlite_sequence WHERE name='location'");
  }

  // Clear location hierarchy/taxonomy
  if (tables.has("location_taxonomy")) {
    db.run("DELETE FROM location_taxonomy");
    db.run("DELETE FROM sqlite_sequence WHERE name='location_taxonomy'");
  }

  // Clear taxonomy corrections
  if (tables.has("taxonomy_corrections")) {
    db.run("DELETE FROM taxonomy_corrections");
    db.run("DELETE FROM sqlite_sequence WHERE name='taxonomy_corrections'");
  }

  // Clear Payload sync state
  if (tables.has("payload_sync_state")) {
    db.run("DELETE FROM payload_sync_state");
    db.run("DELETE FROM sqlite_sequence WHERE name='payload_sync_state'");
  }

  // Clean up file size after mass deletes
  db.run("VACUUM");

  const clearedTables = Array.from(tables).filter((name) =>
    ["locations", "instagram_embeds", "uploads", "location", "location_taxonomy", "taxonomy_corrections", "payload_sync_state"].includes(name)
  );

  return c.json({
    success: true,
    message: `Database cleared successfully${clearedTables.length ? ` (${clearedTables.join(", ")})` : ""}`,
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
    FROM locations
    ORDER BY id DESC
  `).all();

  return c.json(successResponse({ locationRefs }));
}
