import type { Context } from "hono";
import { ServiceContainer } from "@server/features/locations/container/service-container";
import { successResponse } from "@shared/types/api-response";
import { BadRequestError } from "@shared/errors/http-error";
import {
  getUploadsByLocationId,
} from "@server/features/locations/repositories/content";
import type { ImageSetUpload } from "@server/features/locations/models/location";
import type { PhotoImportStartRequest, PhotoImportRejectRequest } from "@questurian/lm-shared";

const container = ServiceContainer.getInstance();

function parseId(c: Context, key: string = "id"): number {
  const raw = c.req.param(key);
  const id = Number(raw);
  if (!Number.isFinite(id) || id <= 0) throw new BadRequestError(`Invalid ${key}`);
  return id;
}

/** GET /api/locations/:id/photo-import/preview */
export async function getPhotoImportPreview(c: Context) {
  const locationId = parseId(c);
  const preview = await container.photoImportService.preview(locationId);
  return c.json(successResponse({ preview }));
}

/**
 * GET /api/photo-import/preview-by-place?placeId=X
 * Pre-Create preview before a Location row exists. All photos status='new'.
 */
export async function getPhotoImportPreviewByPlace(c: Context) {
  const placeId = c.req.query("placeId");
  if (!placeId) throw new BadRequestError("placeId required");
  const preview = await container.photoImportService.previewByPlaceId(placeId);
  return c.json(successResponse({ preview }));
}

/**
 * GET /api/photo-import/proxy?name=places/{id}/photos/{photoName}
 * Resolves the Places media signed URL server-side and streams the bytes back.
 * Used by the Add-flow pre-Create crop pipeline (ADR-0007) so the browser can
 * feed real image bytes into MultiVariantCropperModal before any Location row
 * exists. Same operator-auth gate as the preview endpoints.
 */
export async function getPhotoImportProxy(c: Context) {
  const photoName = c.req.query("name");
  if (!photoName) throw new BadRequestError("name required");
  if (!photoName.startsWith("places/")) {
    throw new BadRequestError("name must be a places/{id}/photos/{photoName} reference");
  }

  const maxWidthRaw = c.req.query("maxWidth");
  const maxWidth = maxWidthRaw ? Number(maxWidthRaw) : undefined;
  if (maxWidthRaw && (!Number.isFinite(maxWidth) || maxWidth! <= 0 || maxWidth! > 4800)) {
    throw new BadRequestError("maxWidth must be a positive number <= 4800");
  }

  const bytes = await container.photoImportService.proxyPhotoBytes(photoName, maxWidth);
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, max-age=300",
      "Content-Length": String(bytes.length),
    },
  });
}

/** POST /api/locations/:id/photo-import/start */
export async function postPhotoImportStart(c: Context) {
  const locationId = parseId(c);
  const body = (await c.req.json().catch(() => null)) as PhotoImportStartRequest | null;
  if (!body || !Array.isArray(body.photos)) {
    throw new BadRequestError("photos array required");
  }
  for (const p of body.photos) {
    if (!p || typeof p.photoName !== "string" || !p.photoName) {
      throw new BadRequestError("each photo requires a photoName");
    }
  }
  const result = await container.photoImportService.start(locationId, body.photos);
  return c.json(successResponse({ result }));
}

/**
 * GET /api/locations/:id/photo-import/sources
 * Returns the current StagedSource status snapshot for polling.
 */
export async function getPhotoImportSources(c: Context) {
  const locationId = parseId(c);
  const uploads = getUploadsByLocationId(locationId)
    .filter((u): u is ImageSetUpload => !!(u as ImageSetUpload).googlePhotoName);

  const sources = uploads.map((u) => ({
    uploadId: u.id!,
    googlePhotoName: u.googlePhotoName!,
    stagedSourceStatus: u.stagedSourceStatus ?? null,
    errorMessage: u.errorMessage ?? null,
    hasSource: !!u.imageSet?.sourceImage?.path,
    hasVariants: (u.imageSet?.variants?.length ?? 0) > 0,
    sourcePath: u.imageSet?.sourceImage?.path ?? null,
    altText: u.imageSet?.altText ?? null,
    photographerCredit: u.imageSet?.photographerCredit ?? null,
  }));

  return c.json(successResponse({ sources }));
}

/** POST /api/locations/:id/photo-import/reject */
export async function postPhotoImportReject(c: Context) {
  const locationId = parseId(c);
  const body = (await c.req.json().catch(() => null)) as PhotoImportRejectRequest | null;
  if (!body || typeof body.photoName !== "string" || !body.photoName) {
    throw new BadRequestError("photoName required");
  }
  container.photoImportService.rejectPhoto(locationId, body.photoName);
  return c.json(successResponse({ ok: true }));
}

/** POST /api/locations/:id/photo-import/unreject */
export async function postPhotoImportUnreject(c: Context) {
  const locationId = parseId(c);
  const body = (await c.req.json().catch(() => null)) as PhotoImportRejectRequest | null;
  if (!body || typeof body.photoName !== "string" || !body.photoName) {
    throw new BadRequestError("photoName required");
  }
  container.photoImportService.unrejectPhoto(locationId, body.photoName);
  return c.json(successResponse({ ok: true }));
}

/** POST /api/uploads/:id/photo-import/retry */
export async function postPhotoImportRetry(c: Context) {
  const uploadId = parseId(c);
  const upload = await container.photoImportService.retry(uploadId);
  return c.json(successResponse({ upload }));
}

/**
 * DELETE /api/uploads/:id/staged-source
 * Delete-as-reject: removes the StagedSource and adds its photo to Rejected Sources.
 */
export async function deleteStagedSource(c: Context) {
  const uploadId = parseId(c);
  await container.photoImportService.deleteStagedSource(uploadId);
  return c.json(successResponse({ ok: true }));
}
