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

export const addLocationSchema = z.object({
  name: z
    .string()
    .min(1, "Location name is required")
    .max(200, "Name must be less than 200 characters"),
  address: z
    .string()
    .min(1, "Address is required")
    .max(500, "Address must be less than 500 characters"),
  category: locationCategorySchema,
  idealFor: idealForSchema,
  type: z.string().optional().or(z.literal("")).transform(val => val === "" ? undefined : val),
  tripadvisorUrl: z
    .string()
    .url("TripAdvisor URL must be a valid URL")
    .optional()
    .or(z.literal(""))
    .transform(val => val === "" ? undefined : val),
});

export const confirmLocationSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(200, "Title must be less than 200 characters"),
  phoneNumber: z
    .string()
    .optional()
    .or(z.literal(""))
    .transform(val => val === "" ? undefined : val),
  website: z
    .string()
    .optional()
    .or(z.literal(""))
    .transform(val => val === "" ? undefined : val),
});

export type ConfirmLocationFormData = z.infer<typeof confirmLocationSchema>;

export type AddLocationFormData = z.infer<typeof addLocationSchema>;
