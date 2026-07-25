import { normalizePhotographerCredit, VARIANT_ORDER } from "./media-upload.utils";
import { provisionMediaSet } from "./media-set-provision.service";
import { uploadMediaSetVariants } from "./media-variant-upload.service";
import type { MediaUploadContext } from "./media-upload.types";

export type GalleryUploadResult = {
  galleryImageIds: string[];
  galleryUploadFailures: number;
};

export async function uploadLocationImageSets(
  context: MediaUploadContext,
): Promise<GalleryUploadResult> {
  const { location } = context;
  const galleryImageIds: string[] = [];
  let galleryUploadFailures = 0;

  for (const upload of location.uploads) {
    if (upload.stagedSourceStatus && (upload.imageSet?.variants?.length ?? 0) === 0) {
      continue;
    }
    if (upload.format !== "imageset" || !upload.imageSet) {
      continue;
    }

    const imageSet = upload.imageSet;
    const photographerCredit = normalizePhotographerCredit(imageSet.photographerCredit);
    if (!photographerCredit) {
      throw new Error(
        `Missing photographer credit for location ${location.id}, upload ${upload.id ?? "unknown"}, imageSet ${imageSet.id}`,
      );
    }

    if (!imageSet.variants || imageSet.variants.length === 0) {
      console.warn(`⚠️  ImageSet ${imageSet.id} has no variants, skipping`);
      galleryUploadFailures++;
      continue;
    }

    try {
      const provisioned = await provisionMediaSet({
        ...context,
        upload,
        imageSet,
        photographerCredit,
      });

      console.log(`✅ [MEDIA-SET] Media-set ready: ${provisioned.mediaSetId}`);
      const uploadedVariantsCount = provisioned.shouldUploadVariants
        ? await uploadMediaSetVariants({ ...context, imageSet, provisioned })
        : 0;

      if (provisioned.shouldUploadVariants && uploadedVariantsCount === 0) {
        console.warn(`⚠️  No variants were uploaded for ImageSet ${imageSet.id}, skipping media-set`);
        galleryUploadFailures++;
        continue;
      }

      galleryImageIds.push(provisioned.mediaSetId);
      if (provisioned.existingMediaSetId) {
        console.log(
          `✅ [MEDIA-SET] Added refreshed media-set ${provisioned.mediaSetId} to gallery (${uploadedVariantsCount}/${VARIANT_ORDER.length} variants uploaded)`,
        );
      } else if (provisioned.shouldUploadVariants) {
        console.log(
          `✅ [MEDIA-SET] Added new media-set ${provisioned.mediaSetId} to gallery (${uploadedVariantsCount}/${VARIANT_ORDER.length} variants uploaded, legacy per-variant flow)`,
        );
      } else {
        console.log(
          `✅ [MEDIA-SET] Added new media-set ${provisioned.mediaSetId} to gallery (created via from-source pipeline)`,
        );
      }
    } catch (error) {
      console.error(`❌ [MEDIA-SET] Failed to process ImageSet ${imageSet.id}:`, error);
      galleryUploadFailures++;
    }
  }

  return { galleryImageIds, galleryUploadFailures };
}
