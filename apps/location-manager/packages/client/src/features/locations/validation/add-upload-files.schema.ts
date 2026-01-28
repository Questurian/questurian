import { z } from "zod";

export const addUploadFilesSchema = z.object({
  photographerCredit: z.string().min(1, "Photographer credit is required"),
});

export type AddUploadFilesFormData = z.infer<typeof addUploadFilesSchema>;
