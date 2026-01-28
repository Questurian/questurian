import { z } from "zod";

export const addInstagramParamsSchema = z.object({
  id: z.coerce.number().int().positive("Valid location ID required")
});

export type AddInstagramParamsDto = z.infer<typeof addInstagramParamsSchema>;

export const addInstagramSchema = z.object({
  embedCode: z.string().min(1, "Embed code is required")
});

export type AddInstagramDto = z.infer<typeof addInstagramSchema>;

export const deleteInstagramEmbedParamsSchema = z.object({
  id: z.string().transform((val) => parseInt(val, 10))
    .refine((val) => !isNaN(val) && val > 0, {
      message: "ID must be a positive integer",
    }),
});

export type DeleteInstagramEmbedParams = z.infer<typeof deleteInstagramEmbedParamsSchema>;
