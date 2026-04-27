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

export const createTourSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  imgPayloadMediaSetId: z.string().trim().min(1, "Image media-set ID is required"),
  bookingLink: absoluteUrlSchema,
  price: z.string().trim().min(1, "Price is required").max(80),
  locationKey: optionalLocationKeySchema,
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
