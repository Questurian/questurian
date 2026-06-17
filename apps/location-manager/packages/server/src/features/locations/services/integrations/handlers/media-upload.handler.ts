import type { LocationResponse } from "../../../models/location";
import type { PayloadApiClient } from "../clients/payload-api.client";
import type { PayloadVariantOverride } from "../clients/payload-api.client";
import { ImageStorageService } from "../../storage/image-storage.service";
import type { UploadedImagesResult } from "../types";
import type { ImageVariant, ImageVariantType } from "@questurian/lm-shared";
import { basename } from "node:path";
import { sanitizeLocationName, getFileExtension } from "../../../utils/location-utils";

const VARIANT_ORDER: ImageVariantType[] = [
  'thumbnail',
  'square',
  'wide',
  'open_graph',
  'editorial',
  'portrait',
  'hero',
];

const SOURCE_MIME_TYPE_BY_EXT: Record<string, string> = {
  webp: 'image/webp',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

const inferSourceMimeType = (path: string): string => {
  const extension = getFileExtension(path).toLowerCase();
  return SOURCE_MIME_TYPE_BY_EXT[extension] ?? 'image/webp';
};

const buildVariantOverrides = (
  variants: ImageVariant[],
): Partial<Record<ImageVariantType, PayloadVariantOverride>> | null => {
  const overrides: Partial<Record<ImageVariantType, PayloadVariantOverride>> = {};
  for (const variant of variants) {
    if (!variant.cropRegion) {
      // Legacy ImageSet without crop regions — caller falls back to per-variant upload.
      return null;
    }
    overrides[variant.type] = {
      left: variant.cropRegion.left,
      top: variant.cropRegion.top,
      width: variant.cropRegion.width,
      height: variant.cropRegion.height,
    };
  }
  return overrides;
};

/**
 * Upload images and create Instagram posts for a location
 * Returns separate arrays for gallery images and Instagram post IDs
 */
export async function uploadLocationImages(
  location: LocationResponse,
  payloadClient: PayloadApiClient,
  imageStorage: ImageStorageService,
  resolvedLocationRef?: string | null
): Promise<UploadedImagesResult> {
  const galleryImageIds: string[] = [];
  const instagramPostIds: string[] = [];
  let galleryUploadFailures = 0;
  const mediaLocationRef = resolvedLocationRef ?? location.payload_location_ref ?? null;

  try {
    // Upload images using ImageSet format (multi-variant system)
    for (const upload of location.uploads) {
      // Only handle ImageSetUpload format
      if (upload.format === 'imageset' && upload.imageSet) {
        // ImageSet format: upload ONLY variants (skip source image)
        const imageSet = upload.imageSet;
        const photographerCredit = normalizePhotographerCredit(imageSet.photographerCredit);
        if (!photographerCredit) {
          throw new Error(
            `Missing photographer credit for location ${location.id}, upload ${upload.id ?? "unknown"}, imageSet ${imageSet.id}`
          );
        }
        // Validate variants exist
        if (!imageSet.variants || imageSet.variants.length === 0) {
          console.warn(`⚠️  ImageSet ${imageSet.id} has no variants, skipping`);
          continue;
        }

        try {
          // ⭐ STEP 1: Check if media-set already exists (from previous sync)
          const mediaSetTitle = `${location.title || location.source.name} - Upload ${imageSet.id}`;
          const externalRef = `location-${location.id}-imageset-${imageSet.id}`;
          const altText = imageSet.altText || `${location.title || location.source.name}`;

          console.log(`📦 [MEDIA-SET] Checking media-set for location ${location.id}`, {
            title: mediaSetTitle,
            externalRef,
            locationKey: location.locationKey,
          });

          // Check if media-set already exists
          const existingMediaSetId = await payloadClient.findMediaSetByExternalRef(externalRef);

          let mediaSetId: string;
          let shouldUploadVariants = false;
          let existingVariantAssetIds: string[] = [];

          if (existingMediaSetId) {
            // Media-set already exists from previous sync
            console.log(
              `✅ [MEDIA-SET] Found existing media-set: ${existingMediaSetId} (refreshing variant uploads)`
            );
            mediaSetId = existingMediaSetId;
            shouldUploadVariants = true;

            try {
              existingVariantAssetIds = await payloadClient.getMediaSetVariantAssetIds(mediaSetId);
            } catch (error) {
              console.warn(
                `⚠️  Failed to fetch existing variants for media-set ${mediaSetId}; proceeding with best effort refresh:`,
                error
              );
            }

            // Backfill locationRef on existing media-set and variant assets
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
                      error
                    );
                  }
                }

                console.log(
                  `✅ [MEDIA-SET] Backfilled locationRef for media-set ${mediaSetId} and ${updatedVariantCount}/${existingVariantAssetIds.length} variants`
                );
              } catch (error) {
                console.warn(
                  `⚠️  Failed to backfill locationRef for existing media-set ${mediaSetId}:`,
                  error
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
                    error
                  );
                }
              }

              console.log(
                `✅ [MEDIA-SET] Detached ${detachedVariantsCount}/${existingVariantAssetIds.length} existing variants from media-set ${mediaSetId}`
              );
            }
          } else {
            // Media-set doesn't exist. Try the single-call from-source pipeline
            // when every variant has a persisted cropRegion (Questura ADR 0002);
            // fall back to the legacy create + per-variant upload flow otherwise.
            const overrides = buildVariantOverrides(imageSet.variants);
            const sourcePath = imageSet.sourceImage?.path;

            if (overrides && sourcePath) {
              try {
                const sourceBuffer = await imageStorage.readImage(sourcePath);
                const sourceFilename = basename(sourcePath);
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
                    externalRef: externalRef,
                    location: location.locationKey || undefined,
                    ...(mediaLocationRef
                      ? { locationRef: parseInt(mediaLocationRef, 10) }
                      : {}),
                    overrides,
                  },
                );

                mediaSetId = String(result.mediaSetId);
                shouldUploadVariants = false; // Pipeline already created the variants
                console.log(
                  `✅ [MEDIA-SET] from-source created media-set ${mediaSetId} with ${Object.keys(result.variantAssetIds).length} variants`,
                );
              } catch (error) {
                console.warn(
                  `⚠️  [MEDIA-SET] from-source pipeline failed; falling back to per-variant upload:`,
                  error,
                );
                console.log(`📦 [MEDIA-SET] Creating new media-set (legacy per-variant flow)`);
                mediaSetId = await payloadClient.createMediaSet({
                  title: mediaSetTitle,
                  alt_text: altText,
                  externalRef: externalRef,
                  location: location.locationKey || undefined,
                  tags: [],
                });
                shouldUploadVariants = true;
              }
            } else {
              // Legacy ImageSet (no cropRegions persisted) — keep the old flow.
              console.log(`📦 [MEDIA-SET] Creating new media-set (legacy per-variant flow)`);
              mediaSetId = await payloadClient.createMediaSet({
                title: mediaSetTitle,
                alt_text: altText,
                externalRef: externalRef,
                location: location.locationKey || undefined,
                tags: [],
              });
              shouldUploadVariants = true;
            }
          }

          console.log(`✅ [MEDIA-SET] Media-set ready: ${mediaSetId}`);

          // ⭐ STEP 2: Upload variants for refreshed existing media-sets and the
          // legacy per-variant fallback path. New from-source uploads skip this.
          const variantOrder = VARIANT_ORDER;
          let uploadedVariantsCount = 0;

          if (shouldUploadVariants) {
            for (const variantType of variantOrder) {
              const variant = imageSet.variants.find(v => v.type === variantType);

              if (!variant) {
                console.warn(`⚠️  ImageSet ${imageSet.id} missing variant: ${variantType}`);
                continue; // Skip missing variant, proceed with others
              }

              try {
                const imageBuffer = await imageStorage.readImage(variant.path);

                // Generate filename: {sanitized-source-name}_{imageset-id}_{variantType}.{extension}
                const sanitizedName = sanitizeLocationName(location.source.name);
                const extension = getFileExtension(variant.path);
                const imageSetToken = toSafeFileToken(imageSet.id, "imageset");
                const filename = `${sanitizedName}_${imageSetToken}_${variantType}.${extension}`;

                console.log(`🖼️  [VARIANT] Uploading ${variantType} for media-set ${mediaSetId}`);

                // Warn if locationRef is missing (helps catch issues early)
                if (!mediaLocationRef) {
                  console.warn(
                    `⚠️  Location ${location.id} (${location.source.name}) has no payload_location_ref. ` +
                    `Media assets will be uploaded without location hierarchy link.`
                  );
                }

                const mediaAssetId = await payloadClient.uploadImage(
                  imageBuffer,
                  filename,
                  altText,
                  {
                    locationRef: mediaLocationRef || undefined,
                    photographerCredit,
                    mediaSet: mediaSetId,        // ⭐ NEW: Link to media-set
                    variant: variantType,         // ⭐ NEW: Specify variant type
                  }
                );

                console.log(`✅ [VARIANT] Uploaded ${variantType} → MediaAsset: ${mediaAssetId}`);
                uploadedVariantsCount++;
              } catch (error) {
                console.warn(`⚠️  Failed to upload variant ${variantType} for ImageSet ${imageSet.id}:`, error);
                // Continue with remaining variants (graceful degradation)
              }
            }
          }

          // ⭐ STEP 3: Add media-set ID to gallery
          if (shouldUploadVariants && uploadedVariantsCount === 0) {
            console.warn(`⚠️  No variants were uploaded for ImageSet ${imageSet.id}, skipping media-set`);
            galleryUploadFailures++;
          } else {
            galleryImageIds.push(mediaSetId);
            if (existingMediaSetId) {
              console.log(
                `✅ [MEDIA-SET] Added refreshed media-set ${mediaSetId} to gallery (${uploadedVariantsCount}/${variantOrder.length} variants uploaded)`
              );
            } else if (shouldUploadVariants) {
              console.log(
                `✅ [MEDIA-SET] Added new media-set ${mediaSetId} to gallery (${uploadedVariantsCount}/${variantOrder.length} variants uploaded, legacy per-variant flow)`
              );
            } else {
              console.log(
                `✅ [MEDIA-SET] Added new media-set ${mediaSetId} to gallery (created via from-source pipeline)`,
              );
            }
          }
        } catch (error) {
          console.error(`❌ [MEDIA-SET] Failed to process ImageSet ${imageSet.id}:`, error);
          galleryUploadFailures++;
          // Continue with next upload (graceful degradation), but the count above
          // ensures the overall sync is NOT reported as a clean success.
        }
      }
    }

    // Process Instagram embeds (FIRST image only + create post)
    for (const embed of location.instagram_embeds) {
      if (embed.images && embed.images.length > 0) {
        const previewImagePath = embed.images[0];
        if (!previewImagePath) continue; // Skip if no preview image

        let previewMediaAssetId: string | null = null;

        try {
          // Step 1: Upload ONLY first image as preview
          const imageBuffer = await imageStorage.readImage(previewImagePath);

          // Generate filename: {sanitized-source-name}_instagram_{post-token}.{extension}
          const sanitizedName = sanitizeLocationName(location.source.name);
          const extension = getFileExtension(previewImagePath);
          const instagramPostToken =
            extractInstagramShortcode(embed.url) ?? toSafeFileToken(embed.id, "post");
          const filename = `${sanitizedName}_instagram_${instagramPostToken}.${extension}`;

          const altText = `Instagram post by ${embed.username} at ${location.title || location.source.name}`;

          // Debug: Log what we're about to send (Instagram embed)
          console.log('🔍 [UPLOAD DEBUG - INSTAGRAM] Location data:', {
            locationId: location.id,
            locationName: location.source.name,
            payload_location_ref: location.payload_location_ref,
            payload_location_ref_type: typeof location.payload_location_ref,
            resolved_location_ref: mediaLocationRef,
            will_send_locationRef: mediaLocationRef || undefined,
          });

          // Warn if locationRef is missing
          if (!mediaLocationRef) {
            console.warn(
              `⚠️  Instagram embed for location ${location.id} (${location.source.name}) has no payload_location_ref.`
            );
          }

          previewMediaAssetId = await payloadClient.uploadImage(
            imageBuffer,
            filename,
            altText,
            {
              locationRef: mediaLocationRef || undefined,
              photographerCredit: normalizeInstagramPhotographerCredit(embed.username),
            }
          );

          // Step 2: Create Instagram post with preview image
          const postTitle = createInstagramPostTitle(embed.username, location);
          const instagramPostId = await payloadClient.createInstagramPost({
            title: postTitle,
            embedCode: embed.embed_code,
            previewImage: previewMediaAssetId,
            status: "published",
          });

          instagramPostIds.push(instagramPostId);

        } catch (error) {
          if (previewMediaAssetId) {
            console.warn(
              `⚠️  Instagram post creation failed for ${embed.username}, ` +
              `but preview image was uploaded (MediaAsset: ${previewMediaAssetId})`
            );
          } else {
            console.warn(`⚠️  Failed to process Instagram embed for ${embed.username}:`, error);
          }
          // Continue with other embeds
        }
      }
    }
  } catch (error) {
    console.error("Error uploading images:", error);
    throw error;
  }

  return { galleryImageIds, instagramPostIds, galleryUploadFailures };
}

function normalizePhotographerCredit(value: string | null | undefined): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function normalizeInstagramPhotographerCredit(username: string | undefined): string {
  if (!username) {
    return "Unknown";
  }

  const normalized = username.trim();
  if (!normalized) {
    return "Unknown";
  }

  return normalized.startsWith("@") ? normalized : `@${normalized}`;
}

/**
 * Create Instagram post title from username and location
 */
function createInstagramPostTitle(username: string, location: LocationResponse): string {
  const locationName = location.title || location.source.name;
  const cleanUsername = username.replace(/^@/, "");
  return `@${cleanUsername} at ${locationName}`;
}

function toSafeFileToken(value: string | number | null | undefined, fallback: string): string {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return fallback;
  }

  const normalized = raw
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || fallback;
}

function extractInstagramShortcode(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }

  const match = url.match(/\/p\/([^/?#]+)/i);
  if (!match?.[1]) {
    return null;
  }

  return toSafeFileToken(match[1], "post");
}
