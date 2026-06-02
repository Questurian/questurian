import type { LocationResponse } from "@client/shared/services/api/types";
import { parseAccommodationsDetails } from "@client/shared/lib/accommodations-details";
import { parseAttractionsDetails } from "@client/shared/lib/attractions-details";
import { parseNightlifeDetails } from "../../utils/nightlife-details";
import { isDetailFieldKey } from "./completeness-field-edit/completeness-detail-fields";

export interface CompletenessField {
  key: string;
  label: string;
  present: boolean;
}

const READ_ONLY_COMPLETENESS_FIELD_KEYS = new Set(["category", "slug"]);

export function isReadOnlyCompletenessField(fieldKey: string): boolean {
  return READ_ONLY_COMPLETENESS_FIELD_KEYS.has(fieldKey);
}

export function getLocationCompletenessFields(locationDetail: LocationResponse): CompletenessField[] {
  const contact = locationDetail.contact || {};
  const source = locationDetail.source || {};
  const isNightlife = locationDetail.category === "nightlife";
  const isAccommodations = locationDetail.category === "accommodations";
  const isAttractions = locationDetail.category === "attractions";
  const isKeyLocations = locationDetail.category === "key_locations";
  const nightlifeDetails = parseNightlifeDetails(locationDetail.nightlifeDetails);
  const accommodationsDetails = parseAccommodationsDetails(locationDetail.accommodationsDetails);
  const attractionsDetails = parseAttractionsDetails(locationDetail.attractionsDetails);
  const keyLocationsDetails = asRecord(locationDetail.keyLocationsDetails);
  const hasOperationHours = Boolean(
    locationDetail.operationHours &&
      Object.keys(locationDetail.operationHours).length > 0
  );

  const hasMedia = Boolean(
    (locationDetail.uploads && locationDetail.uploads.length > 0) ||
    (locationDetail.instagram_embeds && locationDetail.instagram_embeds.length > 0) ||
    (locationDetail.selectedPayloadMediaSetIds &&
      locationDetail.selectedPayloadMediaSetIds.length > 0)
  );
  const hasIdealFor = Boolean(Array.isArray(locationDetail.idealFor) && locationDetail.idealFor.length > 0);
  const hasCuisines = Boolean(
    Array.isArray(locationDetail.tripadvisorCuisines) && locationDetail.tripadvisorCuisines.length > 0
  );
  const hasKeyLocationsHours = (() => {
    if (hasOperationHours) return true;
    const hoursValue = keyLocationsDetails?.hours;
    if (!hoursValue) return false;
    if (typeof hoursValue === "string") return hoursValue.trim().length > 0;
    if (Array.isArray(hoursValue)) return hoursValue.length > 0;
    if (typeof hoursValue === "object") {
      return Object.keys(hoursValue as Record<string, unknown>).length > 0;
    }
    return false;
  })();
  const hasKeyLocationImages = Array.isArray(keyLocationsDetails?.images) && keyLocationsDetails.images.length > 0;

  if (isNightlife) {
    return [
      { key: "name", label: "Name", present: Boolean(source.name?.trim() || nightlifeDetails.name) },
      { key: "sourceAddress", label: "Location", present: Boolean(source.address?.trim() || nightlifeDetails.location) },
      { key: "category", label: "Category", present: Boolean(locationDetail.category) },
      { key: "locationKey", label: "Location Key", present: Boolean(locationDetail.locationKey?.trim()) },
      { key: "district", label: "District", present: Boolean(locationDetail.district?.trim()) },
      {
        key: "coordinates",
        label: "Coordinates",
        present: locationDetail.coordinates?.lat != null && locationDetail.coordinates?.lng != null,
      },
      {
        key: "nightlife.clubType",
        label: "Club Type",
        present: Boolean(nightlifeDetails.clubType || locationDetail.type?.trim()),
      },
      {
        key: "idealFor",
        label: "Ideal For",
        present: hasIdealFor,
      },
      { key: "nightlife.music", label: "Music", present: nightlifeDetails.music.length > 0 },
      { key: "nightlife.venueType", label: "Venue Type", present: Boolean(nightlifeDetails.venueType) },
      { key: "nightlife.venueSize", label: "Venue Size", present: Boolean(nightlifeDetails.venueSize) },
      { key: "nightlife.spaceLayout", label: "Space Layout", present: nightlifeDetails.spaceLayout.length > 0 },
      { key: "nightlife.vibe", label: "Vibe", present: nightlifeDetails.vibe.length > 0 },
      { key: "nightlife.peakHours", label: "Peak Hours", present: Boolean(nightlifeDetails.peakHours) },
      { key: "operationHours", label: "Hours", present: hasOperationHours },
      {
        key: "nightlife.priceTier",
        label: "Price Tier",
        present: Boolean(nightlifeDetails.priceTier || locationDetail.priceLevel?.trim()),
      },
      { key: "nightlife.musicFormat", label: "Music Format", present: nightlifeDetails.musicFormat.length > 0 },
      {
        key: "nightlife.touristPresence",
        label: "Tourist Presence",
        present: Boolean(nightlifeDetails.touristPresence),
      },
      { key: "nightlife.dressCode", label: "Dress Code", present: nightlifeDetails.dressCode.length > 0 },
      { key: "nightlife.energyLevel", label: "Energy Level", present: Boolean(nightlifeDetails.energyLevel) },
      {
        key: "nightlife.vipAndBottleService",
        label: "VIP/Bottle Service",
        present: Boolean(nightlifeDetails.vipAndBottleService),
      },
      { key: "nightlife.crowdProfile", label: "Crowd Profile", present: Boolean(nightlifeDetails.crowdProfile) },
      {
        key: "nightlife.daytimeRestaurant",
        label: "Daytime Restaurant",
        present: nightlifeDetails.daytimeRestaurant === "0" || nightlifeDetails.daytimeRestaurant === "1",
      },
      { key: "media", label: "Images/Instagram", present: hasMedia },
    ];
  }

  if (isAccommodations) {
    return [
      { key: "title", label: "Title", present: Boolean(locationDetail.title?.trim()) },
      { key: "name", label: "Name", present: Boolean(source.name?.trim() || accommodationsDetails.coreName) },
      { key: "sourceAddress", label: "Address", present: Boolean(source.address?.trim() || accommodationsDetails.address) },
      { key: "category", label: "Category", present: Boolean(locationDetail.category) },
      { key: "locationKey", label: "Location Key", present: Boolean(locationDetail.locationKey?.trim()) },
      { key: "district", label: "District", present: Boolean(locationDetail.district?.trim()) },
      {
        key: "coordinates",
        label: "Coordinates",
        present: locationDetail.coordinates?.lat != null && locationDetail.coordinates?.lng != null,
      },
      {
        key: "accommodations.type",
        label: "Type",
        present: Boolean(locationDetail.type?.trim() || accommodationsDetails.coreType),
      },
      {
        key: "accommodations.price",
        label: "Price",
        present: Boolean(locationDetail.priceLevel?.trim() || accommodationsDetails.corePrice),
      },
      {
        key: "accommodations.perfectFor",
        label: "Perfect For",
        present: accommodationsDetails.perfectFor.length > 0,
      },
      {
        key: "accommodations.kidFriendly",
        label: "Kid Friendly",
        present: accommodationsDetails.kidFriendly !== null,
      },
      {
        key: "accommodations.ac",
        label: "AC",
        present: accommodationsDetails.ac !== null,
      },
      {
        key: "accommodations.wifi",
        label: "WiFi",
        present: accommodationsDetails.wifi !== null,
      },
      {
        key: "accommodations.extraGuestFee",
        label: "Extra Guest Fee",
        present: accommodationsDetails.extraGuestFee !== null,
      },
      {
        key: "accommodations.parking",
        label: "Parking",
        present: accommodationsDetails.parking.length > 0,
      },
      {
        key: "accommodations.breakfastServed",
        label: "Breakfast Served",
        present: accommodationsDetails.breakfastServed !== null,
      },
      {
        key: "accommodations.vibe",
        label: "Vibe",
        present: accommodationsDetails.vibe.length > 0,
      },
      {
        key: "accommodations.workspace",
        label: "Workspace",
        present: Boolean(accommodationsDetails.workspace),
      },
      {
        key: "accommodations.restaurant",
        label: "Restaurant",
        present: accommodationsDetails.restaurant !== null,
      },
      {
        key: "accommodations.pool",
        label: "Pool",
        present: accommodationsDetails.pool.length > 0,
      },
      {
        key: "accommodations.rooftopLounge",
        label: "Rooftop Lounge",
        present: accommodationsDetails.rooftopLounge !== null,
      },
      {
        key: "accommodations.jacuzzi",
        label: "Jacuzzi",
        present: accommodationsDetails.jacuzzi.length > 0,
      },
      {
        key: "accommodations.gym",
        label: "Gym",
        present: Boolean(accommodationsDetails.gym),
      },
      {
        key: "accommodations.walkability",
        label: "Walkability",
        present: Boolean(accommodationsDetails.walkability),
      },
      {
        key: "accommodations.checkInTime",
        label: "Check-In",
        present: Boolean(accommodationsDetails.checkInTime),
      },
      {
        key: "accommodations.checkOutTime",
        label: "Check-Out",
        present: Boolean(accommodationsDetails.checkOutTime),
      },
      {
        key: "phone",
        label: "Phone",
        present: Boolean(contact.phoneNumber?.trim() || accommodationsDetails.phone),
      },
      {
        key: "website",
        label: "Website",
        present: Boolean(contact.website?.trim() || accommodationsDetails.websiteUrl),
      },
      { key: "media", label: "Images/Instagram", present: hasMedia },
    ];
  }

  if (isAttractions) {
    return [
      { key: "name", label: "Name", present: Boolean(source.name?.trim()) },
      { key: "sourceAddress", label: "Address", present: Boolean(source.address?.trim()) },
      { key: "category", label: "Category", present: Boolean(locationDetail.category) },
      { key: "locationKey", label: "Location Key", present: Boolean(locationDetail.locationKey?.trim()) },
      { key: "district", label: "District", present: Boolean(locationDetail.district?.trim()) },
      {
        key: "coordinates",
        label: "Coordinates",
        present: locationDetail.coordinates?.lat != null && locationDetail.coordinates?.lng != null,
      },
      {
        key: "attractions.type",
        label: "Type",
        present: Boolean(locationDetail.type?.trim() || attractionsDetails.attractionType),
      },
      {
        key: "attractions.pricing",
        label: "Pricing",
        present: Boolean(locationDetail.priceLevel?.trim() || attractionsDetails.pricing),
      },
      {
        key: "attractions.bookingRequired",
        label: "Booking Required",
        present: attractionsDetails.bookingRequired !== null,
      },
      {
        key: "operationHours",
        label: "Hours",
        present: Boolean(hasOperationHours || attractionsDetails.hasVisitHours),
      },
      { key: "media", label: "Images/Instagram", present: hasMedia },
    ];
  }

  if (isKeyLocations) {
    return [
      { key: "name", label: "Name", present: Boolean(source.name?.trim()) },
      { key: "sourceAddress", label: "Address", present: Boolean(source.address?.trim()) },
      { key: "category", label: "Category", present: Boolean(locationDetail.category) },
      {
        key: "locationKey",
        label: "Location Key",
        present: Boolean(locationDetail.locationKey?.trim() || asString(keyLocationsDetails?.location_key)),
      },
      {
        key: "keyLocations.type",
        label: "Type",
        present: Boolean(locationDetail.type?.trim() || asString(keyLocationsDetails?.location_type)),
      },
      {
        key: "keyLocations.status",
        label: "Status",
        present: Boolean(asString(keyLocationsDetails?.status)),
      },
      {
        key: "operationHours",
        label: "Hours",
        present: hasKeyLocationsHours,
      },
      {
        key: "district",
        label: "District",
        present: Boolean(locationDetail.district?.trim() || asString(keyLocationsDetails?.neighborhood)),
      },
      {
        key: "coordinates",
        label: "Coordinates",
        present: locationDetail.coordinates?.lat != null && locationDetail.coordinates?.lng != null,
      },
      {
        key: "phone",
        label: "Phone",
        present: Boolean(contact.phoneNumber?.trim() || asString(keyLocationsDetails?.phone)),
      },
      {
        key: "website",
        label: "Website",
        present: Boolean(contact.website?.trim() || asString(keyLocationsDetails?.website)),
      },
      { key: "media", label: "Images/Instagram", present: hasMedia || hasKeyLocationImages },
    ];
  }

  const baseFields = [
    { key: "title", label: "Title", present: Boolean(locationDetail.title?.trim()) },
    { key: "name", label: "Name", present: Boolean(source.name?.trim()) },
    { key: "sourceAddress", label: "Source Address", present: Boolean(source.address?.trim()) },
    { key: "category", label: "Category", present: Boolean(locationDetail.category) },
    {
      key: "type",
      label: locationDetail.category === "dining" ? "Type of Establishment" : "Type",
      present: Boolean(locationDetail.type?.trim()),
    },
    { key: "locationKey", label: "Location Key", present: Boolean(locationDetail.locationKey?.trim()) },
    { key: "district", label: "District", present: Boolean(locationDetail.district?.trim()) },
    { key: "slug", label: "Slug", present: Boolean(locationDetail.slug?.trim()) },
    {
      key: "coordinates",
      label: "Coordinates",
      present: locationDetail.coordinates?.lat != null && locationDetail.coordinates?.lng != null,
    },
    {
      key: "ianaTimeId",
      label: "Time Zone (IANA)",
      present: Boolean(locationDetail.ianaTimeId?.trim()),
    },
    { key: "countryCode", label: "Country Code", present: Boolean(contact.countryCode?.trim()) },
    { key: "phone", label: "Phone", present: Boolean(contact.phoneNumber?.trim()) },
    { key: "website", label: "Website", present: Boolean(contact.website?.trim()) },
    { key: "contactUrl", label: "Google URL", present: Boolean(contact.url?.trim()) },
  ];

  const categoryFields = [
    { key: "idealFor", label: "Ideal For", present: hasIdealFor },
    { key: "cuisines", label: "Cuisines", present: hasCuisines },
    { key: "priceLevel", label: "Price Level", present: Boolean(locationDetail.priceLevel?.trim()) },
    { key: "operationHours", label: "Hours", present: hasOperationHours },
  ];

  return [
    ...baseFields,
    ...categoryFields,
    { key: "media", label: "Images/Instagram", present: hasMedia },
  ];
}

