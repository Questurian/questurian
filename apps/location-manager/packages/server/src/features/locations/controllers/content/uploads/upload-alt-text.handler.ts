import type { Context } from "hono";
import { BadRequestError } from "@shared/errors/http-error";
import { successResponse } from "@shared/types/api-response";
import type { UploadsService } from "../../../services/integrations/uploads.service";
import { MAX_FILE_SIZE } from "../../../validation/schemas/uploads.schemas";

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

type AltTextService = Pick<
  UploadsService,
  "generateAltText" | "cacheStagedAltText"
>;

/**
 * POST /api/generate-alt-text
 * Generate alt text for an image preview and optionally cache it on a staged
 * image source.
 */
export async function handleGenerateAltText(
  c: Context,
  uploads: AltTextService,
) {
  const formData = await c.req.formData();
  const imageFile = formData.get("image");
  if (!(imageFile instanceof File)) {
    throw new BadRequestError("Image file required");
  }

  if (!ALLOWED_MIME_TYPES.includes(imageFile.type)) {
    throw new BadRequestError(
      "Invalid file type. Only JPEG, PNG, WebP, and GIF images are allowed.",
    );
  }

  if (imageFile.size > MAX_FILE_SIZE) {
    throw new BadRequestError(
      `File exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`,
    );
  }

  try {
    const imageBuffer = await imageFile.arrayBuffer();
    const fileExtension =
      imageFile.name.split(".").pop()?.toLowerCase() || "jpg";
    const altText = await uploads.generateAltText(
      Buffer.from(imageBuffer),
      imageFile.name,
      fileExtension,
    );

    const uploadIdRaw = formData.get("uploadId");
    if (typeof uploadIdRaw === "string" && uploadIdRaw.trim()) {
      const uploadId = Number(uploadIdRaw);
      if (!Number.isInteger(uploadId) || uploadId <= 0) {
        throw new BadRequestError("Valid uploadId required");
      }
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
