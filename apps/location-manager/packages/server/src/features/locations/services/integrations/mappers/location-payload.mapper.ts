import type { LocationResponse, LocationCategory } from "../../../models/location";
import { BadRequestError } from "@shared/errors/http-error";
import type { UploadedImagesResult } from "../types";
import type {
  PayloadEntryData,
  PayloadNightlifeDetails,
  PayloadRelationshipId,
} from "../clients/payload-api.client";
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
  "free": "1",
  "budget": "1",
  "inexpensive": "1",
  "mid-range": "2",
  "moderate": "2",
  "expensive": "3",
  "very expensive": "4",
  "luxury": "4",
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

const MAX_ATTRACTION_GALLERY_ITEMS = 20;

/** Questura `accommodations` multi-selects — LM also stores "none" for absent amenities, which Payload rejects. */
const PAYLOAD_ACCOMMODATIONS_PARKING = new Set(["onsite", "valet", "street", "garage"]);
const PAYLOAD_ACCOMMODATIONS_JACUZZI = new Set(["private", "shared", "rooftop"]);
const PAYLOAD_ACCOMMODATIONS_POOL = new Set(["indoor", "outdoor", "rooftop", "infinity"]);
const PAYLOAD_ACCOMMODATIONS_WORKSPACE = new Set([
  "None",
  "Shared Lounge",
  "Dedicated Desk",
  "Co-working Space",
]);

function filterPayloadMultiSelect(
  values: string[] | undefined,
  allowed: Set<string>
): string[] | undefined {
  if (!values?.length) return undefined;
  const filtered = values.filter((v) => allowed.has(v));
  return filtered.length > 0 ? filtered : undefined;
}

function normalizeWorkspaceForPayload(raw: unknown): string | undefined {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    return PAYLOAD_ACCOMMODATIONS_WORKSPACE.has(trimmed) ? trimmed : undefined;
  }
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item !== "string") continue;
      const trimmed = item.trim();
      if (PAYLOAD_ACCOMMODATIONS_WORKSPACE.has(trimmed)) {
        return trimmed;
      }
    }
  }
  return undefined;
}

function dedupePreservingOrder(ids: string[]): string[] {
  return Array.from(new Set(ids));
}

function toPayloadRelationshipId(id: string | number): PayloadRelationshipId {
  if (typeof id === "number") {
    return id;
  }

  const trimmed = id.trim();
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }

  return trimmed;
}

function getGalleryImageIds(location: LocationResponse, uploadedImages: UploadedImagesResult): string[] {
  const uploadedGalleryIds = uploadedImages.galleryImageIds;

  if (location.category !== "attractions") {
    return uploadedGalleryIds;
  }

  const selectedPayloadMediaSetIds = location.selectedPayloadMediaSetIds ?? [];
  const combinedGalleryIds = dedupePreservingOrder([
    ...uploadedGalleryIds,
    ...selectedPayloadMediaSetIds,
  ]);

  if (combinedGalleryIds.length > MAX_ATTRACTION_GALLERY_ITEMS) {
    throw new BadRequestError(
      `Attractions gallery exceeds Payload max of ${MAX_ATTRACTION_GALLERY_ITEMS} items`
    );
  }

  return combinedGalleryIds;
}

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
  const clubType = asString(core?.clubType) ?? asString(details.club_type) ?? asString(location.type) ?? null;
  const priceTier = asString(core?.priceTier) ?? asString(details.price_tier) ?? asString(location.priceLevel) ?? null;
  const music = asStringArray(core?.music ?? details.music) ?? [];
  const idealFor = asStringArray(core?.idealFor ?? location.idealFor) ?? [];

  const operationHours =
    asRecord(sectionDetails?.operationHours)
    ?? asRecord(getNightlifeSectionValue(details, "theDetails", "operationHours"))
    ?? location.operationHours
    ?? null;
  const bookingUrl = location.bookingUrl
    ?? asString(sectionDetails?.bookingUrl)
    ?? asString(details.booking_url)
    ?? asString(getNightlifeSectionValue(details, "theDetails", "bookingUrl"))
    ?? asString(details.reserve_url) // legacy pre-ADR-0009 JSON key
    ?? null;
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
      venueType: asString(getNightlifeSectionValue(details, "theSpace", "venueType")) ?? null,
      venueSize: asString(getNightlifeSectionValue(details, "theSpace", "venueSize")) ?? null,
      spaceLayout: asStringArray(getNightlifeSectionValue(details, "theSpace", "spaceLayout")) ?? [],
      vibe: asStringArray(getNightlifeSectionValue(details, "theSpace", "vibe")) ?? [],
      peakHours: asString(getNightlifeSectionValue(details, "theSpace", "peakHours")) ?? null,
    },
    theScene: {
      musicFormat: asStringArray(getNightlifeSectionValue(details, "theScene", "musicFormat")) ?? [],
      touristPresence: asString(getNightlifeSectionValue(details, "theScene", "touristPresence")) ?? null,
      dressCode: asStringArray(getNightlifeSectionValue(details, "theScene", "dressCode")) ?? [],
      energyLevel: asString(getNightlifeSectionValue(details, "theScene", "energyLevel")) ?? null,
      vipAndBottleService: asString(getNightlifeSectionValue(details, "theScene", "vipAndBottleService")) ?? null,
      crowdProfile: asString(getNightlifeSectionValue(details, "theScene", "crowdProfile")) ?? null,
    },
    theDetails: {
      operationHours,
      bookingUrl,
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
  return {
    core: {
      attractionType: attractionType ?? null,
      pricing: pricing ?? null,
    },
    visit: {
      bookingRequired: bookingRequired ?? false,
      bookingUrl: asString(location.bookingUrl) ?? null,
    },
  };
}

