import type { Context } from "hono";
import { ServiceContainer } from "@server/features/locations/container/service-container";
import { successResponse } from "@shared/types/api-response";

const container = ServiceContainer.getInstance();

/**
 * GET /api/admin/taxonomy/pending
 * Get all pending taxonomy entries awaiting approval
 */
export function getPendingTaxonomy(c: Context) {
  const entries = container.taxonomyService.getPendingEntries();
  return c.json(successResponse({ entries }));
}

/**
 * PATCH /api/admin/taxonomy/:locationKey/approve
 * Approve a pending taxonomy entry
 */
export function approveTaxonomy(c: Context) {
  const locationKey = c.req.param("locationKey");
  const entry = container.taxonomyService.approve(locationKey);
  return c.json(successResponse({ entry }));
}

/**
 * DELETE /api/admin/taxonomy/:locationKey/reject
 * Reject and delete a pending taxonomy entry
 */
export function rejectTaxonomy(c: Context) {
  const locationKey = c.req.param("locationKey");
  container.taxonomyService.reject(locationKey);
  return c.json(successResponse({ message: "Taxonomy entry rejected" }));
}
