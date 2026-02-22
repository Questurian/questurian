import type { LocationResponse, LocationCategory } from "../../../models/location";
import { BadRequestError } from "@shared/errors/http-error";
import type { UploadedImagesResult } from "../types";
import type { PayloadEntryData, PayloadNightlifeDetails } from "../clients/payload-api.client";
import { extractPhoneNumber, convertIsoToPhoneCountryCode } from "../utils";

export type PayloadCollection = "dining" | "accommodations" | "attractions" | "nightlife" | "key-locations";

const LEGACY_LM_ONLY_FIELDS = [
  "neighborhoodDescription",
  "tripadvisorUrl",
  "tripadvisorLocationId",
  "placeId",
  "contactAddress",
  "sourceAddress",
  "locationKey",
  "district",
] as const;

// App stores $, $$, $$$, $$$$ — Payload expects "1", "2", "3", "4"
const PRICE_LEVEL_TO_PAYLOAD: Record<string, string> = {
  "$": "1",
  "$$": "2",
  "$$$": "3",
  "$$$$": "4",
};

const WEEKDAY_LABELS: Record<string, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

function normalizeOperationHoursForPayload(
  operationHours: Record<string, unknown> | null
): { hours: Array<{ day: string; hours: string }> } | undefined {
  if (!operationHours) return undefined;

  const rawHours = operationHours.hours;
  if (Array.isArray(rawHours)) {
    const normalizedRows = rawHours
      .map((row) => {
        if (!row || typeof row !== "object" || Array.isArray(row)) return null;
        const day = typeof (row as { day?: unknown }).day === "string"
          ? (row as { day: string }).day.trim()
          : "";
        const hours = typeof (row as { hours?: unknown }).hours === "string"
          ? (row as { hours: string }).hours.trim()
          : "";
        if (!day || !hours) return null;
        return { day, hours };
      })
      .filter((row): row is { day: string; hours: string } => row !== null);

    return normalizedRows.length > 0 ? { hours: normalizedRows } : undefined;
  }

  // Backward compatibility: convert day-key maps into canonical array format.
  const normalizedRows = Object.entries(operationHours)
    .filter(([key]) => key !== "currently_open" && key !== "hours")
    .map(([key, value]) => {
      const dayLabel = WEEKDAY_LABELS[key.toLowerCase()] ?? key;
      const hours = typeof value === "string" ? value.trim() : "";
      if (!hours) return null;
      return { day: dayLabel, hours };
    })
    .filter((row): row is { day: string; hours: string } => row !== null);

  return normalizedRows.length > 0 ? { hours: normalizedRows } : undefined;
}

function parseKeyLocationStatus(location: LocationResponse): string | undefined {
  const details = location.keyLocationsDetails;
  if (!details || typeof details !== "object") return undefined;

  const detailsRecord = details as Record<string, unknown>;
  const status =
    detailsRecord.status
    ?? asRecord(detailsRecord.core)?.status
    ?? asRecord(detailsRecord.core)?.["status"];
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
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "yes" || normalized === "1") return true;
    if (normalized === "false" || normalized === "no" || normalized === "0") return false;
  }
  return undefined;
}

function unwrapLabeledValue(value: unknown): unknown {
  const record = asRecord(value);
  if (!record) return value;
  if (Object.prototype.hasOwnProperty.call(record, "value")) {
    return record.value;
  }
  return value;
}

function getNightlifeSectionValue(
  details: Record<string, unknown>,
  section: "theSpace" | "theScene" | "theDetails",
  key: string
): unknown {
  const newSchemaSection = asRecord(details[section]);
  const oldSchemaDetails = asRecord(details.details);
  const oldSchemaSection = asRecord(oldSchemaDetails?.[section]);
  const candidate = newSchemaSection?.[key] ?? oldSchemaSection?.[key];
  return unwrapLabeledValue(candidate);
}

