import type { Context } from "hono";
import { successResponse } from "@shared/types/api-response";
import type { LocationsByPlaceIdsDto } from "../../validation/schemas/place-ids.schemas";
import { findLocationsByPlaceIds } from "../../repositories/core/location-place-id.repository";

/**
 * POST /api/locations/by-place-ids
 *
 * Which of these Google Place IDs Location Manager already holds. Answers for
 * every ID asked about, so a caller can tell "not here" from "not asked", and
 * lists every match, so two rows sharing one ID are visible to the caller.
 */
export function postLocationsByPlaceIds(c: Context) {
  const dto = c.get("validatedBody") as LocationsByPlaceIdsDto;
  const rows = findLocationsByPlaceIds(dto.placeIds);
  const results = [...new Set(dto.placeIds)].map((placeId) => ({
    placeId,
    locations: rows
      .filter((row) => row.placeId === placeId)
      .map(({ id, name, category }) => ({ id, name, category })),
  }));
  return c.json(successResponse({ results }));
}
