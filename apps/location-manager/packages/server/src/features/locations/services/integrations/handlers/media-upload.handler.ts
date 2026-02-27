import type { LocationResponse } from "../../../models/location";
import type { PayloadApiClient } from "../clients/payload-api.client";
import { ImageStorageService } from "../../storage/image-storage.service";
import type { UploadedImagesResult } from "../types";
import type { ImageVariantType } from "@questurian/lm-shared";
import { sanitizeLocationName, getFileExtension } from "../../../utils/location-utils";

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

          if (existingMediaSetId) {
            // Media-set already exists from previous sync
            console.log(`✅ [MEDIA-SET] Found existing media-set: ${existingMediaSetId} (skipping variant uploads)`);
            mediaSetId = existingMediaSetId;
            shouldUploadVariants = false; // Don't re-upload variants

            // Backfill locationRef on existing media-set and variant assets
            if (mediaLocationRef) {
              try {
                await payloadClient.setMediaSetLocationRef(mediaSetId, mediaLocationRef);

                const variantAssetIds = await payloadClient.getMediaSetVariantAssetIds(mediaSetId);
                let updatedVariantCount = 0;

                for (const variantAssetId of variantAssetIds) {
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
                  `✅ [MEDIA-SET] Backfilled locationRef for media-set ${mediaSetId} and ${updatedVariantCount}/${variantAssetIds.length} variants`
                );
              } catch (error) {
                console.warn(
                  `⚠️  Failed to backfill locationRef for existing media-set ${mediaSetId}:`,
                  error
                );
              }
            }
          } else {
            // Media-set doesn't exist, create it
            console.log(`📦 [MEDIA-SET] Creating new media-set`);
            mediaSetId = await payloadClient.createMediaSet({
              title: mediaSetTitle,
              alt_text: altText,
              externalRef: externalRef,
              location: location.locationKey || undefined,
              tags: [], // Add tags mapping if needed
            });
            shouldUploadVariants = true; // Upload variants for new media-set
          }

          console.log(`✅ [MEDIA-SET] Media-set ready: ${mediaSetId}`);

          // ⭐ STEP 2: Upload variants ONLY if this is a new media-set
          const variantOrder: ImageVariantType[] = [
            'thumbnail',
            'square',
            'wide',
            'social',
            'editorial',
            'portrait',
            'hero'
          ];
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

                // Generate filename: {sanitized-source-name}_{variantType}.{extension}
                const sanitizedName = sanitizeLocationName(location.source.name);
                const extension = getFileExtension(variant.path);
                const filename = `${sanitizedName}_${variantType}.${extension}`;

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
          } else {
            // Media-set already exists, variants already uploaded in previous sync
            console.log(`⏭️  [MEDIA-SET] Skipping variant uploads (already synced previously)`);
          }

          // ⭐ STEP 3: Add media-set ID to gallery
          if (shouldUploadVariants && uploadedVariantsCount === 0) {
            // New media-set but no variants uploaded (error case)
            console.warn(`⚠️  No variants were uploaded for new ImageSet ${imageSet.id}, skipping media-set`);
          } else {
            // Add to gallery: either new media-set with variants, or existing media-set (re-sync)
            galleryImageIds.push(mediaSetId);
            if (shouldUploadVariants) {
              console.log(
                `✅ [MEDIA-SET] Added new media-set ${mediaSetId} to gallery (${uploadedVariantsCount}/${variantOrder.length} variants uploaded)`
              );
            } else {
              console.log(`✅ [MEDIA-SET] Added existing media-set ${mediaSetId} to gallery (already synced)`);
            }
          }
        } catch (error) {
          console.error(`❌ [MEDIA-SET] Failed to process ImageSet ${imageSet.id}:`, error);
          // Continue with next upload
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

          // Generate filename: {sanitized-source-name}_instagram.{extension}
          const sanitizedName = sanitizeLocationName(location.source.name);
          const extension = getFileExtension(previewImagePath);
          const filename = `${sanitizedName}_instagram.${extension}`;

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

  return { galleryImageIds, instagramPostIds };
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
