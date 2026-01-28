import { z } from "zod";
import type { LocationCategory } from "@shared/types/location-category";

export const locationCategorySchema = z.enum([
  "dining",
  "accommodations",
  "attractions",
  "nightlife"
] as const satisfies readonly LocationCategory[]);

export const createMapsSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  address: z.string().trim().min(1, "Address is required"),
  category: locationCategorySchema,
  type: z.string().trim().optional().or(z.literal("")).transform(val => val === "" ? undefined : val),
  tripadvisorUrl: z.string().trim().url().optional().or(z.literal("")).transform(val => val === "" ? undefined : val),
});

// PATCH /api/maps/:id schema - only updatable fields allowed
export const patchMapsSchema = z.object({
  // Updatable fields only
  title: z.string().trim().min(1).optional(),
  category: locationCategorySchema.optional(),
  type: z.string().trim().optional().or(z.literal("")).transform(val => val === "" ? undefined : val),
  locationKey: z.string().trim().optional().nullable(),
  contactAddress: z.string().trim().optional(),
  countryCode: z.string().length(2).optional(),
  phoneNumber: z.string().trim().optional(),
  website: z.string().url().optional(),
  tripadvisorUrl: z.string().trim().url().optional(),

  // Reject immutable fields - these should not be present in request body
  id: z.never().optional(),
  name: z.never().optional(),
  address: z.never().optional(),
  url: z.never().optional(),
  lat: z.never().optional(),
  lng: z.never().optional(),
  created_at: z.never().optional(),
  instagram_embeds: z.never().optional(),
  uploads: z.never().optional(),

  // Reject nested response-only fields - clients should send flat fields
  contact: z.never().optional(),
  coordinates: z.never().optional(),
  source: z.never().optional(),
}).refine((data) => {
  // Ensure at least one updatable field is provided
  return data.title !== undefined ||
         data.category !== undefined ||
         data.type !== undefined ||
         data.locationKey !== undefined ||
         data.contactAddress !== undefined ||
         data.countryCode !== undefined ||
         data.phoneNumber !== undefined ||
         data.website !== undefined ||
         data.tripadvisorUrl !== undefined;
}, {
  message: "At least one field must be provided for update"
});

export type CreateMapsDto = z.infer<typeof createMapsSchema>;
export type PatchMapsDto = z.infer<typeof patchMapsSchema>;
