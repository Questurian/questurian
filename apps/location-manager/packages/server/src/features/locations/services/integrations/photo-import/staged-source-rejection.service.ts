import { NotFoundError } from "@shared/errors/http-error";
import type { ImageSetUpload } from "../../../models/location";
import {
  addRejectedGooglePhoto,
  deleteUploadById,
  getInstagramEmbedById,
  getUploadById,
  rejectInstagramMedia,
  removeRejectedGooglePhoto,
} from "../../../repositories/content";
import { ImageStorageService } from "../../storage/image-storage.service";
import { touchLocationUpdatedAt } from "./photo-import-location";

export class StagedSourceRejectionService {
  constructor(private readonly imageStorage: ImageStorageService) {}

  rejectPhoto(locationId: number, photoName: string): void {
    addRejectedGooglePhoto(locationId, photoName);
    touchLocationUpdatedAt(locationId);
  }

  unrejectPhoto(locationId: number, photoName: string): void {
    removeRejectedGooglePhoto(locationId, photoName);
    touchLocationUpdatedAt(locationId);
  }

  async deleteStagedSource(uploadId: number): Promise<void> {
    const upload = getUploadById(uploadId);
    if (!upload) throw new NotFoundError("Upload", uploadId);

    const stagedUpload = upload as ImageSetUpload;
    this.rememberRejection(stagedUpload);
    await this.cleanSourceFiles(stagedUpload, uploadId);
    deleteUploadById(uploadId);
    touchLocationUpdatedAt(stagedUpload.location_id);
  }

  private rememberRejection(upload: ImageSetUpload): void {
    if (upload.googlePhotoName) {
      this.rejectPhoto(upload.location_id, upload.googlePhotoName);
      return;
    }
    if (
      upload.instagramEmbedId
      && upload.instagramMediaKey
      && getInstagramEmbedById(upload.instagramEmbedId)
    ) {
      rejectInstagramMedia(
        upload.instagramEmbedId,
        upload.instagramMediaKey,
        upload.sourcePosition ?? 0,
      );
    }
  }

  private async cleanSourceFiles(
    upload: ImageSetUpload,
    uploadId: number,
  ): Promise<void> {
    const sourcePath = upload.imageSet?.sourceImage?.path;
    if (!sourcePath) return;

    const metadata = this.imageStorage.extractPathMetadata(sourcePath);
    if (!metadata) return;

    try {
      await this.imageStorage.deleteTimestampFolder(metadata.timestampDir);
    } catch (error) {
      console.error("Failed to clean StagedSource files", { uploadId, error });
    }
  }
}