function getKeyLocationsDetailsPayload(location: LocationResponse): Record<string, unknown> {
  const details = asRecord(location.keyLocationsDetails) ?? {};
  const core = asRecord(details.core);

  const locationType =
    asString(details.location_type)
    ?? asString(core?.locationType)
    ?? asString(core?.location_type)
    ?? asString(location.type);
  const status = asString(details.status) ?? asString(core?.status);
  const neighborhood = asString(details.neighborhood) ?? asString(core?.neighborhood);

  return {
    core: {
      locationType: locationType ?? null,
      status: status ?? null,
      neighborhood: neighborhood ?? null,
    },
  };
}

function parseAccommodationsGroups(location: LocationResponse): Record<string, unknown> {
  const details = asRecord(location.accommodationsDetails) ?? {};

  const core = asRecord(details.core);
  const theStay = asRecord(details.the_stay);
  const theExperience = asRecord(details.the_experience);
  const theDetails = asRecord(details.the_details);

  const payloadCore = {
    name: asString(core?.name) ?? null,
    price: asString(core?.price) ?? null,
    district: asString(core?.district) ?? null,
    type: asString(core?.type) ?? null,
  };

  const parkingForPayload = filterPayloadMultiSelect(
    asStringArray(theStay?.parking),
    PAYLOAD_ACCOMMODATIONS_PARKING
  );
  const poolForPayload = filterPayloadMultiSelect(
    asStringArray(theExperience?.pool),
    PAYLOAD_ACCOMMODATIONS_POOL
  );
  const jacuzziForPayload = filterPayloadMultiSelect(
    asStringArray(theExperience?.jacuzzi),
    PAYLOAD_ACCOMMODATIONS_JACUZZI
  );
  const workspaceForPayload = normalizeWorkspaceForPayload(theExperience?.workspace);

  const payloadStay = {
    perfectFor: asStringArray(theStay?.perfect_for) ?? [],
    kidFriendly: asBoolean(theStay?.kid_friendly) ?? false,
    ac: asBoolean(theStay?.ac) ?? false,
    wifi: asBoolean(theStay?.wifi) ?? false,
    extraGuestFee: asBoolean(theStay?.extra_guest_fee) ?? false,
    parking: parkingForPayload ?? [],
    breakfastServed: asBoolean(theStay?.breakfast_served) ?? false,
  };

  const payloadExperience = {
    vibe: asStringArray(theExperience?.vibe) ?? [],
    workspace: workspaceForPayload ?? null,
    restaurant: asBoolean(theExperience?.restaurant) ?? false,
    pool: poolForPayload ?? [],
    rooftopLounge: asBoolean(theExperience?.rooftop_lounge) ?? false,
    jacuzzi: jacuzziForPayload ?? [],
    gym: asString(theExperience?.gym) ?? null,
  };

  const payloadDetails = {
    address: asString(theDetails?.address) ?? null,
    walkability: asString(theDetails?.walkability) ?? null,
    checkInTime: asString(theDetails?.check_in_time) ?? null,
    checkOutTime: asString(theDetails?.check_out_time) ?? null,
    phone: asString(theDetails?.phone) ?? null,
    websiteUrl: asString(theDetails?.website_url) ?? null,
    bookingUrl: asString(location.bookingUrl) ?? asString(theDetails?.booking_url) ?? null,
    googleMapsUrl: asString(theDetails?.google_maps_url) ?? null,
  };

  return {
    core: payloadCore,
    theStay: payloadStay,
    theExperience: payloadExperience,
    theDetails: payloadDetails,
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
  const galleryImageIds = getGalleryImageIds(location, uploadedImages);
  const payloadCountryCode = convertIsoToPhoneCountryCode(location.contact.countryCode || undefined);
  const phoneNumber = extractPhoneNumber(location.contact.phoneNumber || undefined);

  return {
    title: location.title || location.source.name,
    locationRef,
    gallery: galleryImageIds.map(id => ({
      image: toPayloadRelationshipId(id),
      altText: "",
      caption: "",
    })),
    instagramGallery: uploadedImages.instagramPostIds.map(id => ({
      post: toPayloadRelationshipId(id),
    })),
    address: location.contact.url || "",
    countryCode: payloadCountryCode ?? null,
    phoneNumber: phoneNumber ?? null,
    website: asString(location.contact.website) ?? null,
    latitude: location.coordinates.lat ?? null,
    longitude: location.coordinates.lng ?? null,
    status: "published" as const,
    email: asString(location.contact.email) ?? null,
    countryCodeIso: asString(location.contact.countryCode) ?? null,
    sourceName: asString(location.source.name) ?? null,
  };
}

function mapCategoryCommonPayloadFields(location: LocationResponse) {
  const mappedPriceLevel = location.priceLevel
    ? PRICE_LEVEL_TO_PAYLOAD[location.priceLevel.toLowerCase()]
    : undefined;
  return {
    type: asString(location.type) ?? null,
    priceLevel: mappedPriceLevel ?? null,
    ianaTimeId: asString(location.ianaTimeId) ?? null,
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
    operationHours: operationHours ?? null,
    idealFor: location.idealFor ?? [],
    cuisines: location.tripadvisorCuisines ?? [],
    menuUrl: asString(location.menuUrl) ?? null,
    bookingUrl: asString(location.bookingUrl) ?? null,
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
  locationRef: string,
  tourPayloadIds?: string[]
): PayloadEntryData {
  const sharedFields = mapSharedPayloadFields(location, uploadedImages, locationRef);
  const operationHours = normalizeOperationHoursForPayload(location.operationHours);
  const attractionsDetails = getAttractionsDetailsPayload(location);

  return {
    ...sharedFields,
    ...mapCategoryCommonPayloadFields(location),
    ...(location.locationKey ? { location: location.locationKey } : {}),
    operationHours: operationHours ?? null,
    attractionsDetails,
    ...(tourPayloadIds ? { tours: tourPayloadIds.map(toPayloadRelationshipId) } : {}),
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
  const { type, ianaTimeId } = mapCategoryCommonPayloadFields(location);

  return {
    ...mapSharedPayloadFields(location, uploadedImages, locationRef),
    type,
    ianaTimeId,
    ...(location.locationKey ? { location: location.locationKey } : {}),
    operationHours: operationHours ?? null,
    keyLocationsDetails,
    keyLocationStatus: keyLocationStatus ?? null,
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
      mapped = mapAttractionsPayload(location, uploadedImages, locationRef, options.tourPayloadIds);
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
