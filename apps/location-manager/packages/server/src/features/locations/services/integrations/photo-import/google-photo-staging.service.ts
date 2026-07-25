import { BadRequestError, NotFoundError } from "@shared/errors/http-error";
import type {
  PhotoImportStartPhoto,
  PhotoImportStartResponse,
} from "@questurian/lm-shared";
import type { ImageSetUpload, Upload } from "../../../models/location";
import { getLocationById } from "../../../repositories/core";
import { getUploadById, saveUpload } from "../../../repositories/content";
import { GooglePhotoDownloadProcessor } from "./google-photo-download.processor";
import { touchLocationUpdatedAt } from "./photo-import-location";

type IsConfigured = () => boolean;

export class GooglePhotoStagingService {
  constructor(
    private readonly isConfigured: IsConfigured,
    private readonly downloadProcessor: GooglePhotoDownloadProcessor,
  ) {}

  async start(
    locationId: number,
    photos: PhotoImportStartPhoto[],
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

    // Google returns opaque photo names that can rotate between Place Details calls.
    // Trust the names from the immediately preceding preview instead of re-fetching.
    const startedUploadIds: number[] = [];
    const skipped: PhotoImportStartResponse["skipped"] = [];

    for (const { photoName, photographerCredit } of photos) {
      const entry: ImageSetUpload = {
        location_id: locationId,
        format: "imageset",
        stagedSourceStatus: "downloading",
        sourceKind: "google",
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
      void this.downloadProcessor.process(
        entry,
        photoName,
        photographerCredit?.trim() || "Google",
        location.name,
      );
    }

    touchLocationUpdatedAt(locationId);
    return { startedUploadIds, skipped };
  }

  async retry(uploadId: number): Promise<Upload> {
    if (!this.isConfigured()) {
      throw new BadRequestError("Google Photo Import is disabled");
    }
    const upload = getUploadById(uploadId);
    if (!upload) throw new NotFoundError("Upload", uploadId);

    const stagedUpload = upload as ImageSetUpload;
    if (stagedUpload.stagedSourceStatus !== "failed") {
      throw new BadRequestError("Upload is not a failed StagedSource");
    }
    if (!stagedUpload.googlePhotoName) {
      throw new BadRequestError("Upload has no googlePhotoName");
    }

    const location = getLocationById(stagedUpload.location_id);
    if (!location) throw new NotFoundError("Location", stagedUpload.location_id);

    stagedUpload.stagedSourceStatus = "downloading";
    stagedUpload.errorMessage = null;
    saveUpload(stagedUpload);
    // Retry the stored token. Re-fetching the place would return names that cannot
    // be matched reliably to this staged source.
    void this.downloadProcessor.process(
      stagedUpload,
      stagedUpload.googlePhotoName,
      "Google",
      location.name,
    );
    return stagedUpload;
  }
}
