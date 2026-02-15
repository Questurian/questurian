import { z } from "zod";

export const addInstagramEmbedSchema = z.object({
  embedCode: z
    .string()
    .min(1, "Instagram embed code is required")
    .refine(
      (code) => code.includes("instagram.com/p/") || code.includes("instagram.com/reel/"),
      "Invalid Instagram embed code. Must contain an Instagram post or reel URL."
    ),
});

export type AddInstagramEmbedFormData = z.infer<typeof addInstagramEmbedSchema>;
