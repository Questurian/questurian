import type { Context } from "hono";
import { ServiceContainer } from "@server/features/locations/container/service-container";
import { successResponse } from "@shared/types/api-response";
import type { SyncLocationIdDto, SyncAllDto } from "../../validation/schemas/payload.schemas";

const container = ServiceContainer.getInstance();

/**
 * POST /api/payload/sync/:id
 * Sync a single location to Payload CMS
 */
export async function postSyncLocation(c: Context) {
  const { id } = c.get("validatedParams") as SyncLocationIdDto;
  const result = await container.payloadSyncService.syncLocation(id);
  return c.json(successResponse({ result }));
}

/**
 * POST /api/payload/sync-all
 * Sync all locations to Payload CMS (optionally filtered by category)
 */
export async function postSyncAll(c: Context) {
  const dto = c.get("validatedBody") as SyncAllDto;
  const results = await container.payloadSyncService.syncAllLocations(dto.category);
  return c.json(successResponse({ results }));
}

/**
 * GET /api/payload/sync-status/:id?
 * Get sync status for a location or all locations
 */
export async function getSyncStatus(c: Context) {
  const idParam = c.req.param("id");
  const locationId = idParam ? parseInt(idParam) : undefined;

  const status = container.payloadSyncService.getSyncStatus(locationId);
  return c.json(successResponse({ status }));
}

/**
 * GET /api/payload/test-connection
 * Test connection to Payload CMS by attempting authentication
 */
export async function getTestConnection(c: Context) {
  try {
    if (!container.payloadApi.isConfigured()) {
      return c.json({
        connected: false,
        error: "Payload CMS not configured. Check environment variables."
      });
    }

    await container.payloadApi.authenticate();

    return c.json({
      connected: true,
      message: "Successfully connected to Payload CMS"
    });
  } catch (error) {
    return c.json({
      connected: false,
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
}
