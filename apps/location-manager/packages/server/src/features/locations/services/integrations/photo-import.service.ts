import { join } from "node:path";
import { BadRequestError, NotFoundError } from "@shared/errors/http-error";
import { GOOGLE_PHOTO_IMPORT_TOGGLE_KEY } from "@questurian/lm-shared";
import { isIntegrationEnabled } from "@server/shared/settings/integration-toggles";
import type {
  PhotoImportPhoto,
  PhotoImportPreview,
  PhotoImportStartPhoto,
  PhotoImportStartResponse,
  ImageSet,
} from "@questurian/lm-shared";
import { GooglePlacesPhotosClient } from "./clients/google-places-photos.client";
import { AltTextApiClient } from "./clients/alt-text-api.client";
import { ImageStorageService } from "../storage/image-storage.service";
import { getLocationById, updateLocationById } from "../../repositories/core";
import {
  saveUpload,
  getUploadById,
  getUploadsByLocationId,
  deleteUploadById,
  getRejectedGooglePhotoNames,
  addRejectedGooglePhoto,
  removeRejectedGooglePhoto,
} from "../../repositories/content";
import { sanitizeUploadedImageBuffer } from "../../utils/image-upload-sanitizer";
import { extractImageMetadata } from "../../utils/image-metadata-extractor";
import type { Upload, ImageSetUpload } from "../../models/location";

const PHOTO_MAX_WIDTH = 1600;

export class PhotoImportService {
  constructor(
    private readonly googlePhotos: GooglePlacesPhotosClient,
    private readonly imageStorage: ImageStorageService,
    private readonly altTextApi: AltTextApiClient
  ) {}

  isConfigured(): boolean {
    return isIntegrationEnabled(GOOGLE_PHOTO_IMPORT_TOGGLE_KEY) && this.googlePhotos.isConfigured();
  }

  /**
   * Resolve the signed media URL for a Google place photo and return the bytes.
   * Used by the Add-flow pre-Create cropping pipeline (ADR-0007). Different from
   * the StagedSource processDownload path: no DB row, no disk write, no alt-text —
   * just the raw bytes for the browser-side cropper.
   */
  async proxyPhotoBytes(photoName: string, maxWidth?: number): Promise<Buffer> {
    if (!this.isConfigured()) {
      throw new BadRequestError("Google Photo Import is disabled");
    }
    return this.googlePhotos.fetchPhotoBytes(photoName, maxWidth ?? PHOTO_MAX_WIDTH);
  }

  /**
   * Pre-Create preview: no Location yet, so no rejection memory or existing-upload status.
   * Every photo comes back as status='new'. Used by the pre-Create "Pick photos" phase.
   */
  async previewByPlaceId(placeId: string): Promise<PhotoImportPreview> {
    if (!placeId) throw new BadRequestError("placeId required");
    if (!this.isConfigured()) {
      return { locationId: -1, placeId, photos: [], configured: false };
    }

    const photos = await this.googlePhotos.getPhotosForPlace(placeId);
    const previewUrls = await Promise.all(
      photos.map(async (photo) => {
        try {
          return await this.googlePhotos.getPhotoUri(photo.name, 600);
        } catch {
          return null;
        }
      })
    );

    const annotated: PhotoImportPhoto[] = photos.map((photo, idx) => ({
      name: photo.name,
      widthPx: photo.widthPx,
      heightPx: photo.heightPx,
      authorAttributions: photo.authorAttributions.map((a) => ({
        displayName: a.displayName,
        ...(a.uri ? { uri: a.uri } : {}),
      })),
      status: "new" as const,
      previewUrl: previewUrls[idx],
    }));

    return { locationId: -1, placeId, photos: annotated, configured: true };
  }

