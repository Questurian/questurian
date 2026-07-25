import type { LocationResponse } from "../../../../models/location";
import type { PayloadApiClient } from "../../clients/payload-api.client";
import type { ImageStorageService } from "../../../storage/image-storage.service";

export type LocationUpload = LocationResponse["uploads"][number];
export type LocationImageSet = NonNullable<LocationUpload["imageSet"]>;

export type MediaUploadContext = {
  location: LocationResponse;
  payloadClient: PayloadApiClient;
  imageStorage: ImageStorageService;
  mediaLocationRef: string | null;
};

export type ProvisionedMediaSet = {
  mediaSetId: string;
  existingMediaSetId: string | null;
  shouldUploadVariants: boolean;
  imageSetToken: string;
  altText: string;
  photographerCredit: string;
};
