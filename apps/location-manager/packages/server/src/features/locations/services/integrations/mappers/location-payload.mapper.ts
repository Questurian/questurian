import { BadRequestError } from "@shared/errors/http-error";
import type {
  LocationCategory,
  LocationResponse,
} from "../../../models/location";
import type { PayloadEntryData } from "../clients/payload-api.client";
import type { UploadedImagesResult } from "../types";
import { mapAccommodationsPayload } from "./location-payload/accommodations.mapper";
import { mapAttractionsPayload } from "./location-payload/attractions.mapper";
import { mapDiningPayload } from "./location-payload/dining.mapper";
import { mapKeyLocationsPayload } from "./location-payload/key-locations.mapper";
import { mapNightlifePayload } from "./location-payload/nightlife.mapper";
import { stripLegacyLmFields } from "./location-payload/shared-fields.mapper";

export type PayloadCollection =
  | "dining"
  | "accommodations"
  | "attractions"
  | "nightlife"
  | "key-locations";

/**
 * Map a Location Manager location to the owning Questura collection contract.
 * locationRef is required by Payload and guaranteed to be present by the caller.
 */
export function mapLocationToPayloadFormat(
  location: LocationResponse,
  uploadedImages: UploadedImagesResult,
  locationRef: string,
  options: { tourPayloadIds?: string[] } = {}
): PayloadEntryData {
  let mapped: PayloadEntryData;

  switch (location.category) {
    case "dining":
      mapped = mapDiningPayload(location, uploadedImages, locationRef);
      break;
    case "accommodations":
      mapped = mapAccommodationsPayload(location, uploadedImages, locationRef);
      break;
    case "attractions":
      mapped = mapAttractionsPayload(
        location,
        uploadedImages,
        locationRef,
        options.tourPayloadIds
      );
      break;
    case "nightlife":
      mapped = mapNightlifePayload(location, uploadedImages, locationRef);
      break;
    case "key_locations":
      mapped = mapKeyLocationsPayload(location, uploadedImages, locationRef);
      break;
    default:
      throw unsupportedCategory(location.category);
  }

  return stripLegacyLmFields(mapped);
}

export function mapCategoryToCollection(
  category: LocationCategory
): PayloadCollection {
  switch (category) {
    case "dining":
    case "accommodations":
    case "attractions":
    case "nightlife":
      return category;
    case "key_locations":
      return "key-locations";
    default:
      throw unsupportedCategory(category);
  }
}

export function mapLocationKeyToPayloadLocation(
  locationKey?: string
): string | undefined {
  if (!locationKey) return undefined;

  const parts = locationKey.split("|");
  if (parts.length < 2) return undefined;

  const [country, city] = parts;
  return `${city}-${country}`.toLowerCase();
}

function unsupportedCategory(category: never): BadRequestError {
  return new BadRequestError(`Unsupported payload category: ${String(category)}`);
}
