import { z } from "zod";

export const payloadSyncCategorySchema = z.enum([
  "dining",
  "accommodations",
  "attractions",
  "nightlife",
  "key_locations",
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

export const payloadMediaSetsQuerySchema = z.object({
  query: z
    .string()
    .trim()
    .transform((value) => value || undefined)
    .optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(50).optional(),
  ids: z
    .string()
    .trim()
    .transform((value) => {
      if (!value) return undefined;

      const ids = value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

      return ids.length > 0 ? ids : undefined;
    })
    .optional(),
});

// Type exports
export type SyncLocationIdDto = z.infer<typeof syncLocationIdSchema>;
export type SyncAllDto = z.infer<typeof syncAllSchema>;
export type PayloadSyncCategoryDto = z.infer<typeof payloadSyncCategorySchema>;
export type PayloadMediaSetsQueryDto = z.infer<typeof payloadMediaSetsQuerySchema>;
