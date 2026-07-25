import type { LocationResponse } from "../../../models/location";
import type { PayloadApiClient } from "../clients/payload-api.client";
import { ImageStorageService } from "../../storage/image-storage.service";
import type { UploadedImagesResult } from "../types";
import { uploadLocationImageSets } from "./media-upload/media-set-upload.service";
import { uploadLocationInstagramEmbeds } from "./media-upload/instagram-upload.service";

/**
 * Upload images and create Instagram posts for a location.
 * Returns separate arrays for gallery images and Instagram post IDs.
 */
export async function uploadLocationImages(
  location: LocationResponse,
  payloadClient: PayloadApiClient,
  imageStorage: ImageStorageService,
  resolvedLocationRef?: string | null,
): Promise<UploadedImagesResult> {
  const mediaLocationRef = resolvedLocationRef ?? location.payload_location_ref ?? null;
  const context = {
    location,
    payloadClient,
    imageStorage,
    mediaLocationRef,
  };

  try {
    const gallery = await uploadLocationImageSets(context);
    const instagramPostIds = await uploadLocationInstagramEmbeds(context);

    return {
      galleryImageIds: gallery.galleryImageIds,
      instagramPostIds,
      galleryUploadFailures: gallery.galleryUploadFailures,
    };
  } catch (error) {
    console.error("Error uploading images:", error);
    throw error;
  }
}
