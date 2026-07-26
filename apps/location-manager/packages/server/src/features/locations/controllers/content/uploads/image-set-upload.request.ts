import type {
  ImageVariantType,
  VariantCropRegion,
} from "@questurian/lm-shared";
import { BadRequestError } from "@shared/errors/http-error";
import {
  MAX_FILE_SIZE,
  MAX_TOTAL_SIZE,
} from "../../../validation/schemas/uploads.schemas";

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

export const REQUIRED_VARIANT_TYPES = [
  "thumbnail",
  "square",
  "wide",
  "open_graph",
  "editorial",
  "portrait",
  "hero",
] as const satisfies readonly ImageVariantType[];

export type ImageSetVariantUpload = {
  type: ImageVariantType;
  file: File;
  cropRegion?: VariantCropRegion;
};

export interface NewImageSetUploadRequest {
  sourceFile: File;
  variantFiles: ImageSetVariantUpload[];
  photographerCredit: string;
  altText: string | null;
}

export interface ReplacementImageSetUploadRequest {
  sourceFile: File;
  variantFiles: ImageSetVariantUpload[];
  altText: string | undefined;
}

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
 * Values are pixel coordinates in the source image and let Questura reproduce
 * each crop server-side per ADR 0002.
 */
function parseCropRegions(
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
    throw new BadRequestError(
      "cropRegions_0 must be an object keyed by variant type",
    );
  }

  const result: Partial<Record<ImageVariantType, VariantCropRegion>> = {};
  for (const [key, value] of Object.entries(
    parsed as Record<string, unknown>,
  )) {
    if (!REQUIRED_VARIANT_TYPES.includes(key as ImageVariantType)) {
      throw new BadRequestError(
        `cropRegions_0 has unknown variant key: ${key}`,
      );
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

function parseImageSetFiles(formData: FormData): {
  sourceFile: File;
  variantFiles: ImageSetVariantUpload[];
} {
  const sourceFile = formData.get("source_0");
  if (!(sourceFile instanceof File)) {
    throw new BadRequestError("Source file required (source_0)");
  }

  if (!ALLOWED_MIME_TYPES.includes(sourceFile.type)) {
    throw new BadRequestError(
      "Invalid source file type. Only JPEG, PNG, and WebP images are allowed.",
    );
  }

  if (sourceFile.size > MAX_FILE_SIZE) {
    throw new BadRequestError(
      `Source file exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`,
    );
  }

  const cropRegions = parseCropRegions(formData);
  const variantFiles: ImageSetVariantUpload[] = [];
  let totalSize = sourceFile.size;

  for (const type of REQUIRED_VARIANT_TYPES) {
    const fileKey = `variant_0_${type}`;
    const file = formData.get(fileKey);

    if (!(file instanceof File)) {
      throw new BadRequestError(
        `Missing variant file: ${type} (expected key: ${fileKey})`,
      );
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      throw new BadRequestError(
        `Invalid file type for variant "${type}". Only JPEG, PNG, and WebP images are allowed.`,
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestError(
        `Variant "${type}" exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`,
      );
    }

    totalSize += file.size;
    variantFiles.push({
      type,
      file,
      ...(cropRegions[type] ? { cropRegion: cropRegions[type] } : {}),
    });
  }

  if (totalSize > MAX_TOTAL_SIZE) {
    throw new BadRequestError(
      `Total upload size exceeds ${MAX_TOTAL_SIZE / 1024 / 1024}MB limit`,
    );
  }

  return { sourceFile, variantFiles };
}

export function parseNewImageSetUploadRequest(
  formData: FormData,
): NewImageSetUploadRequest {
  const photographerCredit = parseRequiredPhotographerCredit(formData);
  const altText = formData.get("altText");
  const altTextValue =
    typeof altText === "string" ? altText.trim() || null : null;

  return {
    ...parseImageSetFiles(formData),
    photographerCredit,
    altText: altTextValue,
  };
}

export function parseReplacementImageSetUploadRequest(
  formData: FormData,
): ReplacementImageSetUploadRequest {
  const altText = formData.get("altText");

  return {
    ...parseImageSetFiles(formData),
    altText: typeof altText === "string" ? altText : undefined,
  };
}
