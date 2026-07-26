import type { Context } from "hono";
import { BadRequestError } from "@shared/errors/http-error";
import { successResponse } from "@shared/types/api-response";
import type { UploadsService } from "../../../services/integrations/uploads.service";
import type {
  AddUploadParamsDto,
  UploadIdParamsDto,
} from "../../../validation/schemas/uploads.schemas";
import {
  parseNewImageSetUploadRequest,
  parseReplacementImageSetUploadRequest,
} from "./image-set-upload.request";

export function handleLegacyUpload(_c: Context) {
  throw new BadRequestError(
    "Legacy upload endpoint is disabled. Use /api/:category/:id/uploads/imageset with photographerCredit.",
  );
}

/**
 * POST /api/:category/:id/uploads/imageset
 * Upload a source image and all configured variants as one image set.
 */
export async function handleAddImageSetUpload(
  c: Context,
  uploads: Pick<UploadsService, "addImageSetUpload">,
) {
  const formData = await c.req.formData();
  const params = c.get("validatedParams") as AddUploadParamsDto;
  const request = parseNewImageSetUploadRequest(formData);
  const entry = await uploads.addImageSetUpload(
    params.id,
    request.sourceFile,
    request.variantFiles,
    request.photographerCredit,
    request.altText,
  );

  return c.json(successResponse({ entry }));
}

/**
 * POST /api/uploads/:id/replace-variants
 * Replace the source image and all variants for an existing image set.
 */
export async function handleReplaceUploadVariants(
  c: Context,
  uploads: Pick<UploadsService, "replaceUploadVariants">,
) {
  const formData = await c.req.formData();
  const params = c.get("validatedParams") as UploadIdParamsDto;
  const uploadId = Number.parseInt(params.id, 10);
  if (Number.isNaN(uploadId)) {
    throw new BadRequestError("Upload ID must be a number");
  }

  const request = parseReplacementImageSetUploadRequest(formData);
  const entry = await uploads.replaceUploadVariants(
    uploadId,
    request.sourceFile,
    request.variantFiles,
    request.altText,
  );

  return c.json(successResponse({ entry }));
}
