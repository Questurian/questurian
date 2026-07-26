import type { Context } from "hono";
import { BadRequestError } from "@shared/errors/http-error";
import { successResponse } from "@shared/types/api-response";
import type { UploadsService } from "../../../services/integrations/uploads.service";
import type {
  DeleteUploadParamsDto,
  UploadIdParamsDto,
  UpdateUploadPhotographerCreditBodyDto,
} from "../../../validation/schemas/uploads.schemas";

export async function handleDeleteUpload(
  c: Context,
  uploads: Pick<UploadsService, "deleteUpload">,
) {
  const params = c.get("validatedParams") as DeleteUploadParamsDto;
  const uploadId = Number.parseInt(params.id, 10);
  if (Number.isNaN(uploadId)) {
    throw new BadRequestError("Invalid upload ID");
  }

  await uploads.deleteUpload(uploadId);
  return c.json(successResponse({ message: "Upload deleted successfully" }));
}

export async function handleUpdateUploadPhotographerCredit(
  c: Context,
  uploads: Pick<UploadsService, "updateUploadPhotographerCredit">,
) {
  const params = c.get("validatedParams") as UploadIdParamsDto;
  const body = c.get("validatedBody") as UpdateUploadPhotographerCreditBodyDto;
  const uploadId = Number.parseInt(params.id, 10);
  if (Number.isNaN(uploadId)) {
    throw new BadRequestError("Upload ID must be a number");
  }

  const entry = await uploads.updateUploadPhotographerCredit(
    uploadId,
    body.photographerCredit,
  );

  return c.json(successResponse({ entry }));
}

export async function handleReprocessUploadVariants(
  c: Context,
  uploads: Pick<UploadsService, "reprocessUploadVariants">,
) {
  const params = c.get("validatedParams") as UploadIdParamsDto;
  const uploadId = Number.parseInt(params.id, 10);
  if (Number.isNaN(uploadId)) {
    throw new BadRequestError("Upload ID must be a number");
  }

  const entry = await uploads.reprocessUploadVariants(uploadId);
  return c.json(successResponse({ entry }));
}
