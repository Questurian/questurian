import { z } from "zod";

// URL parameter schema for /api/add-upload/:id
export const addUploadParamsSchema = z.object({
  id: z.coerce.number().int().positive("Valid location ID required")
});

export type AddUploadParamsDto = z.infer<typeof addUploadParamsSchema>;

// URL parameter schema for DELETE /api/uploads/:id
export const deleteUploadParamsSchema = z.object({
  id: z.string().regex(/^\d+$/, "Upload ID must be a number"),
});

export type DeleteUploadParamsDto = z.infer<typeof deleteUploadParamsSchema>;

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif"
] as const;

type AllowedMimeType = typeof ALLOWED_MIME_TYPES[number];

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const MAX_TOTAL_SIZE = 50 * 1024 * 1024; // 50MB
export const MAX_FILES = 20;

export const uploadFileSchema = z.custom<File>(
  (file) => file instanceof File,
  "Must be a file"
).refine(
  (file) => ALLOWED_MIME_TYPES.includes(file.type as AllowedMimeType),
  "Only JPEG, PNG, WebP, and GIF images allowed"
).refine(
  (file) => file.size <= MAX_FILE_SIZE,
  `File size must be less than ${MAX_FILE_SIZE / 1024 / 1024}MB`
);

export const uploadFormDataSchema = z.object({
  // locationId removed - now comes from URL parameter (:id)
  photographerCredit: z.string().trim().optional().nullable(),
  files: z.array(uploadFileSchema)
    .min(1, "At least one file required")
    .max(MAX_FILES, `Maximum ${MAX_FILES} files allowed`)
    .refine(
      (files) => {
        const totalSize = files.reduce((sum, file) => sum + file.size, 0);
        return totalSize <= MAX_TOTAL_SIZE;
      },
      `Total size must be less than ${MAX_TOTAL_SIZE / 1024 / 1024}MB`
    )
});

export type UploadFormDataDto = z.infer<typeof uploadFormDataSchema>;