  /**
   * Fetch Google photos for the Location's placeId and annotate each with status:
   * new | staged | imported | rejected. See LM CONTEXT.md "Photo Import flow".
   */
  async preview(locationId: number): Promise<PhotoImportPreview> {
    const location = getLocationById(locationId);
    if (!location) throw new NotFoundError("Location", locationId);

    const placeId = (location as { placeId?: string | null }).placeId || "";
    if (!placeId) {
      throw new BadRequestError("Location has no placeId; cannot run Photo Import");
    }

    if (!this.isConfigured()) {
      return { locationId, placeId, photos: [], configured: false };
    }

    const photos = await this.googlePhotos.getPhotosForPlace(placeId);
    const uploads = getUploadsByLocationId(locationId);
    const rejected = new Set(getRejectedGooglePhotoNames(locationId));

    const byPhotoName = new Map<string, Upload>();
    for (const upload of uploads) {
      const name = (upload as ImageSetUpload).googlePhotoName;
      if (name) byPhotoName.set(name, upload);
    }

    // Fan out and grab thumbnail URLs for any photo we don't already have a local source for.
    // School-project use; latency is acceptable. Failures fall through to null so the grid can render a placeholder.
    const previewUrls = await Promise.all(
      photos.map(async (photo) => {
        const existing = byPhotoName.get(photo.name);
        const isImported = !!existing?.imageSet && (existing.imageSet.variants?.length ?? 0) > 0;
        if (isImported) return null;
        try {
          return await this.googlePhotos.getPhotoUri(photo.name, 600);
        } catch {
          return null;
        }
      })
    );

    const annotated: PhotoImportPhoto[] = photos.map((photo, idx) => {
      const existing = byPhotoName.get(photo.name);
      const isImported = !!existing?.imageSet && (existing.imageSet.variants?.length ?? 0) > 0;
      const isStaged = !!existing && !isImported;

      let status: PhotoImportPhoto["status"];
      if (isImported) status = "imported";
      else if (isStaged) status = "staged";
      else if (rejected.has(photo.name)) status = "rejected";
      else status = "new";

      return {
        name: photo.name,
        widthPx: photo.widthPx,
        heightPx: photo.heightPx,
        authorAttributions: photo.authorAttributions.map((a) => ({
          displayName: a.displayName,
          ...(a.uri ? { uri: a.uri } : {}),
        })),
        status,
        ...(existing?.id ? { uploadId: existing.id } : {}),
        ...(existing?.errorMessage ? { errorMessage: existing.errorMessage } : {}),
        previewUrl: previewUrls[idx],
      };
    });

    return { locationId, placeId, photos: annotated, configured: true };
  }

  /**
   * Insert StagedSource rows for each selected photoName and kick off async downloads.
   * Returns immediately so the client can poll.
   */
  async start(
    locationId: number,
    photos: PhotoImportStartPhoto[]
  ): Promise<PhotoImportStartResponse> {
    const location = getLocationById(locationId);
    if (!location) throw new NotFoundError("Location", locationId);
    if (!this.isConfigured()) {
      throw new BadRequestError("Google Photo Import is disabled");
    }
    if (!photos || photos.length === 0) {
      return { startedUploadIds: [], skipped: [] };
    }

    const placeId = (location as { placeId?: string | null }).placeId || "";
    if (!placeId) throw new BadRequestError("Location has no placeId");

    // NOTE: Google's Places API (New) returns a *different* opaque photo `name`
    // on every call to the place details endpoint. The names are session/request
    // tokens, not stable photo identifiers. We therefore do NOT re-fetch the
    // place here to validate names — we trust the names the client just got
    // from its preview call (which used the same key, moments ago). If a name
    // has rotated by the time getPhotoUri is called, the per-photo download
    // will surface as 'failed' on the StagedSource and the operator can retry.
    const startedUploadIds: number[] = [];
    const skipped: PhotoImportStartResponse["skipped"] = [];

    for (const { photoName, photographerCredit } of photos) {
      const credit = photographerCredit?.trim() || "Google";
      const entry: ImageSetUpload = {
        location_id: locationId,
        format: "imageset",
        stagedSourceStatus: "downloading",
        googlePhotoName: photoName,
        imageSet: undefined,
      };

      const savedId = saveUpload(entry);
      if (typeof savedId !== "number") {
        skipped.push({ photoName, reason: "not-in-place" });
        continue;
      }
      entry.id = savedId;
      startedUploadIds.push(savedId);

      // Fire-and-forget: download bytes + pre-warm alt text in parallel per photo.
      void this.processDownload(entry, photoName, credit, location.name);
    }

    this.touchLocationUpdatedAt(locationId);

    return { startedUploadIds, skipped };
  }

  /** Retry a failed StagedSource. Spends against Google, so the toggle gates it. */
  async retry(uploadId: number): Promise<Upload> {
    if (!this.isConfigured()) {
      throw new BadRequestError("Google Photo Import is disabled");
    }
    const upload = getUploadById(uploadId);
    if (!upload) throw new NotFoundError("Upload", uploadId);
    const u = upload as ImageSetUpload;
    if (u.stagedSourceStatus !== "failed") {
      throw new BadRequestError("Upload is not a failed StagedSource");
    }
    if (!u.googlePhotoName) {
      throw new BadRequestError("Upload has no googlePhotoName");
    }

    const location = getLocationById(u.location_id);
    if (!location) throw new NotFoundError("Location", u.location_id);

    u.stagedSourceStatus = "downloading";
    u.errorMessage = null;
    saveUpload(u);

    // Photo names rotate between Google API calls — re-fetching would just yield
    // names we can't match against the stored one. The retry uses the same
    // (possibly stale) name; if it's expired, processDownload marks as 'failed'.
    void this.processDownload(u, u.googlePhotoName, "Google", location.name);
    return u;
  }