function getNightlifeDetailsPayload(location: LocationResponse): PayloadNightlifeDetails {
  const details = asRecord(location.nightlifeDetails) ?? {};
  const core = asRecord(details.core);
  const sectionDetails = asRecord(details.theDetails);

  const coreName = asString(core?.name) ?? asString(details.name) ?? location.title ?? location.source.name ?? "";
  const clubType = asString(core?.clubType) ?? asString(details.club_type) ?? asString(location.type) ?? "";
  const priceTier = asString(core?.priceTier) ?? asString(details.price_tier) ?? asString(location.priceLevel) ?? "";
  const music = asStringArray(core?.music ?? details.music) ?? [];
  const idealFor = asStringArray(core?.idealFor ?? location.idealFor) ?? [];

  const operationHours =
    asRecord(sectionDetails?.operationHours)
    ?? asRecord(getNightlifeSectionValue(details, "theDetails", "operationHours"))
    ?? location.operationHours
    ?? {};
  const reserveUrl = asString(sectionDetails?.reserveUrl)
    ?? asString(details.reserve_url)
    ?? asString(getNightlifeSectionValue(details, "theDetails", "reserveUrl"))
    ?? "";
  const daytimeRestaurant = asBoolean(sectionDetails?.daytimeRestaurant)
    ?? asBoolean(details.daytime_restaurant)
    ?? asBoolean(getNightlifeSectionValue(details, "theDetails", "daytimeRestaurant"))
    ?? false;

  return {
    core: {
      name: coreName,
      clubType,
      priceTier,
      music,
      idealFor,
    },
    theSpace: {
      venueType: asString(getNightlifeSectionValue(details, "theSpace", "venueType")) ?? "",
      venueSize: asString(getNightlifeSectionValue(details, "theSpace", "venueSize")) ?? "",
      spaceLayout: asStringArray(getNightlifeSectionValue(details, "theSpace", "spaceLayout")) ?? [],
      vibe: asStringArray(getNightlifeSectionValue(details, "theSpace", "vibe")) ?? [],
      peakHours: asString(getNightlifeSectionValue(details, "theSpace", "peakHours")) ?? "",
    },
    theScene: {
      musicFormat: asStringArray(getNightlifeSectionValue(details, "theScene", "musicFormat")) ?? [],
      touristPresence: asString(getNightlifeSectionValue(details, "theScene", "touristPresence")) ?? "",
      dressCode: asStringArray(getNightlifeSectionValue(details, "theScene", "dressCode")) ?? [],
      energyLevel: asString(getNightlifeSectionValue(details, "theScene", "energyLevel")) ?? "",
      vipAndBottleService: asString(getNightlifeSectionValue(details, "theScene", "vipAndBottleService")) ?? "",
      crowdProfile: asString(getNightlifeSectionValue(details, "theScene", "crowdProfile")) ?? "",
    },
    theDetails: {
      operationHours,
      reserveUrl,
      daytimeRestaurant,
    },
  };
}

function getAttractionsDetailsPayload(location: LocationResponse): Record<string, unknown> {
  const details = asRecord(location.attractionsDetails) ?? {};
  const core = asRecord(details.core);
  const visit = asRecord(details.visit);
  const attractionType = asString(core?.attraction_type) ?? asString(location.type);
  const pricing = asString(core?.pricing) ?? asString(location.priceLevel);
  const bookingRequired = asBoolean(visit?.booking_required);
  const idealFor = asStringArray(visit?.ideal_for ?? location.idealFor);
  const payloadCore = {
    ...(attractionType ? { attractionType } : {}),
    ...(pricing ? { pricing } : {}),
  };

  const payloadVisit = {
    ...(bookingRequired !== undefined ? { bookingRequired } : {}),
    ...(idealFor ? { idealFor } : {}),
  };
  return {
    ...(Object.keys(payloadCore).length > 0 ? { core: payloadCore } : {}),
    ...(Object.keys(payloadVisit).length > 0 ? { visit: payloadVisit } : {}),
  };
}

