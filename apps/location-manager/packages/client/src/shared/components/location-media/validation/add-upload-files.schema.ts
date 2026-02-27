import { z } from "zod";

export const addUploadFilesSchema = z.object({
  photographerCredit: z.string().trim().min(1, "Photographer credit is required"),
});

export type AddUploadFilesFormData = z.infer<typeof addUploadFilesSchema>;
