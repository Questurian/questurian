import { BadRequestError } from "@shared/errors/http-error";
import { GOOGLE_PHOTO_IMPORT_TOGGLE_KEY } from "@questurian/lm-shared";
import { isIntegrationEnabled } from "@server/shared/settings/integration-toggles";
import type {
  PhotoImportPreview,
  PhotoImportStartPhoto,
  PhotoImportStartResponse,
} from "@questurian/lm-shared";
import type { Upload } from "../../models/location";
import { ImageStorageService } from "../storage/image-storage.service";
import { GooglePlacesPhotosClient } from "./clients/google-places-photos.client";
import { GooglePhotoDownloadProcessor } from "./photo-import/google-photo-download.processor";
import { GooglePhotoPreviewService } from "./photo-import/google-photo-preview.service";
import { GooglePhotoStagingService } from "./photo-import/google-photo-staging.service";
import {
  DEFAULT_GOOGLE_PHOTO_MAX_WIDTH,
} from "./photo-import/photo-import.constants";
import { StagedSourceRejectionService } from "./photo-import/staged-source-rejection.service";

export class PhotoImportService {
  private readonly previewService: GooglePhotoPreviewService;
  private readonly stagingService: GooglePhotoStagingService;
  private readonly rejectionService: StagedSourceRejectionService;

  constructor(
    private readonly googlePhotos: GooglePlacesPhotosClient,
    imageStorage: ImageStorageService,
  ) {
    const isConfigured = () => this.isConfigured();
    const downloadProcessor = new GooglePhotoDownloadProcessor(
      googlePhotos,
      imageStorage,
    );

    this.previewService = new GooglePhotoPreviewService(googlePhotos, isConfigured);
    this.stagingService = new GooglePhotoStagingService(
      isConfigured,
      downloadProcessor,
    );
    this.rejectionService = new StagedSourceRejectionService(imageStorage);
  }

  isConfigured(): boolean {
    return isIntegrationEnabled(GOOGLE_PHOTO_IMPORT_TOGGLE_KEY)
      && this.googlePhotos.isConfigured();
  }

  async proxyPhotoBytes(photoName: string, maxWidth?: number): Promise<Buffer> {
    if (!this.isConfigured()) {
      throw new BadRequestError("Google Photo Import is disabled");
    }
    return this.googlePhotos.fetchPhotoBytes(
      photoName,
      maxWidth ?? DEFAULT_GOOGLE_PHOTO_MAX_WIDTH,
    );
  }

  previewByPlaceId(placeId: string): Promise<PhotoImportPreview> {
    return this.previewService.previewByPlaceId(placeId);
  }

  preview(locationId: number): Promise<PhotoImportPreview> {
    return this.previewService.preview(locationId);
  }

  start(
    locationId: number,
    photos: PhotoImportStartPhoto[],
  ): Promise<PhotoImportStartResponse> {
    return this.stagingService.start(locationId, photos);
  }

  retry(uploadId: number): Promise<Upload> {
    return this.stagingService.retry(uploadId);
  }

  rejectPhoto(locationId: number, photoName: string): void {
    this.rejectionService.rejectPhoto(locationId, photoName);
  }

  unrejectPhoto(locationId: number, photoName: string): void {
    this.rejectionService.unrejectPhoto(locationId, photoName);
  }

  deleteStagedSource(uploadId: number): Promise<void> {
    return this.rejectionService.deleteStagedSource(uploadId);
  }
}
