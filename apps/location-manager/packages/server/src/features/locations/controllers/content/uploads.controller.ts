import type { Context } from "hono";
import type { ImageVariantType } from "@questurian/lm-shared";
import { ServiceContainer } from "@server/features/locations/container/service-container";
import { successResponse } from "@shared/types/api-response";
import { BadRequestError } from "@shared/errors/http-error";
import {
  MAX_FILE_SIZE,
  MAX_TOTAL_SIZE,
  type AddUploadParamsDto,
  type DeleteUploadParamsDto,
  type UploadIdParamsDto,
  type UpdateUploadPhotographerCreditBodyDto,
} from "../../validation/schemas/uploads.schemas";

const container = ServiceContainer.getInstance();

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function parseRequiredPhotographerCredit(formData: FormData): string {
  const photographerCredit = formData.get("photographerCredit");
  if (typeof photographerCredit !== "string") {
    throw new BadRequestError("Photographer credit is required");
  }

  const normalizedCredit = photographerCredit.trim();
  if (!normalizedCredit) {
    throw new BadRequestError("Photographer credit is required");
  }

  return normalizedCredit;
}

export async function postAddUpload(c: Context) {
  throw new BadRequestError(
    "Legacy upload endpoint is disabled. Use /api/:category/:id/uploads/imageset with photographerCredit."
  );
}

export async function deleteUpload(c: Context) {
  // Extract validated URL parameter
  const params = c.get("validatedParams") as DeleteUploadParamsDto;
  const uploadId = parseInt(params.id, 10);

  if (isNaN(uploadId)) {
    throw new BadRequestError("Invalid upload ID");
  }

  // Call service to delete upload (includes file cleanup)
  await container.uploadsService.deleteUpload(uploadId);

  return c.json(successResponse({ message: "Upload deleted successfully" }));
}

/**
 * PATCH /api/uploads/:id/photographer-credit
 * Update photographer credit for an existing image-set upload
 */
export async function patchUploadPhotographerCredit(c: Context) {
  const params = c.get("validatedParams") as UploadIdParamsDto;
  const body = c.get("validatedBody") as UpdateUploadPhotographerCreditBodyDto;
  const uploadId = parseInt(params.id, 10);

  if (isNaN(uploadId)) {
    throw new BadRequestError("Upload ID must be a number");
  }

  const entry = await container.uploadsService.updateUploadPhotographerCredit(
    uploadId,
    body.photographerCredit
  );

  return c.json(successResponse({ entry }));
}

/**
 * POST /api/add-upload-imageset/:id
 * Upload a multi-variant image set (source + all configured variants)
 */
export async function postAddUploadImageSet(c: Context) {
  const formData = await c.req.formData();

  // Extract validated URL parameter
  const params = c.get("validatedParams") as AddUploadParamsDto;
  const locationId = params.id;

  // Parse photographer credit
  const photographerCreditValue = parseRequiredPhotographerCredit(formData);

  // Parse alt text (optional - will generate if not provided)
  const altText = formData.get("altText");
  const altTextValue = typeof altText === "string"
    ? (altText.trim() || null)
    : null;

  // Parse source file (only expecting 1 source file for now)
  const sourceFile = formData.get("source_0");
  if (!sourceFile || !(sourceFile instanceof File)) {
    throw new BadRequestError("Source file required (source_0)");
  }

  // Validate source file
  if (!ALLOWED_MIME_TYPES.includes(sourceFile.type)) {
    throw new BadRequestError(
      `Invalid source file type. Only JPEG, PNG, WebP, and GIF images are allowed.`
    );
  }

  if (sourceFile.size > MAX_FILE_SIZE) {
    throw new BadRequestError(`Source file exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`);
  }

  // Parse variant files (expecting all configured variants)
  const variantTypes: ImageVariantType[] = [
    'thumbnail',
    'square',
    'wide',
    'social',
    'editorial',
    'portrait',
    'hero'
  ];
  const variantFiles: { type: ImageVariantType; file: File }[] = [];

  let totalSize = sourceFile.size;

  for (const type of variantTypes) {
    const fileKey = `variant_0_${type}`;
    const file = formData.get(fileKey);

    if (!file || !(file instanceof File)) {
      throw new BadRequestError(`Missing variant file: ${type} (expected key: ${fileKey})`);
    }

    // Validate variant file
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      throw new BadRequestError(
        `Invalid file type for variant "${type}". Only JPEG, PNG, WebP, and GIF images are allowed.`
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestError(`Variant "${type}" exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`);
    }

    totalSize += file.size;
    variantFiles.push({ type, file });
  }

  // Validate total size (source + all variants)
  if (totalSize > MAX_TOTAL_SIZE) {
    throw new BadRequestError(`Total upload size exceeds ${MAX_TOTAL_SIZE / 1024 / 1024}MB limit`);
  }

  // Call service to process the upload
  const entry = await container.uploadsService.addImageSetUpload(
    locationId,
    sourceFile,
    variantFiles,
    photographerCreditValue,
    altTextValue
  );

  return c.json(successResponse({ entry }));
}

/**
 * Generate alt text for an image preview (before upload)
 * POST /api/generate-alt-text
 */
export async function postGenerateAltText(c: Context) {
  const formData = await c.req.formData();

  // Parse image file
  const imageFile = formData.get("image");
  if (!imageFile || !(imageFile instanceof File)) {
    throw new BadRequestError("Image file required");
  }

  // Validate image file
  if (!ALLOWED_MIME_TYPES.includes(imageFile.type)) {
    throw new BadRequestError(
      `Invalid file type. Only JPEG, PNG, WebP, and GIF images are allowed.`
    );
  }

  if (imageFile.size > MAX_FILE_SIZE) {
    throw new BadRequestError(`File exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`);
  }

  // Generate alt text using the service
  try {
    const imageBuffer = await imageFile.arrayBuffer();
    const fileExtension = imageFile.name.split('.').pop()?.toLowerCase() || 'jpg';

    const altText = await container.uploadsService.generateAltText(
      Buffer.from(imageBuffer),
      imageFile.name,
      fileExtension
    );

    return c.json(successResponse({ altText }));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[AltText][Vertex] Failed to generate preview alt text", {
      filename: imageFile.name,
      error: errorMessage,
    });
    throw new BadRequestError("Failed to generate alt text");
  }
}
