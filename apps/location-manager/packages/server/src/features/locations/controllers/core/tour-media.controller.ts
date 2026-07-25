import type { Context } from "hono";
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import type { ImageVariantType } from "@questurian/lm-shared";
import { BadRequestError } from "@shared/errors/http-error";
import { successResponse } from "@shared/types/api-response";
import {
  getFileExtension,
  sanitizeLocationName,
} from "../../utils/location-utils";
import { getToursControllerDeps } from "../dependencies";

const { payloadApi } = getToursControllerDeps();
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

function parseRequiredText(
  formData: FormData,
  key: string,
  label: string
): string {
  const value = formData.get(key);
  if (typeof value !== "string" || !value.trim()) {
    throw new BadRequestError(`${label} is required`);
  }
  return value.trim();
}

function parseOptionalText(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function assertImageFile(file: File, label: string) {
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new BadRequestError(
      `${label} must be a JPEG, PNG, or WebP image.`
    );
  }
}

async function fileToBuffer(file: File): Promise<Buffer> {
  return Buffer.from(await file.arrayBuffer());
}

export async function postTourMediaSet(c: Context) {
  if (!payloadApi.isConfigured()) {
    throw new BadRequestError("Payload CMS is not configured");
  }

  const formData = await c.req.formData();
  const title = parseRequiredText(formData, "title", "Title");
  const photographerCredit = parseRequiredText(
    formData,
    "photographerCredit",
    "Photographer credit"
  );
  const altText = parseOptionalText(formData, "altText") ?? title;
  const sourceFile = formData.get("source_0");

  if (!sourceFile || !(sourceFile instanceof File)) {
    throw new BadRequestError("Source file required (source_0)");
  }
  assertImageFile(sourceFile, "Source file");

  const variantFiles: { type: ImageVariantType; file: File }[] = [];
  for (const type of REQUIRED_VARIANT_TYPES) {
    const file = formData.get(`variant_0_${type}`);
    if (!file || !(file instanceof File)) {
      throw new BadRequestError(`Missing variant file: ${type}`);
    }
    assertImageFile(file, `Variant "${type}"`);
    variantFiles.push({ type, file });
  }

  const externalRef = `tour-image-${Date.now()}-${randomUUID()}`;
  const mediaSetId = await payloadApi.createMediaSet({
    title,
    alt_text: altText,
    photographer_credit: photographerCredit,
    externalRef,
    tags: [],
  });

  const safeTitle = sanitizeLocationName(title);
  for (const { type, file } of variantFiles) {
    const imageBuffer = await fileToBuffer(file);
    const extension = getFileExtension(file.name);
    const filename = `${safeTitle}_${type}.${extension}`;
    await payloadApi.uploadImage(imageBuffer, filename, altText, {
      photographerCredit,
      mediaSet: mediaSetId,
      variant: type,
    });
  }

  return c.json(successResponse({ mediaSetId }));
}
