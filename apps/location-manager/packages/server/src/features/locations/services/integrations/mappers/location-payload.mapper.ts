import type { LocationResponse, LocationCategory } from "../../../models/location";
import { BadRequestError } from "@shared/errors/http-error";
import type { UploadedImagesResult } from "../types";
import type { PayloadEntryData } from "../clients/payload-api.client";
import { extractPhoneNumber, convertIsoToPhoneCountryCode } from "../utils";

export type PayloadCollection = "dining" | "accommodations" | "attractions" | "nightlife" | "key-locations";

// App stores $, $$, $$$, $$$$ — Payload expects "1", "2", "3", "4"
const PRICE_LEVEL_TO_PAYLOAD: Record<string, string> = {
  "$": "1",
  "$$": "2",
  "$$$": "3",
  "$$$$": "4",
};

function parseKeyLocationStatus(location: LocationResponse): string | undefined {
  const details = location.keyLocationsDetails;
  if (!details || typeof details !== "object") return undefined;

  const status = (details as Record<string, unknown>).status;
  return typeof status === "string" && status.trim().length > 0 ? status.trim() : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const normalized = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
  return normalized.length > 0 ? normalized : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "yes" || normalized === "1") return true;
    if (normalized === "false" || normalized === "no" || normalized === "0") return false;
  }
  return undefined;
}

function parseAccommodationsGroups(location: LocationResponse): Record<string, unknown> {
  const details = asRecord(location.accommodationsDetails);
  if (!details) return {};

  const core = asRecord(details.core);
  const theStay = asRecord(details.the_stay);
  const theExperience = asRecord(details.the_experience);
  const theDetails = asRecord(details.the_details);

  const payloadCore = {
    ...(asString(core?.name) ? { name: asString(core?.name) } : {}),
    ...(asString(core?.price) ? { price: asString(core?.price) } : {}),
    ...(asString(core?.district) ? { district: asString(core?.district) } : {}),
    ...(asString(core?.type) ? { type: asString(core?.type) } : {}),
  };

  const payloadStay = {
    ...(asStringArray(theStay?.perfect_for) ? { perfectFor: asStringArray(theStay?.perfect_for) } : {}),
    ...(asBoolean(theStay?.kid_friendly) !== undefined ? { kidFriendly: asBoolean(theStay?.kid_friendly) } : {}),
    ...(asBoolean(theStay?.ac) !== undefined ? { ac: asBoolean(theStay?.ac) } : {}),
    ...(asBoolean(theStay?.wifi) !== undefined ? { wifi: asBoolean(theStay?.wifi) } : {}),
    ...(asBoolean(theStay?.extra_guest_fee) !== undefined ? { extraGuestFee: asBoolean(theStay?.extra_guest_fee) } : {}),
    ...(asStringArray(theStay?.parking) ? { parking: asStringArray(theStay?.parking) } : {}),
    ...(asBoolean(theStay?.breakfast_served) !== undefined ? { breakfastServed: asBoolean(theStay?.breakfast_served) } : {}),
  };

  const payloadExperience = {
    ...(asStringArray(theExperience?.vibe) ? { vibe: asStringArray(theExperience?.vibe) } : {}),
    ...(asString(theExperience?.workspace) ? { workspace: asString(theExperience?.workspace) } : {}),
    ...(asBoolean(theExperience?.restaurant) !== undefined ? { restaurant: asBoolean(theExperience?.restaurant) } : {}),
    ...(asStringArray(theExperience?.pool) ? { pool: asStringArray(theExperience?.pool) } : {}),
    ...(asBoolean(theExperience?.rooftop_lounge) !== undefined ? { rooftopLounge: asBoolean(theExperience?.rooftop_lounge) } : {}),
    ...(asStringArray(theExperience?.jacuzzi) ? { jacuzzi: asStringArray(theExperience?.jacuzzi) } : {}),
    ...(asString(theExperience?.gym) ? { gym: asString(theExperience?.gym) } : {}),
  };

  const payloadDetails = {
    ...(asString(theDetails?.address) ? { address: asString(theDetails?.address) } : {}),
    ...(asString(theDetails?.walkability) ? { walkability: asString(theDetails?.walkability) } : {}),
    ...(asString(theDetails?.check_in_time) ? { checkInTime: asString(theDetails?.check_in_time) } : {}),
    ...(asString(theDetails?.check_out_time) ? { checkOutTime: asString(theDetails?.check_out_time) } : {}),
    ...(asString(theDetails?.phone) ? { phone: asString(theDetails?.phone) } : {}),
    ...(asString(theDetails?.website_url) ? { websiteUrl: asString(theDetails?.website_url) } : {}),
    ...(asString(theDetails?.booking_url) ? { bookingUrl: asString(theDetails?.booking_url) } : {}),
    ...(asString(theDetails?.google_maps_url) ? { googleMapsUrl: asString(theDetails?.google_maps_url) } : {}),
  };

  return {
    ...(Object.keys(payloadCore).length > 0 ? { core: payloadCore } : {}),
    ...(Object.keys(payloadStay).length > 0 ? { theStay: payloadStay } : {}),
    ...(Object.keys(payloadExperience).length > 0 ? { theExperience: payloadExperience } : {}),
    ...(Object.keys(payloadDetails).length > 0 ? { theDetails: payloadDetails } : {}),
  };
}

