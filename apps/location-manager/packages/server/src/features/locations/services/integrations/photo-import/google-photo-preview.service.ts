import { BadRequestError, NotFoundError } from "@shared/errors/http-error";
import type { PhotoImportPhoto, PhotoImportPreview } from "@questurian/lm-shared";
import type { ImageSetUpload, Upload } from "../../../models/location";
import { getLocationById } from "../../../repositories/core";
import {
  getRejectedGooglePhotoNames,
  getUploadsByLocationId,
} from "../../../repositories/content";
import {
  GooglePlacesPhotosClient,
  type GooglePlacePhoto,
} from "../clients/google-places-photos.client";

type IsConfigured = () => boolean;

export class GooglePhotoPreviewService {
  constructor(
    private readonly googlePhotos: GooglePlacesPhotosClient,
    private readonly isConfigured: IsConfigured,
  ) {}

  async previewByPlaceId(placeId: string): Promise<PhotoImportPreview> {
    if (!placeId) throw new BadRequestError("placeId required");
    if (!this.isConfigured()) {
      return { locationId: -1, placeId, photos: [], configured: false };
    }

    const photos = await this.googlePhotos.getPhotosForPlace(placeId);
    const previewUrls = await this.fetchPreviewUrls(photos);

    return {
      locationId: -1,
      placeId,
      photos: photos.map((photo, index) => toPreviewPhoto(
        photo,
        "new",
        previewUrls[index],
      )),
      configured: true,
    };
  }

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
    const uploadsByPhotoName = indexUploadsByPhotoName(uploads);
    const previewUrls = await this.fetchPreviewUrls(
      photos,
      (photo) => !isImported(uploadsByPhotoName.get(photo.name)),
    );

    return {
      locationId,
      placeId,
      photos: annotateGooglePhotos(
        photos,
        uploadsByPhotoName,
        new Set(getRejectedGooglePhotoNames(locationId)),
        previewUrls,
      ),
      configured: true,
    };
  }

  private async fetchPreviewUrls(
    photos: GooglePlacePhoto[],
    shouldFetch: (photo: GooglePlacePhoto) => boolean = () => true,
  ): Promise<(string | null)[]> {
    return Promise.all(photos.map(async (photo) => {
      if (!shouldFetch(photo)) return null;
      try {
        return await this.googlePhotos.getPhotoUri(photo.name, 600);
      } catch {
        return null;
      }
    }));
  }
}

export function annotateGooglePhotos(
  photos: GooglePlacePhoto[],
  uploadsByPhotoName: Map<string, Upload>,
  rejectedPhotoNames: Set<string>,
  previewUrls: (string | null)[],
): PhotoImportPhoto[] {
  return photos.map((photo, index) => {
    const existing = uploadsByPhotoName.get(photo.name);
    const imported = isImported(existing);
    const status = imported
      ? "imported"
      : existing
        ? "staged"
        : rejectedPhotoNames.has(photo.name)
          ? "rejected"
          : "new";

    return {
      ...toPreviewPhoto(photo, status, previewUrls[index]),
      ...(existing?.id ? { uploadId: existing.id } : {}),
      ...(existing?.errorMessage ? { errorMessage: existing.errorMessage } : {}),
    };
  });
}

function indexUploadsByPhotoName(uploads: Upload[]): Map<string, Upload> {
  const indexed = new Map<string, Upload>();
  for (const upload of uploads) {
    const photoName = (upload as ImageSetUpload).googlePhotoName;
    if (photoName) indexed.set(photoName, upload);
  }
  return indexed;
}

function isImported(upload: Upload | undefined): boolean {
  return !!upload?.imageSet && (upload.imageSet.variants?.length ?? 0) > 0;
}

function toPreviewPhoto(
  photo: GooglePlacePhoto,
  status: PhotoImportPhoto["status"],
  previewUrl: string | null | undefined,
): PhotoImportPhoto {
  return {
    name: photo.name,
    widthPx: photo.widthPx,
    heightPx: photo.heightPx,
    authorAttributions: photo.authorAttributions.map((attribution) => ({
      displayName: attribution.displayName,
      ...(attribution.uri ? { uri: attribution.uri } : {}),
    })),
    status,
    previewUrl: previewUrl ?? null,
  };
}
