import type { Context } from "hono";
import { successResponse } from "@shared/types/api-response";
import { getTaxonomyControllerDeps } from "../dependencies";

const { taxonomy } = getTaxonomyControllerDeps();

/**
 * GET /api/admin/taxonomy/pending
 * Get all pending taxonomy entries awaiting approval
 */
export function getPendingTaxonomy(c: Context) {
  const entries = taxonomy.getPendingEntries();
  return c.json(successResponse({ entries }));
}

/**
 * PATCH /api/admin/taxonomy/:locationKey/approve
 * Approve a pending taxonomy entry
 */
export function approveTaxonomy(c: Context) {
  const locationKey = c.req.param("locationKey");
  const entry = taxonomy.approve(locationKey);
  return c.json(successResponse({ entry }));
}

/**
 * DELETE /api/admin/taxonomy/:locationKey/reject
 * Reject and delete a pending taxonomy entry
 */
export function rejectTaxonomy(c: Context) {
  const locationKey = c.req.param("locationKey");
  taxonomy.reject(locationKey);
  return c.json(successResponse({ message: "Taxonomy entry rejected" }));
}