export function getImportantOptionalCompletenessFields(
  locationDetail: LocationResponse
): CompletenessField[] {
  const category = locationDetail.category;
  if (
    category !== "dining" &&
    category !== "accommodations" &&
    category !== "attractions" &&
    category !== "nightlife"
  ) {
    return [];
  }

  const label =
    category === "accommodations"
      ? "Booking URL"
      : category === "attractions"
        ? "Tickets URL"
        : "Reservation URL";
  const detailsUrl =
    category === "accommodations"
      ? parseAccommodationsDetails(locationDetail.accommodationsDetails).bookingUrl
      : category === "nightlife"
        ? parseNightlifeDetails(locationDetail.nightlifeDetails).bookingUrl
        : null;

  return [
    {
      key: "bookingUrl",
      label,
      present: Boolean(locationDetail.bookingUrl?.trim() || detailsUrl),
    },
  ];
}

export function getCompletenessEditField(field: CompletenessField): CompletenessField {
  const present = Boolean(field.present);
  // Fields with a granular detail-field config are edited in a targeted editor,
  // so they keep their original key instead of remapping to a raw JSON blob.
  if (isDetailFieldKey(field.key)) {
    return { ...field, present };
  }
  if (field.key.startsWith("accommodations.")) {
    return {
      key: "accommodationsDetails",
      label: "Accommodations Profile",
      present,
    };
  }
  if (field.key.startsWith("attractions.")) {
    return {
      key: "attractionsDetails",
      label: "Attractions Profile",
      present,
    };
  }
  if (field.key.startsWith("keyLocations.")) {
    return {
      key: "keyLocationsDetails",
      label: "Key Locations Profile",
      present,
    };
  }
  return { ...field, present };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}