  /** Add a photoName to the Location's Rejected Source list. */
  rejectPhoto(locationId: number, photoName: string): void {
    addRejectedGooglePhoto(locationId, photoName);
    this.touchLocationUpdatedAt(locationId);
  }

  /** Remove a photoName from the Location's Rejected Source list. */
  unrejectPhoto(locationId: number, photoName: string): void {
    removeRejectedGooglePhoto(locationId, photoName);
    this.touchLocationUpdatedAt(locationId);
  }

  /**
   * Delete-as-reject: deleting a StagedSource that never finished cropping
   * adds its googlePhotoName to the Rejected Source list.
   */
  async deleteStagedSource(uploadId: number): Promise<void> {
    const upload = getUploadById(uploadId);
    if (!upload) throw new NotFoundError("Upload", uploadId);
    const u = upload as ImageSetUpload;

    if (u.googlePhotoName) {
      this.rejectPhoto(u.location_id, u.googlePhotoName);
    }

    // Best-effort source file cleanup if present.
    const sourcePath = u.imageSet?.sourceImage?.path;
    if (sourcePath) {
      const meta = this.imageStorage.extractPathMetadata(sourcePath);
      if (meta) {
        try {
          await this.imageStorage.deleteTimestampFolder(meta.timestampDir);
        } catch (error) {
          console.error("Failed to clean StagedSource files", { uploadId, error });
        }
      }
    }
    deleteUploadById(uploadId);
    this.touchLocationUpdatedAt(u.location_id);
  }

  // ---- internals ----

  private async processDownload(
    entry: ImageSetUpload,
    photoName: string,
    credit: string,
    locationName: string
  ): Promise<void> {
    const uploadId = entry.id!;
    const timestamp = Date.now();
    const storagePath = this.imageStorage.generateStoragePath({
      baseDir: (this.imageStorage as unknown as { baseImagesDir: string }).baseImagesDir,
      locationName,
      storageType: "uploads",
      timestamp,
    });

    try {
      await this.imageStorage.ensureDirectoryExists(storagePath);
      const rawBytes = await this.googlePhotos.fetchPhotoBytes(photoName, PHOTO_MAX_WIDTH);
      const webpBytes = await sanitizeUploadedImageBuffer(rawBytes);

      const sourceFileName = `source_0.webp`;
      const sourceFilePath = join(storagePath, sourceFileName);
      await Bun.write(sourceFilePath, webpBytes);

      const relativeSourcePath = sourceFilePath.replace(process.cwd() + "/", "");
      const meta = await extractImageMetadata(sourceFilePath);

      // Pre-warm alt text in parallel; tolerate failure.
      const altText = await this.tryGenerateAltText(webpBytes, sourceFileName);

      const imageSet: ImageSet = {
        id: `${timestamp}`,
        sourceImage: {
          path: relativeSourcePath,
          dimensions: { width: meta.width, height: meta.height },
          size: meta.size,
          format: meta.format,
        },
        variants: [],
        photographerCredit: credit,
        altText: altText || undefined,
        created_at: new Date().toISOString(),
      };

      const fresh = getUploadById(uploadId);
      if (!fresh) return; // Deleted while downloading; abandon.
      const f = fresh as ImageSetUpload;
      f.imageSet = imageSet;
      f.stagedSourceStatus = "ready";
      f.errorMessage = null;
      saveUpload(f);
      this.touchLocationUpdatedAt(entry.location_id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const fresh = getUploadById(uploadId);
      if (!fresh) return;
      const f = fresh as ImageSetUpload;
      f.stagedSourceStatus = "failed";
      f.errorMessage = message;
      saveUpload(f);
      console.warn(`[PhotoImport] Download failed for ${photoName}: ${message}`);
      this.touchLocationUpdatedAt(entry.location_id);
    }
  }

  private async tryGenerateAltText(buffer: Buffer, filename: string): Promise<string> {
    try {
      return await this.altTextApi.generateAltText(buffer, filename, "webp");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[PhotoImport] Alt-text generation failed for ${filename}: ${message}`);
      return "";
    }
  }

  private touchLocationUpdatedAt(locationId: number): void {
    updateLocationById(locationId, {
      updated_at: new Date().toISOString().replace("T", " ").replace(/\.\d{3}Z$/, ""),
    });
  }
}
