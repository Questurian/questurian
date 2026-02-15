import { z } from "zod";
import type { LocationCategory } from "@shared/types/location-category";
import { IDEAL_FOR_TAGS } from "@shared/types/location-ideal-for";

const locationCategorySchema = z.enum([
  "dining",
  "accommodations",
  "attractions",
  "nightlife"
] as const satisfies readonly LocationCategory[]);

const idealForSchema = z
  .array(z.enum(IDEAL_FOR_TAGS))
  .min(1, "Select at least 1 Ideal For tag")
  .max(4, "Select up to 4 Ideal For tags")
  .refine((tags) => new Set(tags).size === tags.length, {
    message: "Ideal For tags must be unique",
  });

export const editLocationSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(200, "Name must be less than 200 characters")
    .optional(),
  address: z
    .string()
    .min(1, "Address is required")
    .max(500, "Address must be less than 500 characters")
    .optional(),
  title: z
    .string()
    .max(200, "Title must be less than 200 characters")
    .optional(),
  category: locationCategorySchema.optional(),
  idealFor: idealForSchema,
  type: z.string().optional().or(z.literal("")),
  locationKey: z.string().optional().or(z.literal("")),
  district: z.string().optional().or(z.literal("")),
  countryCode: z.string().length(2, "Country code must be 2 letters").optional().or(z.literal("")),
  ianaTimeId: z.string().optional().or(z.literal("")),
  placeId: z.string().optional().or(z.literal("")),
  phoneNumber: z
    .string()
    .max(20, "Phone number must be less than 20 characters")
    .optional(),
  website: z
    .string()
    .url("Website must be a valid URL")
    .optional()
    .or(z.literal("")),
  email: z
    .string()
    .email("Email must be a valid email address")
    .optional()
    .or(z.literal("")),
  neighborhoodDescription: z
    .string()
    .max(2000, "Neighborhood description must be less than 2000 characters")
    .optional()
    .or(z.literal("")),
  operationHours: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine((val) => {
      if (!val) return true;
      try {
        JSON.parse(val);
        return true;
      } catch {
        return false;
      }
    }, { message: "Operation hours must be valid JSON" }),
  priceLevel: z
    .string()
    .max(50, "Price level must be less than 50 characters")
    .optional()
    .or(z.literal("")),
  tripadvisorUrl: z
    .string()
    .url("TripAdvisor URL must be a valid URL")
    .optional()
    .or(z.literal("")),
  tripadvisorMealTypes: z
    .string()
    .max(2000, "Meal types must be less than 2000 characters")
    .optional()
    .or(z.literal("")),
  tripadvisorCuisines: z
    .string()
    .max(2000, "Cuisines must be less than 2000 characters")
    .optional()
    .or(z.literal("")),
  tripadvisorFeatures: z
    .string()
    .max(4000, "Features must be less than 4000 characters")
    .optional()
    .or(z.literal("")),
});

export type EditLocationFormData = z.infer<typeof editLocationSchema>;
