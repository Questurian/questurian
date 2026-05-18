import { z } from "zod";

export const payloadCollectionSlugSchema = z.enum([
  "dining",
  "accommodations",
  "attractions",
  "nightlife",
  "key-locations",
]);

export const payloadRefSchema = z.object({
  collection: payloadCollectionSlugSchema,
  docId: z.string().trim().min(1, "docId is required"),
});

export const locationsByPayloadRefsSchema = z.object({
  refs: z
    .array(payloadRefSchema)
    .min(1, "At least one ref is required")
    .max(50, "Up to 50 refs per request"),
});

export type LocationsByPayloadRefsDto = z.infer<typeof locationsByPayloadRefsSchema>;
