import { z } from "zod";

export const createCorrectionSchema = z
  .object({
    incorrect_value: z
      .string()
      .trim()
      .min(1, "Incorrect value is required")
      .regex(
        /^[a-z0-9-]+$/,
        "Must be lowercase kebab-case (letters, numbers, hyphens only)"
      ),
    correct_value: z
      .string()
      .trim()
      .min(1, "Correct value is required")
      .regex(
        /^[a-z0-9-]+$/,
        "Must be lowercase kebab-case (letters, numbers, hyphens only)"
      ),
    part_type: z.enum(["country", "city", "neighborhood"], {
      errorMap: () => ({
        message: "Part type must be 'country', 'city', or 'neighborhood'",
      }),
    }),
  })
  .strict();

export const deleteCorrectionParamsSchema = z
  .object({
    id: z.coerce
      .number()
      .int("ID must be an integer")
      .positive("ID must be positive"),
  })
  .strict();

export type CreateCorrectionDto = z.infer<typeof createCorrectionSchema>;
export type DeleteCorrectionParamsDto = z.infer<
  typeof deleteCorrectionParamsSchema
>;
