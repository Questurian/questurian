import { z } from "zod";
import { locationCategorySchema } from "./maps.schemas";

export const listLocationsQuerySchema = z.object({
  category: locationCategorySchema.optional(),
  locationKey: z.string()
    .trim()
    .regex(/^[a-z0-9-]+(\|[a-z0-9-]+){0,2}$/,
      "Invalid locationKey format. Expected: country or country|city or country|city|neighborhood")
    .optional(),
}).strict();

export const deleteLocationSlugSchema = z.object({
  slug: z.string()
    .trim()
    .min(1, "Slug is required")
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase kebab-case (letters, numbers, hyphens only)")
    .max(100, "Slug is too long")
}).strict();

export const deleteLocationIdSchema = z.object({
  id: z.coerce.number()
    .int("ID must be an integer")
    .positive("ID must be positive")
}).strict();

export type ListLocationsQueryDto = z.infer<typeof listLocationsQuerySchema>;
export type DeleteLocationSlugDto = z.infer<typeof deleteLocationSlugSchema>;
export type DeleteLocationIdDto = z.infer<typeof deleteLocationIdSchema>;
