import { sanitizeLocationName, getFileExtension } from "../../../../utils/location-utils";
import { VARIANT_ORDER } from "./media-upload.utils";
import type {
  LocationImageSet,
  MediaUploadContext,
  ProvisionedMediaSet,
} from "./media-upload.types";

type UploadMediaSetVariantsParams = MediaUploadContext & {
  imageSet: LocationImageSet;
  provisioned: ProvisionedMediaSet;
};

export async function uploadMediaSetVariants({
  location,
  payloadClient,
  imageStorage,
  mediaLocationRef,
  imageSet,
  provisioned,
}: UploadMediaSetVariantsParams): Promise<number> {
  let uploadedVariantsCount = 0;

  for (const variantType of VARIANT_ORDER) {
    const variant = imageSet.variants.find((candidate) => candidate.type === variantType);
    if (!variant) {
      console.warn(`⚠️  ImageSet ${imageSet.id} missing variant: ${variantType}`);
      continue;
    }

    try {
      const imageBuffer = await imageStorage.readImage(variant.path);
      const sanitizedName = sanitizeLocationName(location.source.name);
      const extension = getFileExtension(variant.path);
      const filename =
        `${sanitizedName}_${provisioned.imageSetToken}_${variantType}.${extension}`;

      console.log(
        `🖼️  [VARIANT] Uploading ${variantType} for media-set ${provisioned.mediaSetId}`,
      );

      if (!mediaLocationRef) {
        console.warn(
          `⚠️  Location ${location.id} (${location.source.name}) has no payload_location_ref. `
          + "Media assets will be uploaded without location hierarchy link.",
        );
      }

      const mediaAssetId = await payloadClient.uploadImage(
        imageBuffer,
        filename,
        provisioned.altText,
        {
          locationRef: mediaLocationRef || undefined,
          photographerCredit: provisioned.photographerCredit,
          mediaSet: provisioned.mediaSetId,
          variant: variantType,
        },
      );

      console.log(`✅ [VARIANT] Uploaded ${variantType} → MediaAsset: ${mediaAssetId}`);
      uploadedVariantsCount++;
    } catch (error) {
      console.warn(
        `⚠️  Failed to upload variant ${variantType} for ImageSet ${imageSet.id}:`,
        error,
      );
    }
  }

  return uploadedVariantsCount;
}
