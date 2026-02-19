import { z } from "zod";
import type { LocationCategory } from "@questurian/lm-shared";
import { isValidIdealForTag } from "@questurian/lm-shared";

const locationCategorySchema = z.enum([
  "dining",
  "accommodations",
  "attractions",
  "nightlife"
] as const satisfies readonly LocationCategory[]);

const idealForSchema = z
  .array(z.string().trim().min(1, "Ideal For tags cannot be empty"))
  .max(4, "Select up to 4 Ideal For tags")
  .refine((tags) => new Set(tags).size === tags.length, {
    message: "Ideal For tags must be unique",
  });

function validateCategoryIdealFor(
  category: LocationCategory,
  idealFor: string[] | undefined,
  ctx: z.RefinementCtx
) {
  const requiresIdealFor = category === "dining" || category === "attractions";

  if (requiresIdealFor && (!idealFor || idealFor.length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["idealFor"],
      message: "Select at least 1 Ideal For tag",
    });
    return;
  }

  if (!idealFor || idealFor.length === 0) {
    return;
  }

  idealFor.forEach((tag, index) => {
    if (isValidIdealForTag(category, tag)) return;

    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["idealFor", index],
      message: `"${tag}" is not a valid tag for ${category}`,
    });
  });
}

function addLocationBaseSchema() {
  return z.object({
    name: z
      .string()
      .min(1, "Location name is required")
      .max(200, "Name must be less than 200 characters"),
    address: z
      .string()
      .min(1, "Address is required")
      .max(500, "Address must be less than 500 characters"),
    category: locationCategorySchema,
    idealFor: idealForSchema.optional(),
    type: z.string().optional().or(z.literal("")).transform(val => val === "" ? undefined : val),
    tripadvisorUrl: z
      .string()
      .url("TripAdvisor URL must be a valid URL")
      .optional()
      .or(z.literal(""))
      .transform(val => val === "" ? undefined : val),
  });
}

export const addLocationSchema = addLocationBaseSchema().superRefine((data, ctx) => {
  validateCategoryIdealFor(data.category, data.idealFor, ctx);
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

// Batch upload item schema - same required fields as addLocationSchema
export const batchItemSchema = addLocationBaseSchema().superRefine((data, ctx) => {
  validateCategoryIdealFor(data.category, data.idealFor, ctx);
});

export const batchUploadSchema = z.array(batchItemSchema).min(1, "At least one location is required");

export type BatchItem = z.infer<typeof batchItemSchema>;
export type BatchUploadData = z.infer<typeof batchUploadSchema>;
