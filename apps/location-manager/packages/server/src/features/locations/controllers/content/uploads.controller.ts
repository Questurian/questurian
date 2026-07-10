import type { Context } from "hono";
import type { ImageVariantType, VariantCropRegion } from "@questurian/lm-shared";
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
import { getUploadsControllerDeps } from "../dependencies";

const { uploads } = getUploadsControllerDeps();

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const REQUIRED_VARIANT_TYPES: ImageVariantType[] = [
  "thumbnail",
  "square",
  "wide",
  "open_graph",
  "editorial",
  "portrait",
  "hero",
];

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

function isVariantCropRegion(value: unknown): value is VariantCropRegion {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.left === "number" &&
    typeof candidate.top === "number" &&
    typeof candidate.width === "number" &&
    typeof candidate.height === "number"
  );
}

/**
 * Parse the optional `cropRegions_0` sidecar JSON sent by the LM upload form.
 * Format: `{ "<variantType>": { left, top, width, height }, ... }` (pixels in
 * the source image). Persisted on each ImageVariant so the Questura
 * `from-source` pipeline can reproduce the crops server-side per ADR 0002.
 */
function parseCropRegionsForUpload(
  formData: FormData,
): Partial<Record<ImageVariantType, VariantCropRegion>> {
  const raw = formData.get("cropRegions_0");
  if (typeof raw !== "string" || !raw.trim()) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new BadRequestError("cropRegions_0 must be valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new BadRequestError("cropRegions_0 must be an object keyed by variant type");
  }
  const result: Partial<Record<ImageVariantType, VariantCropRegion>> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!REQUIRED_VARIANT_TYPES.includes(key as ImageVariantType)) {
      throw new BadRequestError(`cropRegions_0 has unknown variant key: ${key}`);
    }
    if (!isVariantCropRegion(value)) {
      throw new BadRequestError(
        `cropRegions_0[${key}] must be { left, top, width, height } numbers`,
      );
    }
    result[key as ImageVariantType] = value;
  }
  return result;
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
  await uploads.deleteUpload(uploadId);

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

  const entry = await uploads.updateUploadPhotographerCredit(
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
      `Invalid source file type. Only JPEG, PNG, and WebP images are allowed.`
    );
  }

  if (sourceFile.size > MAX_FILE_SIZE) {
    throw new BadRequestError(`Source file exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`);
  }

  const cropRegions = parseCropRegionsForUpload(formData);

  // Parse variant files (expecting all configured variants)
  const variantFiles: {
    type: ImageVariantType;
    file: File;
    cropRegion?: VariantCropRegion;
  }[] = [];

  let totalSize = sourceFile.size;

  for (const type of REQUIRED_VARIANT_TYPES) {
    const fileKey = `variant_0_${type}`;
    const file = formData.get(fileKey);

    if (!file || !(file instanceof File)) {
      throw new BadRequestError(`Missing variant file: ${type} (expected key: ${fileKey})`);
    }

    // Validate variant file
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      throw new BadRequestError(
        `Invalid file type for variant "${type}". Only JPEG, PNG, and WebP images are allowed.`
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestError(`Variant "${type}" exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`);
    }

    totalSize += file.size;
    variantFiles.push({
      type,
      file,
      ...(cropRegions[type] ? { cropRegion: cropRegions[type] } : {}),
    });
  }

  // Validate total size (source + all variants)
  if (totalSize > MAX_TOTAL_SIZE) {
    throw new BadRequestError(`Total upload size exceeds ${MAX_TOTAL_SIZE / 1024 / 1024}MB limit`);
  }

  // Call service to process the upload
  const entry = await uploads.addImageSetUpload(
    locationId,
    sourceFile,
    variantFiles,
    photographerCreditValue,
    altTextValue
  );

  return c.json(successResponse({ entry }));
}

/**
 * POST /api/uploads/:id/reprocess-variants
 * Regenerate all configured variants from the stored source image.
 * Only allowed when the upload has fewer than 7 variants.
 */
export async function postReprocessUploadVariants(c: Context) {
  const params = c.get("validatedParams") as UploadIdParamsDto;
  const uploadId = parseInt(params.id, 10);

  if (isNaN(uploadId)) {
    throw new BadRequestError("Upload ID must be a number");
  }

  const entry = await uploads.reprocessUploadVariants(uploadId);

  return c.json(successResponse({ entry }));
}

/**
 * POST /api/uploads/:id/replace-variants
 * Replace source + all variants for an existing image-set upload.
 */
export async function postReplaceUploadVariants(c: Context) {
  const formData = await c.req.formData();
  const params = c.get("validatedParams") as UploadIdParamsDto;
  const uploadId = parseInt(params.id, 10);

  if (isNaN(uploadId)) {
    throw new BadRequestError("Upload ID must be a number");
  }

  const altText = formData.get("altText");
  const altTextValue = typeof altText === "string" ? altText : undefined;

  const sourceFile = formData.get("source_0");
  if (!sourceFile || !(sourceFile instanceof File)) {
    throw new BadRequestError("Source file required (source_0)");
  }

  if (!ALLOWED_MIME_TYPES.includes(sourceFile.type)) {
    throw new BadRequestError(
      `Invalid source file type. Only JPEG, PNG, and WebP images are allowed.`
    );
  }

  if (sourceFile.size > MAX_FILE_SIZE) {
    throw new BadRequestError(`Source file exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`);
  }

  const cropRegions = parseCropRegionsForUpload(formData);

  const variantFiles: {
    type: ImageVariantType;
    file: File;
    cropRegion?: VariantCropRegion;
  }[] = [];
  let totalSize = sourceFile.size;

  for (const type of REQUIRED_VARIANT_TYPES) {
    const fileKey = `variant_0_${type}`;
    const file = formData.get(fileKey);

    if (!file || !(file instanceof File)) {
      throw new BadRequestError(`Missing variant file: ${type} (expected key: ${fileKey})`);
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      throw new BadRequestError(
        `Invalid file type for variant "${type}". Only JPEG, PNG, and WebP images are allowed.`
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestError(`Variant "${type}" exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`);
    }

    totalSize += file.size;
    variantFiles.push({
      type,
      file,
      ...(cropRegions[type] ? { cropRegion: cropRegions[type] } : {}),
    });
  }

  if (totalSize > MAX_TOTAL_SIZE) {
    throw new BadRequestError(`Total upload size exceeds ${MAX_TOTAL_SIZE / 1024 / 1024}MB limit`);
  }

  const entry = await uploads.replaceUploadVariants(
    uploadId,
    sourceFile,
    variantFiles,
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

    const altText = await uploads.generateAltText(
      Buffer.from(imageBuffer),
      imageFile.name,
      fileExtension
    );
    const uploadIdRaw = formData.get("uploadId");
    if (typeof uploadIdRaw === "string" && uploadIdRaw.trim()) {
      const uploadId = Number(uploadIdRaw);
      if (!Number.isInteger(uploadId) || uploadId <= 0) throw new BadRequestError("Valid uploadId required");
      uploads.cacheStagedAltText(uploadId, altText);
    }

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
