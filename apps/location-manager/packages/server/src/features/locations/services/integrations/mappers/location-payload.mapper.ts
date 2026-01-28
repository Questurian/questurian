import type { LocationResponse, LocationCategory } from "../../../models/location";
import type { UploadedImagesResult } from "../types";
import { extractPhoneNumber, convertIsoToPhoneCountryCode } from "../utils";

/**
 * Map url-util location to Payload format
 * @param locationRef - REQUIRED by Payload CMS, guaranteed to be present by caller
 */
export function mapLocationToPayloadFormat(
  location: LocationResponse,
  uploadedImages: UploadedImagesResult,
  locationRef: string
) {
  return {
    title: location.title || location.source.name,
    locationRef, // Always included - required by Payload
    gallery: uploadedImages.galleryImageIds.map(id => ({
      image: id,
      altText: "",
      caption: "",
    })),
    instagramGallery: uploadedImages.instagramPostIds.map(id => ({
      post: id,
    })),
    address: location.contact.url || "",
    countryCode: convertIsoToPhoneCountryCode(location.contact.countryCode || undefined) || "",
    phoneNumber: extractPhoneNumber(location.contact.phoneNumber || undefined) || "",
    website: location.contact.website || "",
    latitude: location.coordinates.lat || undefined,
    longitude: location.coordinates.lng || undefined,
    status: "published" as const,
    ...(location.type ? { type: location.type } : {}),
  };
}

/**
 * Map category to Payload collection name
 */
export function mapCategoryToCollection(
  category: LocationCategory
): "dining" | "accommodations" | "attractions" | "nightlife" {
  // Direct mapping - categories match collection names
  return category as "dining" | "accommodations" | "attractions" | "nightlife";
}

/**
 * Map locationKey to Payload location identifier
 * url-util: "colombia|bogota|chapinero"
 * Payload: "bogota-colombia" (or similar format)
 */
export function mapLocationKeyToPayloadLocation(locationKey?: string): string | undefined {
  if (!locationKey) return undefined;

  const parts = locationKey.split("|");
  if (parts.length < 2) return undefined;

  const [country, city] = parts;
  return `${city}-${country}`.toLowerCase();
}
