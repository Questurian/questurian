import { z } from "zod";
import type { LocationCategory } from "@shared/types/location-category";

const locationCategorySchema = z.enum([
  "dining",
  "accommodations",
  "attractions",
  "nightlife"
] as const satisfies readonly LocationCategory[]);

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
