import { join } from "node:path";
import type { ImageSet } from "@questurian/lm-shared";
import type { ImageSetUpload } from "../../../models/location";
import { getUploadById, saveUpload } from "../../../repositories/content";
import { extractImageMetadata } from "../../../utils/image-metadata-extractor";
import { sanitizeUploadedImageBuffer } from "../../../utils/image-upload-sanitizer";
import { ImageStorageService } from "../../storage/image-storage.service";
import { GooglePlacesPhotosClient } from "../clients/google-places-photos.client";
import { DEFAULT_GOOGLE_PHOTO_MAX_WIDTH } from "./photo-import.constants";
import { touchLocationUpdatedAt } from "./photo-import-location";

export class GooglePhotoDownloadProcessor {
  constructor(
    private readonly googlePhotos: GooglePlacesPhotosClient,
    private readonly imageStorage: ImageStorageService,
  ) {}

  async process(
    entry: ImageSetUpload,
    photoName: string,
    credit: string,
    locationName: string,
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
      const rawBytes = await this.googlePhotos.fetchPhotoBytes(
        photoName,
        DEFAULT_GOOGLE_PHOTO_MAX_WIDTH,
      );
      const webpBytes = await sanitizeUploadedImageBuffer(rawBytes);
      const sourceFilePath = join(storagePath, "source_0.webp");

      await Bun.write(sourceFilePath, webpBytes);

      const metadata = await extractImageMetadata(sourceFilePath);
      const imageSet: ImageSet = {
        id: `${timestamp}`,
        sourceImage: {
          path: sourceFilePath.replace(process.cwd() + "/", ""),
          dimensions: { width: metadata.width, height: metadata.height },
          size: metadata.size,
          format: metadata.format,
        },
        variants: [],
        photographerCredit: credit,
        created_at: new Date().toISOString(),
      };

      this.persistReadyUpload(uploadId, imageSet, entry.location_id);
    } catch (error) {
      this.persistFailedUpload(uploadId, photoName, error, entry.location_id);
    }
  }

  private persistReadyUpload(
    uploadId: number,
    imageSet: ImageSet,
    locationId: number,
  ): void {
    const fresh = getUploadById(uploadId);
    if (!fresh) return;

    const upload = fresh as ImageSetUpload;
    upload.imageSet = imageSet;
    upload.stagedSourceStatus = "ready";
    upload.errorMessage = null;
    saveUpload(upload);
    touchLocationUpdatedAt(locationId);
  }

  private persistFailedUpload(
    uploadId: number,
    photoName: string,
    error: unknown,
    locationId: number,
  ): void {
    const fresh = getUploadById(uploadId);
    if (!fresh) return;

    const message = error instanceof Error ? error.message : String(error);
    const upload = fresh as ImageSetUpload;
    upload.stagedSourceStatus = "failed";
    upload.errorMessage = message;
    saveUpload(upload);
    console.warn(`[PhotoImport] Download failed for ${photoName}: ${message}`);
    touchLocationUpdatedAt(locationId);
  }
}
