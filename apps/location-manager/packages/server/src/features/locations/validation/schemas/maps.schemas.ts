import { z } from "zod";
import { ACCOMMODATIONS_SUGGESTION_FIELD_KEYS } from "@shared/types/accommodations-options";
import { LOCATION_CATEGORIES } from "@shared/types/location-category";
import type { LocationCategory } from "@shared/types/location-category";
import { getIdealForTags, isValidIdealForTag } from "@shared/types/location-ideal-for";

export const locationCategorySchema = z.enum([
  "dining",
  "accommodations",
  "attractions",
  "nightlife",
  "key_locations",
] as const satisfies readonly LocationCategory[]);

const idealForTagsSchema = z
  .array(z.string().trim().min(1, "Ideal For tags cannot be empty"))
  .min(1, "Select at least 1 Ideal For tag")
  .max(4, "Select up to 4 Ideal For tags")
  .refine((tags) => new Set(tags).size === tags.length, {
    message: "Ideal For tags must be unique",
  });

const selectedPayloadMediaSetIdsSchema = z
  .array(z.string().trim().min(1, "Payload media-set ID cannot be empty"))
  .max(20, "Select up to 20 Payload media sets")
  .refine((ids) => new Set(ids).size === ids.length, {
    message: "Payload media-set IDs must be unique",
  });

const tourIdsSchema = z
  .array(z.coerce.number().int().positive("Tour ID must be positive"))
  .refine((ids) => new Set(ids).size === ids.length, {
    message: "Tour IDs must be unique",
  });

function validateIdealForTagsForCategory(
  category: LocationCategory,
  tags: string[] | undefined,
  ctx: z.RefinementCtx
) {
  if (category === "attractions") return;
  if (!tags) return;

  tags.forEach((tag, index) => {
    if (isValidIdealForTag(category, tag)) return;

    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["idealFor", index],
      message: `Invalid Ideal For tag "${tag}" for ${category}. Allowed tags: ${getIdealForTags(category).join(", ")}`,
    });
  });
}

