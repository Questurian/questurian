import type { LocationResponse, LocationCategory } from "../../../models/location";
import { BadRequestError } from "@shared/errors/http-error";
import type { UploadedImagesResult } from "../types";
import { extractPhoneNumber, convertIsoToPhoneCountryCode } from "../utils";

// App stores $, $$, $$$, $$$$ — Payload expects "1", "2", "3", "4"
const PRICE_LEVEL_TO_PAYLOAD: Record<string, string> = {
  "$": "1",
  "$$": "2",
  "$$$": "3",
  "$$$$": "4",
};

/**
 * Strip 'currently_open' from operationHours (real-time snapshot determined on frontend)
 */
function stripCurrentlyOpenFromOperationHours(
  operationHours: Record<string, unknown> | null
): Record<string, unknown> | null {
  if (!operationHours) return null;

  const { currently_open, ...rest } = operationHours as Record<string, unknown>;
  return Object.keys(rest).length > 0 ? rest : null;
}

/**
 * Map url-util location to Payload format
 * @param locationRef - REQUIRED by Payload CMS, guaranteed to be present by caller
 */
export function mapLocationToPayloadFormat(
  location: LocationResponse,
  uploadedImages: UploadedImagesResult,
  locationRef: string
) {
  const cleanedOperationHours = stripCurrentlyOpenFromOperationHours(location.operationHours as Record<string, unknown> | null);

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
    ...(location.priceLevel && PRICE_LEVEL_TO_PAYLOAD[location.priceLevel] ? { priceLevel: PRICE_LEVEL_TO_PAYLOAD[location.priceLevel] } : {}),
    ...(location.contact.email ? { email: location.contact.email } : {}),
    ...(cleanedOperationHours ? { operationHours: cleanedOperationHours } : {}),
    ...(location.tripadvisorCuisines ? { cuisines: location.tripadvisorCuisines } : {}),
    ...(location.idealFor ? { idealFor: location.idealFor } : {}),
    ...(location.ianaTimeId ? { ianaTimeId: location.ianaTimeId } : {}),
  };
}

/**
 * Map category to Payload collection name
 */
export function mapCategoryToCollection(
  category: LocationCategory
): "dining" | "accommodations" | "attractions" | "nightlife" {
  switch (category) {
    case "dining":
    case "accommodations":
    case "attractions":
    case "nightlife":
      return category;
    case "key_locations":
      throw new BadRequestError("Payload sync does not support key_locations category");
    default: {
      const exhaustiveCheck: never = category;
      throw new BadRequestError(`Unsupported payload category: ${String(exhaustiveCheck)}`);
    }
  }
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
