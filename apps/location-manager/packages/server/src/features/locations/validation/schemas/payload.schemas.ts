import { z } from "zod";

export const payloadSyncCategorySchema = z.enum([
  "dining",
  "accommodations",
  "attractions",
  "nightlife",
]);

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
  category: payloadSyncCategorySchema.optional()
});

// Type exports
export type SyncLocationIdDto = z.infer<typeof syncLocationIdSchema>;
export type SyncAllDto = z.infer<typeof syncAllSchema>;
export type PayloadSyncCategoryDto = z.infer<typeof payloadSyncCategorySchema>;