const recordOrStringSchema = z.union([
  z.record(z.any()),
  z.string().trim(),
]);

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
  menuUrl: z.string().trim().url().optional().or(z.literal("")).transform(val => val === "" ? undefined : val),
  reservationUrl: z.string().trim().url().optional().or(z.literal("")).transform(val => val === "" ? undefined : val),
  idealFor: idealForTagsSchema.optional(),
  type: z.string().trim().optional().or(z.literal("")).transform(val => val === "" ? undefined : val),
  tripadvisorUrl: z.string().trim().url().optional().or(z.literal("")).transform(val => val === "" ? undefined : val),
  email: z.string().trim().email().optional().or(z.literal("")),
  neighborhoodDescription: z.string().trim().optional().or(z.literal("")),
  nightlifeDetails: recordOrStringSchema.optional().or(z.literal("")).transform(val => val === "" ? undefined : val),
  accommodationsDetails: recordOrStringSchema.optional().or(z.literal("")).transform(val => val === "" ? undefined : val),
  attractionsDetails: recordOrStringSchema.optional().or(z.literal("")).transform(val => val === "" ? undefined : val),
  keyLocationsDetails: recordOrStringSchema.optional().or(z.literal("")).transform(val => val === "" ? undefined : val),
  operationHours: recordOrStringSchema.optional(),
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
  tourIds: tourIdsSchema.optional(),
}).superRefine((data, ctx) => {
  validateIdealForTagsForCategory(data.category, data.idealFor, ctx);

  if (data.category === "nightlife" && data.nightlifeDetails === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["nightlifeDetails"],
      message: "Nightlife details JSON is required for nightlife category",
    });
  }

  if (data.category === "accommodations" && data.accommodationsDetails === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["accommodationsDetails"],
      message: "Accommodations details JSON is required for accommodations category",
    });
  }

  if (data.category === "attractions" && data.attractionsDetails === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["attractionsDetails"],
      message: "Attractions details JSON is required for attractions category",
    });
  }

  if (data.category === "key_locations" && data.keyLocationsDetails === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["keyLocationsDetails"],
      message: "Key locations details JSON is required for key_locations category",
    });
  }

  if (
    (data.category === "dining" || data.category === "nightlife") &&
    (!data.idealFor || data.idealFor.length === 0)
  ) {
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

const accommodationsOptionSchema = z.object({
  value: z.string().trim().min(1),
  label: z.string().trim().min(1),
  description: z.string().trim().optional().default(""),
});

export const fieldSuggestionSchema = z.object({
  category: z.enum(LOCATION_CATEGORIES),
  locationId: z.number().int().positive().optional(),
  fieldKey: z.enum(ACCOMMODATIONS_SUGGESTION_FIELD_KEYS),
  formValues: z.record(z.any()).refine((values) => {
    const name = typeof values.name === "string" ? values.name.trim() : "";
    const address = typeof values.address === "string" ? values.address.trim() : "";
    return name.length > 0 && address.length > 0;
  }, "Run Step 1 with a valid name and address before requesting AI suggestions."),
  apiContext: z.record(z.any()).optional(),
  allowedOptions: z.array(accommodationsOptionSchema).optional(),
});

// PATCH /api/maps/:id schema - only updatable fields allowed
export const patchMapsSchema = z.object({
  // Updatable fields only
  name: z.string().trim().min(1).optional(),
  address: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  category: z.never().optional(),
  type: z.string().trim().optional().or(z.literal("")).transform(val => val === "" ? null : val),
  locationKey: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .transform(val => val === "" ? null : val)
    .refine(
      (val) => val === undefined || val === null || /^[a-z0-9-]+(\|[a-z0-9-]+){0,2}$/.test(val),
      "Invalid locationKey format. Expected: country or country|city or country|city|neighborhood"
    ),
  district: z.string().trim().optional().or(z.literal("")).transform(val => val === "" ? null : val),
  contactAddress: z.string().trim().optional().or(z.literal("")).transform(val => val === "" ? null : val),
  countryCode: z.union([z.string().length(2), z.literal("")]).optional().transform(val => val === "" ? null : val),
  ianaTimeId: z.string().trim().optional().or(z.literal("")).transform(val => val === "" ? null : val),
  phoneNumber: z.string().trim().optional().or(z.literal("")).transform(val => val === "" ? null : val),
  website: z.string().trim().url().optional().or(z.literal("")).transform(val => val === "" ? null : val),
  menuUrl: z.string().trim().url().optional().or(z.literal("")).transform(val => val === "" ? null : val),
  reservationUrl: z.string().trim().url().optional().or(z.literal("")).transform(val => val === "" ? null : val),
  tripadvisorUrl: z.string().trim().url().optional().or(z.literal("")).transform(val => val === "" ? null : val),
  email: z.string().trim().email().optional().or(z.literal("")).transform(val => val === "" ? null : val),
  neighborhoodDescription: z.string().trim().optional().or(z.literal("")).transform(val => val === "" ? null : val),
  idealFor: idealForTagsSchema.optional(),
  nightlifeDetails: recordOrStringSchema.optional().or(z.literal("")).transform(val => val === "" ? null : val),
  accommodationsDetails: recordOrStringSchema.optional().or(z.literal("")).transform(val => val === "" ? null : val),
  attractionsDetails: recordOrStringSchema.optional().or(z.literal("")).transform(val => val === "" ? null : val),
  keyLocationsDetails: recordOrStringSchema.optional().or(z.literal("")).transform(val => val === "" ? null : val),
  priceLevel: z.string().trim().optional().or(z.literal("")).transform(val => val === "" ? null : val),
  placeId: z.string().trim().optional().or(z.literal("")).transform(val => val === "" ? null : val),
  selectedPayloadMediaSetIds: selectedPayloadMediaSetIdsSchema.optional().nullable(),
  tourIds: tourIdsSchema.optional(),
  operationHours: recordOrStringSchema.optional(),
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
  autoApproveTaxonomy: z.boolean().optional(),

  // Reject immutable fields - these should not be present in request body
  id: z.never().optional(),
  url: z.never().optional(),
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
         data.lat !== undefined ||
         data.lng !== undefined ||
         data.type !== undefined ||
         data.locationKey !== undefined ||
         data.district !== undefined ||
         data.contactAddress !== undefined ||
         data.countryCode !== undefined ||
         data.ianaTimeId !== undefined ||
         data.phoneNumber !== undefined ||
         data.website !== undefined ||
         data.menuUrl !== undefined ||
         data.reservationUrl !== undefined ||
         data.placeId !== undefined ||
         data.tripadvisorUrl !== undefined ||
         data.email !== undefined ||
         data.neighborhoodDescription !== undefined ||
         data.idealFor !== undefined ||
         data.nightlifeDetails !== undefined ||
         data.accommodationsDetails !== undefined ||
         data.attractionsDetails !== undefined ||
         data.keyLocationsDetails !== undefined ||
         data.selectedPayloadMediaSetIds !== undefined ||
         data.tourIds !== undefined ||
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
export type FieldSuggestionDto = z.infer<typeof fieldSuggestionSchema>;
export type PatchMapsDto = z.infer<typeof patchMapsSchema>;
