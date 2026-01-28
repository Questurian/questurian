import type { Context } from "hono";
import type { ImageVariantType } from "@questurian/lm-shared";
import { ServiceContainer } from "@server/features/locations/container/service-container";
import { successResponse } from "@shared/types/api-response";
import { BadRequestError, NotFoundError } from "@shared/errors/http-error";
import { MAX_FILE_SIZE, MAX_FILES, MAX_TOTAL_SIZE, type AddUploadParamsDto, type DeleteUploadParamsDto } from "../../validation/schemas/uploads.schemas";

const container = ServiceContainer.getInstance();

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export async function postAddUpload(c: Context) {
  const formData = await c.req.formData();

  // Extract validated URL parameter
  const params = c.get("validatedParams") as AddUploadParamsDto;
  const locationId = params.id;

  // Parse photographer credit
  const photographerCredit = formData.get("photographerCredit");
  const photographerCreditValue = typeof photographerCredit === "string"
    ? (photographerCredit.trim() || null)
    : null;

  // Parse files
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);

  // Validate files
  if (!files || files.length === 0) {
    throw new BadRequestError("At least one file required");
  }

  if (files.length > MAX_FILES) {
    throw new BadRequestError(`Maximum ${MAX_FILES} files allowed per upload`);
  }

  let totalSize = 0;
  for (const file of files) {
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      throw new BadRequestError(
        `Invalid file type for "${file.name}". Only JPEG, PNG, WebP, and GIF images are allowed.`
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestError(`File "${file.name}" exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`);
    }

    totalSize += file.size;
  }

  if (totalSize > MAX_TOTAL_SIZE) {
    throw new BadRequestError(`Total upload size exceeds ${MAX_TOTAL_SIZE / 1024 / 1024}MB limit`);
  }

  const entry = await container.uploadsService.addUploadFiles(locationId, files, photographerCreditValue);
  return c.json(successResponse({ entry }));
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
 * POST /api/add-upload-imageset/:id
 * Upload a multi-variant image set (source + 5 variants)
 */
export async function postAddUploadImageSet(c: Context) {
  const formData = await c.req.formData();

  // Extract validated URL parameter
  const params = c.get("validatedParams") as AddUploadParamsDto;
  const locationId = params.id;

  // Parse photographer credit
  const photographerCredit = formData.get("photographerCredit");
  const photographerCreditValue = typeof photographerCredit === "string"
    ? (photographerCredit.trim() || null)
    : null;

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

  // Parse variant files (expecting exactly 5: thumbnail, square, wide, portrait, hero)
  const variantTypes: ImageVariantType[] = ['thumbnail', 'square', 'wide', 'portrait', 'hero'];
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

  // Validate total size (source + 5 variants)
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
    console.error("Failed to generate alt text:", error);
    throw new BadRequestError("Failed to generate alt text");
  }
}
