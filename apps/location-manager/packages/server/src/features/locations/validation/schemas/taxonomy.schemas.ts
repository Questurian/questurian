import { z } from "zod";

export const taxonomyLocationKeyParamsSchema = z.object({
  locationKey: z.string().min(1, "LocationKey is required")
});

export type TaxonomyLocationKeyParamsDto = z.infer<typeof taxonomyLocationKeyParamsSchema>;
