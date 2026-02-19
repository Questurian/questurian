import { z } from "zod";
import type { LocationCategory } from "@shared/types/location-category";
import { IDEAL_FOR_TAGS } from "@shared/types/location-ideal-for";

export const locationCategorySchema = z.enum([
  "dining",
  "accommodations",
  "attractions",
  "nightlife"
] as const satisfies readonly LocationCategory[]);

const idealForTagSchema = z.enum(IDEAL_FOR_TAGS);

const idealForTagsSchema = z
  .array(idealForTagSchema)
  .min(1, "Select at least 1 Ideal For tag")
  .max(4, "Select up to 4 Ideal For tags")
  .refine((tags) => new Set(tags).size === tags.length, {
    message: "Ideal For tags must be unique",
  });

export const createMapsSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  address: z.string().trim().min(1, "Address is required"),
  category: locationCategorySchema,
  title: z.string().trim().optional().or(z.literal("")).transform(val => val === "" ? undefined : val),
  url: z.string().trim().url().optional().or(z.literal("")).transform(val => val === "" ? undefined : val),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  locationKey: z.string()
    .trim()
    .regex(/^[a-z0-9-]+(\|[a-z0-9-]+){0,2}$/, "Invalid locationKey format. Expected: country or country|city or country|city|neighborhood")
    .optional()
    .or(z.literal(""))
    .transform(val => val === "" ? undefined : val),
  district: z.string().trim().optional().or(z.literal("")).transform(val => val === "" ? undefined : val),
  contactAddress: z.string().trim().optional().or(z.literal("")).transform(val => val === "" ? undefined : val),
  countryCode: z
    .union([z.string().length(2), z.literal("")])
    .optional()
    .transform(val => (val === "" || val === undefined ? undefined : val.toUpperCase())),
  ianaTimeId: z.string().trim().optional().or(z.literal("")).transform(val => val === "" ? undefined : val),
  placeId: z.string().trim().optional().or(z.literal("")).transform(val => val === "" ? undefined : val),
  phoneNumber: z.string().trim().optional().or(z.literal("")).transform(val => val === "" ? undefined : val),
  website: z.string().trim().url().optional().or(z.literal("")).transform(val => val === "" ? undefined : val),
  idealFor: idealForTagsSchema.optional(),
  type: z.string().trim().optional().or(z.literal("")).transform(val => val === "" ? undefined : val),
  tripadvisorUrl: z.string().trim().url().optional().or(z.literal("")).transform(val => val === "" ? undefined : val),
  email: z.string().trim().email().optional().or(z.literal("")),
  neighborhoodDescription: z.string().trim().optional().or(z.literal("")),
  nightlifeDetails: z.union([
    z.record(z.any()),
    z.string().trim(),
  ]).optional().or(z.literal("")).transform(val => val === "" ? undefined : val),
  accommodationsDetails: z.union([
    z.record(z.any()),
    z.string().trim(),
  ]).optional().or(z.literal("")).transform(val => val === "" ? undefined : val),
  operationHours: z.union([
    z.record(z.any()),
    z.string().trim(),
  ]).optional(),
  priceLevel: z.string().trim().optional().or(z.literal("")).transform(val => val === "" ? undefined : val),
  tripadvisorMealTypes: z.union([
    z.array(z.string().trim()),
    z.string().trim(),
  ]).optional().or(z.literal("")).transform(val => val === "" ? undefined : val),
  tripadvisorCuisines: z.union([
    z.array(z.string().trim()),
    z.string().trim(),
  ]).optional().or(z.literal("")).transform(val => val === "" ? undefined : val),
  tripadvisorFeatures: z.union([
    z.array(z.string().trim()),
    z.string().trim(),
  ]).optional().or(z.literal("")).transform(val => val === "" ? undefined : val),
  reviewsEnabled: z.boolean().optional(),
}).superRefine((data, ctx) => {
  if (data.category === "nightlife") {
    if (data.nightlifeDetails === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["nightlifeDetails"],
        message: "Nightlife details JSON is required for nightlife category",
      });
    }
    return;
  }

  if (data.category === "accommodations") {
    if (data.accommodationsDetails === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["accommodationsDetails"],
        message: "Accommodations details JSON is required for accommodations category",
      });
    }
    return;
  }

  if ((data.category === "dining" || data.category === "attractions") && (!data.idealFor || data.idealFor.length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["idealFor"],
      message: "Ideal For is required",
    });
  }
});

