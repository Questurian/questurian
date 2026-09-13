import { z } from "zod";

/** Google Place IDs to look up. A list screen checks every place on it at once. */
export const locationsByPlaceIdsSchema = z.object({
  placeIds: z
    .array(z.string().trim().min(1, "placeId is required"))
    .min(1, "At least one placeId is required")
    .max(200, "Up to 200 placeIds per request"),
});

export type LocationsByPlaceIdsDto = z.infer<typeof locationsByPlaceIdsSchema>;
