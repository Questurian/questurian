import type { Context } from "hono";
import { ServiceContainer } from "@server/features/locations/container/service-container";
import { successResponse } from "@shared/types/api-response";
import { BadRequestError } from "@shared/errors/http-error";
import { createMapsSchema, type CreateMapsDto, type GooglePrefillDto, type PatchMapsDto } from "../../validation/schemas/maps.schemas";
import type { LocationCategory } from "../../models/location";
import type { ImageVariantType } from "@questurian/lm-shared";

const container = ServiceContainer.getInstance();

const PHOTO_IMPORT_VARIANT_TYPES: ImageVariantType[] = [
  "thumbnail",
  "square",
  "wide",
  "open_graph",
  "editorial",
  "portrait",
  "hero",
];

export async function postAddMaps(c: Context) {
  const dto = c.get("validatedBody") as CreateMapsDto;
  const routeCategory = c.get("routeCategory") as LocationCategory | undefined;
  const payload = routeCategory ? { ...dto, category: routeCategory } : dto;
  const entry = await container.mapsService.addMapsLocation(payload, routeCategory);
  return c.json(successResponse({ entry }));
}

/**
 * POST /api/{category}/with-photos
 *
 * Multipart variant of postAddMaps used by the Add-flow Photo Import path
 * (ADR-0007). The browser has already proxied Google bytes, cropped each
 * selected source through MultiVariantCropperModal client-side, and packaged
 * everything into a single multipart request. The server creates the Location
 * and writes one fully-formed image-set per source in the same handler. If any
 * image-set write fails, the just-created Location is deleted so no half-baked
 * row leaks into the catalogue (ADR-0007: "no Location row visible without its
 * image-sets").
 *
 * Multipart shape:
 *   payload   — JSON string, validated against createMapsSchema
 *   manifest  — JSON: { sources: [{ index, photographerCredit, googlePhotoName? }] }
 *   source_N  — File (the source image bytes for source N)
 *   variant_N_<type> — File (one per variant per source; all 7 mandatory)
 */
export async function postAddMapsWithPhotos(c: Context) {
  const routeCategory = c.get("routeCategory") as LocationCategory | undefined;

  let formData: FormData;
  try {
    formData = await c.req.formData();
  } catch {
    throw new BadRequestError("Expected multipart/form-data body");
  }

  const payloadRaw = formData.get("payload");
  if (typeof payloadRaw !== "string" || !payloadRaw.trim()) {
    throw new BadRequestError("payload (JSON string) required");
  }
  let payloadParsed: unknown;
  try {
    payloadParsed = JSON.parse(payloadRaw);
  } catch {
    throw new BadRequestError("payload must be valid JSON");
  }
  const payloadValidation = createMapsSchema.safeParse(payloadParsed);
  if (!payloadValidation.success) {
    const first = payloadValidation.error.issues[0];
    throw new BadRequestError(
      `payload validation failed: ${first?.path.join(".") || "(root)"} — ${first?.message}`
    );
  }
  const dto = payloadValidation.data as CreateMapsDto;
  const payload = routeCategory ? { ...dto, category: routeCategory } : dto;

  const manifestRaw = formData.get("manifest");
  if (typeof manifestRaw !== "string" || !manifestRaw.trim()) {
    throw new BadRequestError("manifest (JSON string) required");
  }
  let manifest: { sources?: Array<{ index?: number; photographerCredit?: string; googlePhotoName?: string }> };
  try {
    manifest = JSON.parse(manifestRaw);
  } catch {
    throw new BadRequestError("manifest must be valid JSON");
  }
  if (!Array.isArray(manifest.sources) || manifest.sources.length === 0) {
    throw new BadRequestError("manifest.sources must be a non-empty array");
  }

  // Pre-validate every source's bundle before mutating any state so we can
  // surface a clean 400 instead of half-creating the Location.
  const sources = manifest.sources.map((entry, i) => {
    const idx = typeof entry.index === "number" ? entry.index : i;
    if (idx !== i) {
      throw new BadRequestError(`manifest.sources[${i}].index must equal ${i}`);
    }
    const sourceField = formData.get(`source_${idx}`);
    if (!(sourceField instanceof File)) {
      throw new BadRequestError(`Missing source_${idx} file`);
    }
    const credit = typeof entry.photographerCredit === "string" ? entry.photographerCredit.trim() : "";
    if (!credit) {
      throw new BadRequestError(`manifest.sources[${idx}].photographerCredit required`);
    }
    const variants: { type: ImageVariantType; file: File }[] = [];
    for (const variantType of PHOTO_IMPORT_VARIANT_TYPES) {
      const v = formData.get(`variant_${idx}_${variantType}`);
      if (!(v instanceof File)) {
        throw new BadRequestError(`Missing variant_${idx}_${variantType} file`);
      }
      variants.push({ type: variantType, file: v });
    }
    return { index: idx, sourceFile: sourceField, variants, photographerCredit: credit };
  });

  // 1. Create the Location row.
  const entry = await container.mapsService.addMapsLocation(payload, routeCategory);
  if (!entry?.id) {
    throw new Error("addMapsLocation did not return an entry with an id");
  }
  const locationId = entry.id;

  // 2. Write each source's image-set. Best-effort rollback on any failure.
  try {
    for (const src of sources) {
      await container.uploadsService.addImageSetUpload(
        locationId,
        src.sourceFile,
        src.variants,
        src.photographerCredit,
        null
      );
    }
  } catch (err) {
    try {
      await container.locationMutationService.deleteLocationById(locationId);
    } catch (cleanupErr) {
      console.error(
        `[postAddMapsWithPhotos] Rollback delete failed for location ${locationId}:`,
        cleanupErr
      );
    }
    throw err;
  }

  return c.json(successResponse({ entry }));
}

export async function postGooglePrefill(c: Context) {
  const dto = c.get("validatedBody") as GooglePrefillDto;
  const routeCategory = c.get("routeCategory") as LocationCategory | undefined;
  const result = await container.mapsService.resolveGooglePrefill(
    dto.name,
    dto.address,
    routeCategory,
    {
      operatorTripadvisorUrl: dto.tripadvisorUrl,
      noTripadvisorListing: dto.noTripadvisorListing,
    }
  );
  return c.json(successResponse(result));
}

export async function patchMapsById(c: Context) {
  const id = parseInt(c.req.param("id"));
  const dto = c.get("validatedBody") as PatchMapsDto;
  const routeCategory = c.get("routeCategory") as LocationCategory | undefined;
  const entry = await container.mapsService.updateMapsLocationById(id, dto, routeCategory);
  return c.json(successResponse(entry));
}
