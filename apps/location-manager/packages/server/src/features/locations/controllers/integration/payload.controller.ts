import type { Context } from "hono";
import { ServiceContainer } from "@server/features/locations/container/service-container";
import { successResponse } from "@shared/types/api-response";
import type {
  SyncLocationIdDto,
  SyncAllDto,
  PayloadMediaSetsQueryDto,
} from "../../validation/schemas/payload.schemas";
import type { LocationsByPayloadRefsDto } from "../../validation/schemas/payload-refs.schemas";
import type { TourIdParamsDto } from "../../validation/schemas/tours.schemas";
import * as PayloadSyncRepo from "../../repositories/integration/payload-sync.repository";
import { getEditorialLocationsByPayloadRefs } from "../../services/integrations/payload-refs.service";

const container = ServiceContainer.getInstance();

/**
 * POST /api/payload/locations/by-refs
 * Bulk-hydrate LM Locations given Payload (collection, docId) pairs.
 * Used by ABW to enrich listicle blurb generation with canonical venue facts
 * and an on-demand Reviews Digest cached per venue (invalidated by reviewsFetchedAt).
 */
export async function postLocationsByPayloadRefs(c: Context) {
  const dto = c.get("validatedBody") as LocationsByPayloadRefsDto;
  const results = await getEditorialLocationsByPayloadRefs(dto.refs, {
    altTextApiClient: container.altTextApiClient,
  });
  return c.json(successResponse({ results }));
}

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
 * POST /api/payload/sync-tour/:id
 * Upsert a single tour into Payload CMS `tours` collection.
 */
export async function postSyncTour(c: Context) {
  const { id } = c.get("validatedParams") as TourIdParamsDto;
  const result = await container.payloadSyncService.syncTourToPayload(id);
  return c.json(successResponse({ result }));
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
 * DELETE /api/payload/sync-state
 * Delete sync state for a specific location or all locations
 */
export async function deletePayloadSyncState(c: Context) {
  const body = await c.req.json().catch(() => ({}));
  const locationId: number | undefined =
    typeof body?.locationId === "number" ? body.locationId : undefined;

  PayloadSyncRepo.deleteSyncState(locationId);

  return c.json(successResponse({ reset: true, locationId: locationId ?? "all" }));
}

/**
 * GET /api/payload/media-sets
 * Search existing Payload media sets for attraction card selection
 */
export async function getPayloadMediaSets(c: Context) {
  const query = c.get("validatedQuery") as PayloadMediaSetsQueryDto;
  const result = await container.payloadApi.searchMediaSets(query);

  return c.json(
    successResponse({
      mediaSets: result.docs,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
      totalDocs: result.totalDocs,
      hasNextPage: result.hasNextPage,
      hasPrevPage: result.hasPrevPage,
      nextPage: result.nextPage,
      prevPage: result.prevPage,
    })
  );
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