export const googlePrefillSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  address: z.string().trim().min(1, "Address is required"),
});

// PATCH /api/maps/:id schema - only updatable fields allowed
export const patchMapsSchema = z.object({
  // Updatable fields only
  name: z.string().trim().min(1).optional(),
  address: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1).optional(),
  category: z.never().optional(),
  type: z.string().trim().optional().or(z.literal("")).transform(val => val === "" ? null : val),
  locationKey: z.string().trim().optional().or(z.literal("")).transform(val => val === "" ? null : val),
  district: z.string().trim().optional().or(z.literal("")).transform(val => val === "" ? null : val),
  contactAddress: z.string().trim().optional().or(z.literal("")).transform(val => val === "" ? null : val),
  countryCode: z.union([z.string().length(2), z.literal("")]).optional().transform(val => val === "" ? null : val),
  ianaTimeId: z.string().trim().optional().or(z.literal("")).transform(val => val === "" ? null : val),
  phoneNumber: z.string().trim().optional().or(z.literal("")).transform(val => val === "" ? null : val),
  website: z.string().trim().url().optional().or(z.literal("")).transform(val => val === "" ? null : val),
  tripadvisorUrl: z.string().trim().url().optional().or(z.literal("")).transform(val => val === "" ? null : val),
  email: z.string().trim().email().optional().or(z.literal("")).transform(val => val === "" ? null : val),
  neighborhoodDescription: z.string().trim().optional().or(z.literal("")).transform(val => val === "" ? null : val),
  idealFor: idealForTagsSchema.optional(),
  nightlifeDetails: z.union([
    z.record(z.any()),
    z.string().trim(),
  ]).optional().or(z.literal("")).transform(val => val === "" ? null : val),
  accommodationsDetails: z.union([
    z.record(z.any()),
    z.string().trim(),
  ]).optional().or(z.literal("")).transform(val => val === "" ? null : val),
  priceLevel: z.string().trim().optional().or(z.literal("")).transform(val => val === "" ? null : val),
  placeId: z.string().trim().optional().or(z.literal("")).transform(val => val === "" ? null : val),
  operationHours: z.union([
    z.record(z.any()),
    z.string().trim(),
  ]).optional(),
  tripadvisorMealTypes: z.union([
    z.array(z.string().trim()),
    z.string().trim(),
  ]).optional().or(z.literal("")).transform(val => val === "" ? null : val),
  tripadvisorCuisines: z.union([
    z.array(z.string().trim()),
    z.string().trim(),
  ]).optional().or(z.literal("")).transform(val => val === "" ? null : val),
  tripadvisorFeatures: z.union([
    z.array(z.string().trim()),
    z.string().trim(),
  ]).optional().or(z.literal("")).transform(val => val === "" ? null : val),
  reviewsEnabled: z.boolean().optional(),

  // Reject immutable fields - these should not be present in request body
  id: z.never().optional(),
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
         data.name !== undefined ||
         data.address !== undefined ||
         data.type !== undefined ||
         data.locationKey !== undefined ||
         data.district !== undefined ||
         data.contactAddress !== undefined ||
         data.countryCode !== undefined ||
         data.ianaTimeId !== undefined ||
         data.phoneNumber !== undefined ||
         data.website !== undefined ||
         data.placeId !== undefined ||
         data.tripadvisorUrl !== undefined ||
         data.email !== undefined ||
         data.neighborhoodDescription !== undefined ||
         data.idealFor !== undefined ||
         data.nightlifeDetails !== undefined ||
         data.accommodationsDetails !== undefined ||
         data.operationHours !== undefined ||
         data.priceLevel !== undefined ||
         data.tripadvisorMealTypes !== undefined ||
         data.tripadvisorCuisines !== undefined ||
         data.tripadvisorFeatures !== undefined ||
         data.reviewsEnabled !== undefined;
}, {
  message: "At least one field must be provided for update"
});

export type CreateMapsDto = z.infer<typeof createMapsSchema>;
export type GooglePrefillDto = z.infer<typeof googlePrefillSchema>;
export type PatchMapsDto = z.infer<typeof patchMapsSchema>;
