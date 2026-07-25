import { sanitizeLocationName, getFileExtension } from "../../../../utils/location-utils";
import {
  createInstagramPostTitle,
  extractInstagramShortcode,
  normalizeInstagramPhotographerCredit,
  toSafeFileToken,
} from "./media-upload.utils";
import type { MediaUploadContext } from "./media-upload.types";

export async function uploadLocationInstagramEmbeds(
  context: MediaUploadContext,
): Promise<string[]> {
  const {
    location,
    payloadClient,
    imageStorage,
    mediaLocationRef,
  } = context;
  const instagramPostIds: string[] = [];

  for (const embed of location.instagram_embeds) {
    let previewMediaAssetId: string | null = null;
    try {
      const previewImagePath = embed.images?.[0];
      if (previewImagePath) {
        const imageBuffer = await imageStorage.readImage(previewImagePath);
        const sanitizedName = sanitizeLocationName(location.source.name);
        const extension = getFileExtension(previewImagePath);
        const instagramPostToken =
          extractInstagramShortcode(embed.url) ?? toSafeFileToken(embed.id, "post");
        const filename = `${sanitizedName}_instagram_${instagramPostToken}.${extension}`;
        const altText =
          `Instagram post by ${embed.username} at ${location.title || location.source.name}`;

        console.log("🔍 [UPLOAD DEBUG - INSTAGRAM] Location data:", {
          locationId: location.id,
          locationName: location.source.name,
          payload_location_ref: location.payload_location_ref,
          payload_location_ref_type: typeof location.payload_location_ref,
          resolved_location_ref: mediaLocationRef,
          will_send_locationRef: mediaLocationRef || undefined,
        });

        if (!mediaLocationRef) {
          console.warn(
            `⚠️  Instagram embed for location ${location.id} (${location.source.name}) has no payload_location_ref.`,
          );
        }

        previewMediaAssetId = await payloadClient.uploadImage(
          imageBuffer,
          filename,
          altText,
          {
            locationRef: mediaLocationRef || undefined,
            photographerCredit: normalizeInstagramPhotographerCredit(embed.username),
          },
        );
      }

      const postTitle = createInstagramPostTitle(embed.username, location);
      const instagramPostId = await payloadClient.createInstagramPost({
        title: postTitle,
        embedCode: embed.embed_code,
        ...(previewMediaAssetId ? { previewImage: previewMediaAssetId } : {}),
        status: "published",
      });

      instagramPostIds.push(instagramPostId);
    } catch (error) {
      if (previewMediaAssetId) {
        console.warn(
          `⚠️  Instagram post creation failed for ${embed.username}, `
          + `but preview image was uploaded (MediaAsset: ${previewMediaAssetId})`,
        );
      } else {
        console.warn(`⚠️  Failed to process Instagram embed for ${embed.username}:`, error);
      }
    }
  }

  return instagramPostIds;
}
