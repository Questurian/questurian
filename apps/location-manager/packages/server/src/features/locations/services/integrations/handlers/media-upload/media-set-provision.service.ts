import { getFileExtension } from "../../../../utils/location-utils";
import {
  buildVariantOverrides,
  formatMediaSetUploadLabel,
  inferSourceMimeType,
  toSafeFileToken,
} from "./media-upload.utils";
import type {
  LocationImageSet,
  LocationUpload,
  MediaUploadContext,
  ProvisionedMediaSet,
} from "./media-upload.types";

type ProvisionMediaSetParams = MediaUploadContext & {
  upload: LocationUpload;
  imageSet: LocationImageSet;
  photographerCredit: string;
};

async function refreshExistingMediaSet(
  mediaSetId: string,
  context: MediaUploadContext,
): Promise<void> {
  const { payloadClient, mediaLocationRef } = context;
  let existingVariantAssetIds: string[] = [];

  console.log(
    `✅ [MEDIA-SET] Found existing media-set: ${mediaSetId} (refreshing variant uploads)`,
  );

  try {
    existingVariantAssetIds = await payloadClient.getMediaSetVariantAssetIds(mediaSetId);
  } catch (error) {
    console.warn(
      `⚠️  Failed to fetch existing variants for media-set ${mediaSetId}; proceeding with best effort refresh:`,
      error,
    );
  }

  if (mediaLocationRef) {
    try {
      await payloadClient.setMediaSetLocationRef(mediaSetId, mediaLocationRef);
      let updatedVariantCount = 0;

      for (const variantAssetId of existingVariantAssetIds) {
        try {
          await payloadClient.updateMediaAssetLocationRef(variantAssetId, mediaLocationRef);
          updatedVariantCount++;
        } catch (error) {
          console.warn(
            `⚠️  Failed to backfill locationRef on media asset ${variantAssetId} for media-set ${mediaSetId}:`,
            error,
          );
        }
      }

      console.log(
        `✅ [MEDIA-SET] Backfilled locationRef for media-set ${mediaSetId} and ${updatedVariantCount}/${existingVariantAssetIds.length} variants`,
      );
    } catch (error) {
      console.warn(
        `⚠️  Failed to backfill locationRef for existing media-set ${mediaSetId}:`,
        error,
      );
    }
  }

  if (existingVariantAssetIds.length > 0) {
    let detachedVariantsCount = 0;

    for (const variantAssetId of existingVariantAssetIds) {
      try {
        await payloadClient.detachMediaAssetFromMediaSet(variantAssetId);
        detachedVariantsCount++;
      } catch (error) {
        console.warn(
          `⚠️  Failed to detach existing variant media asset ${variantAssetId} from media-set ${mediaSetId}:`,
          error,
        );
      }
    }

    console.log(
      `✅ [MEDIA-SET] Detached ${detachedVariantsCount}/${existingVariantAssetIds.length} existing variants from media-set ${mediaSetId}`,
    );
  }
}

async function createNewMediaSet(
  params: ProvisionMediaSetParams & {
    imageSetToken: string;
    mediaSetTitle: string;
    externalRef: string;
    altText: string;
  },
): Promise<{ mediaSetId: string; shouldUploadVariants: boolean }> {
  const {
    location,
    payloadClient,
    imageStorage,
    mediaLocationRef,
    imageSet,
    photographerCredit,
    imageSetToken,
    mediaSetTitle,
    externalRef,
    altText,
  } = params;
  const overrides = buildVariantOverrides(imageSet.variants);
  const sourcePath = imageSet.sourceImage?.path;

  if (overrides && sourcePath) {
    try {
      const sourceBuffer = await imageStorage.readImage(sourcePath);
      const sourceExtension = getFileExtension(sourcePath);
      const sourceFilename = `${imageSetToken}_source.${sourceExtension}`;
      const sourceMime = inferSourceMimeType(sourcePath);

      console.log(
        `📦 [MEDIA-SET] Creating new media-set via from-source (${Object.keys(overrides).length} variant overrides)`,
      );
      const result = await payloadClient.createMediaSetFromSource(
        { buffer: sourceBuffer, mimetype: sourceMime, filename: sourceFilename },
        {
          title: mediaSetTitle,
          alt_text: altText,
          photographer_credit: photographerCredit,
          externalRef,
          location: location.locationKey || undefined,
          ...(mediaLocationRef ? { locationRef: parseInt(mediaLocationRef, 10) } : {}),
          overrides,
        },
      );

      const mediaSetId = String(result.mediaSetId);
      console.log(
        `✅ [MEDIA-SET] from-source created media-set ${mediaSetId} with ${Object.keys(result.variantAssetIds).length} variants`,
      );
      return { mediaSetId, shouldUploadVariants: false };
    } catch (error) {
      console.warn(
        "⚠️  [MEDIA-SET] from-source pipeline failed; falling back to per-variant upload:",
        error,
      );
    }
  }

  console.log("📦 [MEDIA-SET] Creating new media-set (legacy per-variant flow)");
  const mediaSetId = await payloadClient.createMediaSet({
    title: mediaSetTitle,
    alt_text: altText,
    externalRef,
    location: location.locationKey || undefined,
    tags: [],
  });
  return { mediaSetId, shouldUploadVariants: true };
}

export async function provisionMediaSet(
  params: ProvisionMediaSetParams,
): Promise<ProvisionedMediaSet> {
  const { location, payloadClient, upload, imageSet, photographerCredit } = params;
  const imageSetToken = toSafeFileToken(imageSet.id, "imageset");
  const mediaSetTitle = `${location.title || location.source.name} - Upload ${formatMediaSetUploadLabel(imageSet.id, upload)}`;
  const externalRef = `location-${location.id}-imageset-${imageSet.id}`;
  const altText = imageSet.altText || `${location.title || location.source.name}`;

  console.log(`📦 [MEDIA-SET] Checking media-set for location ${location.id}`, {
    title: mediaSetTitle,
    externalRef,
    locationKey: location.locationKey,
  });

  const existingMediaSetId = await payloadClient.findMediaSetByExternalRef(externalRef);
  if (existingMediaSetId) {
    await refreshExistingMediaSet(existingMediaSetId, params);
    return {
      mediaSetId: existingMediaSetId,
      existingMediaSetId,
      shouldUploadVariants: true,
      imageSetToken,
      altText,
      photographerCredit,
    };
  }

  const created = await createNewMediaSet({
    ...params,
    imageSetToken,
    mediaSetTitle,
    externalRef,
    altText,
  });
  return {
    ...created,
    existingMediaSetId: null,
    imageSetToken,
    altText,
    photographerCredit,
  };
}