function mapSharedPayloadFields(
  location: LocationResponse,
  uploadedImages: UploadedImagesResult,
  locationRef: string
): Pick<
  PayloadEntryData,
  | "title"
  | "locationRef"
  | "gallery"
  | "instagramGallery"
  | "address"
  | "countryCode"
  | "phoneNumber"
  | "website"
  | "latitude"
  | "longitude"
  | "status"
  | "email"
  | "countryCodeIso"
  | "sourceName"
> {
  return {
    title: location.title || location.source.name,
    locationRef,
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
    ...(location.contact.email ? { email: location.contact.email } : {}),
    ...(location.contact.countryCode ? { countryCodeIso: location.contact.countryCode } : {}),
    ...(location.source.name ? { sourceName: location.source.name } : {}),
  };
}

function mapCategoryCommonPayloadFields(location: LocationResponse) {
  return {
    ...(location.type ? { type: location.type } : {}),
    ...(location.priceLevel && PRICE_LEVEL_TO_PAYLOAD[location.priceLevel]
      ? { priceLevel: PRICE_LEVEL_TO_PAYLOAD[location.priceLevel] }
      : {}),
    ...(location.ianaTimeId ? { ianaTimeId: location.ianaTimeId } : {}),
  };
}

function mapDiningPayload(
  location: LocationResponse,
  uploadedImages: UploadedImagesResult,
  locationRef: string
): PayloadEntryData {
  return {
    ...mapSharedPayloadFields(location, uploadedImages, locationRef),
    ...mapCategoryCommonPayloadFields(location),
    ...(location.idealFor ? { idealFor: location.idealFor } : {}),
    ...(location.tripadvisorMealTypes ? { mealTypes: location.tripadvisorMealTypes } : {}),
    ...(location.tripadvisorCuisines ? { cuisines: location.tripadvisorCuisines } : {}),
    ...(location.tripadvisorFeatures ? { features: location.tripadvisorFeatures } : {}),
  };
}

function mapAccommodationsPayload(
  location: LocationResponse,
  uploadedImages: UploadedImagesResult,
  locationRef: string
): PayloadEntryData {
  return {
    ...mapSharedPayloadFields(location, uploadedImages, locationRef),
    ...mapCategoryCommonPayloadFields(location),
    ...parseAccommodationsGroups(location),
  };
}

function mapAttractionsPayload(
  location: LocationResponse,
  uploadedImages: UploadedImagesResult,
  locationRef: string
): PayloadEntryData {
  return {
    ...mapSharedPayloadFields(location, uploadedImages, locationRef),
    ...mapCategoryCommonPayloadFields(location),
    ...(location.idealFor ? { idealFor: location.idealFor } : {}),
    ...(location.attractionsDetails ? { attractionsDetails: location.attractionsDetails } : {}),
  };
}

function mapNightlifePayload(
  location: LocationResponse,
  uploadedImages: UploadedImagesResult,
  locationRef: string
): PayloadEntryData {
  return {
    ...mapSharedPayloadFields(location, uploadedImages, locationRef),
    ...mapCategoryCommonPayloadFields(location),
    ...(location.nightlifeDetails ? { nightlifeDetails: location.nightlifeDetails } : {}),
  };
}

function mapKeyLocationsPayload(
  location: LocationResponse,
  uploadedImages: UploadedImagesResult,
  locationRef: string
): PayloadEntryData {
  const keyLocationStatus = parseKeyLocationStatus(location);
  return {
    ...mapSharedPayloadFields(location, uploadedImages, locationRef),
    ...mapCategoryCommonPayloadFields(location),
    ...(location.keyLocationsDetails ? { keyLocationsDetails: location.keyLocationsDetails } : {}),
    ...(keyLocationStatus ? { keyLocationStatus } : {}),
  };
}

/**
 * Map url-util location to Payload format
 * @param locationRef - REQUIRED by Payload CMS, guaranteed to be present by caller
 */
export function mapLocationToPayloadFormat(
  location: LocationResponse,
  uploadedImages: UploadedImagesResult,
  locationRef: string
): PayloadEntryData {
  switch (location.category) {
    case "dining":
      return mapDiningPayload(location, uploadedImages, locationRef);
    case "accommodations":
      return mapAccommodationsPayload(location, uploadedImages, locationRef);
    case "attractions":
      return mapAttractionsPayload(location, uploadedImages, locationRef);
    case "nightlife":
      return mapNightlifePayload(location, uploadedImages, locationRef);
    case "key_locations":
      return mapKeyLocationsPayload(location, uploadedImages, locationRef);
    default: {
      const exhaustiveCheck: never = location.category;
      throw new BadRequestError(`Unsupported payload category: ${String(exhaustiveCheck)}`);
    }
  }
}

/**
 * Map category to Payload collection name
 */
export function mapCategoryToCollection(category: LocationCategory): PayloadCollection {
  switch (category) {
    case "dining":
    case "accommodations":
    case "attractions":
    case "nightlife":
      return category;
    case "key_locations":
      return "key-locations";
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
