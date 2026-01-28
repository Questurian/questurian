import { z } from "zod";
import { locationCategorySchema } from "./maps.schemas";

/**
 * Schema for syncing a single location by ID (path parameter)
 * POST /api/payload/sync/:id
 */
export const syncLocationIdSchema = z.object({
  id: z.coerce.number().int("ID must be an integer").positive("ID must be positive")
});

/**
 * Schema for syncing all locations with optional category filter
 * POST /api/payload/sync-all
 */
export const syncAllSchema = z.object({
  category: locationCategorySchema.optional()
});

/**
 * Schema for getting sync status (optional ID path parameter)
 * GET /api/payload/sync-status/:id?
 */
export const getSyncStatusIdSchema = z.object({
  id: z.coerce.number().int("ID must be an integer").positive("ID must be positive").optional()
});

// Type exports
export type SyncLocationIdDto = z.infer<typeof syncLocationIdSchema>;
export type SyncAllDto = z.infer<typeof syncAllSchema>;
export type GetSyncStatusIdDto = z.infer<typeof getSyncStatusIdSchema>;
