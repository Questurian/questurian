import { z } from "zod";
import { parseLocationValue } from "../../utils/location-utils";

const absoluteUrlSchema = z
  .string()
  .trim()
  .url("Booking link must be a valid URL");

export const listToursQuerySchema = z.object({
  query: z
    .string()
    .trim()
    .transform((value) => value || undefined)
    .optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  ids: z
    .string()
    .trim()
    .transform((value) => {
      if (!value) return undefined;
      const ids = value
        .split(",")
        .map((item) => Number(item.trim()))
        .filter((id) => Number.isInteger(id) && id > 0);
      return ids.length > 0 ? Array.from(new Set(ids)) : undefined;
    })
    .optional(),
});

export const tourIdParamsSchema = z.object({
  id: z.coerce.number().int().positive("Tour ID must be positive"),
});

const optionalLocationKeySchema = z
  .string()
  .trim()
  .max(500)
  .optional()
  .refine(
    (value) => value === undefined || value.length === 0 || parseLocationValue(value) !== null,
    "Location key must be pipe-separated (e.g. country|city|neighborhood)"
  );

const nullableTrimmedTextSchema = z
  .string()
  .trim()
  .max(1000)
  .nullable()
  .optional();

export const createTourSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  imgPayloadMediaSetId: z.string().trim().min(1, "Image media-set ID is required"),
  bookingLink: absoluteUrlSchema,
  price: z.string().trim().min(1, "Price is required").max(80),
  locationKey: optionalLocationKeySchema,
  sourceProvider: nullableTrimmedTextSchema,
  sourceUrl: absoluteUrlSchema.nullable().optional(),
  sourceTitle: nullableTrimmedTextSchema,
  sourceImageUrl: absoluteUrlSchema.nullable().optional(),
  sourceProductCode: nullableTrimmedTextSchema,
});

export const updateTourSchema = createTourSchema
  .partial()
  .extend({
    locationKey: z.union([z.string().trim().max(500), z.literal(""), z.null()]).optional(),
  })
  .superRefine((data, ctx) => {
    const v = data.locationKey;
    if (v === undefined || v === null || v === "") return;
    if (parseLocationValue(v) === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["locationKey"],
        message: "Location key must be pipe-separated (e.g. country|city|neighborhood)",
      });
    }
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    "At least one field must be provided for update"
  );

export type ListToursQueryDto = z.infer<typeof listToursQuerySchema>;
export type TourIdParamsDto = z.infer<typeof tourIdParamsSchema>;
export type CreateTourDto = z.infer<typeof createTourSchema>;
export type UpdateTourDto = z.infer<typeof updateTourSchema>;

export const tourImportPreviewSchema = z.object({
  url: z.string().trim().url("Tour URL must be a valid URL"),
});

export const tourTitleSuggestionSchema = z.object({
  sourceTitle: z.string().trim().min(1).max(300),
  description: z.string().trim().max(3000).nullable().optional(),
  provider: z.string().trim().max(80).nullable().optional(),
  duration: z.string().trim().max(120).nullable().optional(),
  price: z.string().trim().max(80).nullable().optional(),
  locationKey: z.string().trim().max(500).nullable().optional(),
});

export const tourSourceImageQuerySchema = z.object({
  url: z.string().trim().url("Source image URL must be a valid URL"),
});

export type TourImportPreviewDto = z.infer<typeof tourImportPreviewSchema>;
export type TourTitleSuggestionDto = z.infer<typeof tourTitleSuggestionSchema>;
export type TourSourceImageQueryDto = z.infer<typeof tourSourceImageQuerySchema>;