function getKeyLocationsDetailsPayload(location: LocationResponse): Record<string, unknown> {
  const details = asRecord(location.keyLocationsDetails) ?? {};
  const core = asRecord(details.core);
  const nestedDetails = asRecord(details.details);

  const locationType =
    asString(details.location_type)
    ?? asString(core?.locationType)
    ?? asString(core?.location_type)
    ?? asString(location.type);
  const description = asString(details.description) ?? asString(core?.description);
  const status = asString(details.status) ?? asString(core?.status);
  const neighborhood = asString(details.neighborhood) ?? asString(core?.neighborhood);
  const access = asRecord(nestedDetails?.access) ?? asRecord(details.access);
  const info = asRecord(nestedDetails?.info) ?? asRecord(details.info);

  const payloadCore = {
    ...(locationType ? { locationType } : {}),
    ...(description ? { description } : {}),
    ...(status ? { status } : {}),
    ...(neighborhood ? { neighborhood } : {}),
  };

  const payloadDetails = {
    ...(access ? { access } : {}),
    ...(info ? { info } : {}),
  };

  return {
    ...(Object.keys(payloadCore).length > 0 ? { core: payloadCore } : {}),
    ...(Object.keys(payloadDetails).length > 0 ? { details: payloadDetails } : {}),
  };
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
  const sharedFields = mapSharedPayloadFields(location, uploadedImages, locationRef);
  const { countryCodeIso, sourceName, ...diningSharedFields } = sharedFields;
  const operationHours = normalizeOperationHoursForPayload(location.operationHours);

  return {
    ...diningSharedFields,
    ...mapCategoryCommonPayloadFields(location),
    ...(operationHours ? { operationHours } : {}),
    ...(location.idealFor ? { idealFor: location.idealFor } : {}),
    ...(location.tripadvisorCuisines ? { cuisines: location.tripadvisorCuisines } : {}),
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
  const operationHours = normalizeOperationHoursForPayload(location.operationHours);
  const attractionsDetails = getAttractionsDetailsPayload(location);

  return {
    ...mapSharedPayloadFields(location, uploadedImages, locationRef),
    ...mapCategoryCommonPayloadFields(location),
    ...(location.locationKey ? { location: location.locationKey } : {}),
    ...(operationHours ? { operationHours } : {}),
    ...(location.idealFor ? { idealFor: location.idealFor } : {}),
    ...(Object.keys(attractionsDetails).length > 0 ? { attractionsDetails } : {}),
  };
}

function mapNightlifePayload(
  location: LocationResponse,
  uploadedImages: UploadedImagesResult,
  locationRef: string
): PayloadEntryData {
  const sharedFields = mapSharedPayloadFields(location, uploadedImages, locationRef);
  const { countryCodeIso, sourceName, ...nightlifeSharedFields } = sharedFields;
  return {
    ...nightlifeSharedFields,
    ...mapCategoryCommonPayloadFields(location),
    location: location.locationKey ?? "",
    nightlifeDetails: getNightlifeDetailsPayload(location),
  };
}

function mapKeyLocationsPayload(
  location: LocationResponse,
  uploadedImages: UploadedImagesResult,
  locationRef: string
): PayloadEntryData {
  const operationHours = normalizeOperationHoursForPayload(location.operationHours);
  const keyLocationsDetails = getKeyLocationsDetailsPayload(location);
  const keyLocationStatus = parseKeyLocationStatus(location);

  return {
    ...mapSharedPayloadFields(location, uploadedImages, locationRef),
    ...mapCategoryCommonPayloadFields(location),
    ...(location.locationKey ? { location: location.locationKey } : {}),
    ...(operationHours ? { operationHours } : {}),
    ...(Object.keys(keyLocationsDetails).length > 0 ? { keyLocationsDetails } : {}),
    ...(keyLocationStatus ? { keyLocationStatus } : {}),
  };
}

function stripLegacyLmFields(payload: PayloadEntryData): PayloadEntryData {
  const mutable = payload as PayloadEntryData & Record<string, unknown>;
  for (const field of LEGACY_LM_ONLY_FIELDS) {
    delete mutable[field];
  }
  return mutable;
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
  let mapped: PayloadEntryData;
  switch (location.category) {
    case "dining":
      mapped = mapDiningPayload(location, uploadedImages, locationRef);
      break;
    case "accommodations":
      mapped = mapAccommodationsPayload(location, uploadedImages, locationRef);
      break;
    case "attractions":
      mapped = mapAttractionsPayload(location, uploadedImages, locationRef);
      break;
    case "nightlife":
      mapped = mapNightlifePayload(location, uploadedImages, locationRef);
      break;
    case "key_locations":
      mapped = mapKeyLocationsPayload(location, uploadedImages, locationRef);
      break;
    default: {
      const exhaustiveCheck: never = location.category;
      throw new BadRequestError(`Unsupported payload category: ${String(exhaustiveCheck)}`);
    }
  }
  return stripLegacyLmFields(mapped);
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
