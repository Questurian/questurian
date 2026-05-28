import type {
  LocationHierarchy,
  CountryData,
  CityData,
  NeighborhoodData,
  LocationWithNested,
  LocationResponse,
  LocationCategory
} from '../models/location';
import { formatLocationName } from '@questurian/lm-shared';
import { filterTripadvisorFeatures, parseTripadvisorStringListJson } from './tripadvisor-utils';
const CATEGORY_VALUES: readonly LocationCategory[] = [
  "dining",
  "accommodations",
  "attractions",
  "nightlife",
  "key_locations",
];

function assertCategory(category: unknown): LocationCategory {
  if (typeof category === "string" && CATEGORY_VALUES.includes(category as LocationCategory)) {
    return category as LocationCategory;
  }
  throw new Error(`Invalid location category in database row: ${String(category)}`);
}

function stripNightlifeSpendLevel(details: Record<string, unknown>): Record<string, unknown> {
  const detailsNode = details.details;
  if (!detailsNode || typeof detailsNode !== "object" || Array.isArray(detailsNode)) {
    return details;
  }

  const detailsRecord = detailsNode as Record<string, unknown>;
  const sceneNode = detailsRecord.theScene;
  if (!sceneNode || typeof sceneNode !== "object" || Array.isArray(sceneNode)) {
    return details;
  }

  const sceneRecord = sceneNode as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(sceneRecord, "spendLevel")) {
    return details;
  }

  const nextScene = { ...sceneRecord };
  delete nextScene.spendLevel;

  return {
    ...details,
    details: {
      ...detailsRecord,
      theScene: nextScene,
    },
  };
}

/**
 * Parse a pipe-delimited location key into its components
 * @param locationKey - Pipe-delimited string like "colombia|bogota|chapinero"
 * @returns Parsed location object or null if invalid
 */
export function parseLocationValue(locationKey: string): LocationHierarchy | null {
  if (!locationKey || typeof locationKey !== 'string') {
    return null;
  }

  const parts = locationKey.split('|');
  if (parts.length < 1 || parts.length > 3) {
    return null;
  }

  const [country, city, neighborhood] = parts;

  return {
    country: country!,
    city: city || null,
    neighborhood: neighborhood || null,
    locationKey,
  };
}

/**
 * Format a location object for display (human-readable)
 * @param locationKey - Pipe-delimited location key
 * @returns Formatted display string like "Colombia > Bogota > Chapinero"
 */
export function formatLocationForDisplay(locationKey: string): string {
  const parsed = parseLocationValue(locationKey);
  if (!parsed) return locationKey;

  const parts: string[] = [];

  // Add country display name
  parts.push(formatLocationName(parsed.country));

  if (parsed.city) {
    parts.push(formatLocationName(parsed.city));
  }

  if (parsed.neighborhood) {
    parts.push(formatLocationName(parsed.neighborhood));
  }

  return parts.join(' > ');
}

/**
 * Filter locations to get all cities for a specific country
 * @param locations - Array of location hierarchy entries
 * @param country - Country code like "colombia"
 * @returns Array of city locations (country|city combinations)
 */
export function filterCitiesByCountry(locations: LocationHierarchy[], country: string): LocationHierarchy[] {
  return locations.filter(loc =>
    loc.country === country &&
    loc.city !== null &&
    loc.neighborhood === null
  );
}

/**
 * Filter locations to get all neighborhoods for a specific city
 * @param locations - Array of location hierarchy entries
 * @param country - Country code like "colombia"
 * @param city - City value like "bogota"
 * @returns Array of neighborhood locations (country|city|neighborhood combinations)
 */
export function filterNeighborhoodsByCity(locations: LocationHierarchy[], country: string, city: string): LocationHierarchy[] {
  return locations.filter(loc =>
    loc.country === country &&
    loc.city === city &&
    loc.neighborhood !== null
  );
}

/**
 * Get countries from location hierarchy (unique country entries)
 * @param locations - Array of location hierarchy entries
 * @returns Array of unique country locations
 */
export function getCountries(locations: LocationHierarchy[]): LocationHierarchy[] {
  const countryMap = new Map<string, LocationHierarchy>();

  locations.forEach(loc => {
    if (loc.city === null && loc.neighborhood === null && !countryMap.has(loc.country)) {
      countryMap.set(loc.country, loc);
    }
  });

  return Array.from(countryMap.values());
}

/**
 * Check if a location key matches or is a child of another location key
 * Used for filtering related locations (e.g., attractions in a city)
 * @param locationKey - The location key to check
 * @param parentLocationKey - The parent location key to match against
 * @returns True if locationKey matches or is a child of parentLocationKey
 */
export function isLocationInScope(locationKey: string, parentLocationKey: string): boolean {
  if (locationKey === parentLocationKey) {
    return true;
  }

  // Check if locationKey starts with parentLocationKey (indicating it's a child)
  return locationKey.startsWith(parentLocationKey + '|');
}

/**
 * Transform a flat location with nested arrays to the API response format
 * with contact, coordinates, and source objects
 * @param location - Location with nested instagram_embeds and uploads
 * @returns Transformed location response with nested objects
 */
export function transformLocationToResponse(location: LocationWithNested): LocationResponse {
  const category = assertCategory(location.category);

  const parseOperationHours = (hoursJson?: string | null): Record<string, unknown> | null => {
    if (!hoursJson) return null;
    try {
      return JSON.parse(hoursJson) as Record<string, unknown>;
    } catch {
      return null;
    }
  };

  const parseNightlifeDetails = (nightlifeDetailsJson?: string | null): Record<string, unknown> | null => {
    if (!nightlifeDetailsJson) return null;
    try {
      const parsed = JSON.parse(nightlifeDetailsJson);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return null;
      }
      return stripNightlifeSpendLevel(parsed as Record<string, unknown>);
    } catch {
      return null;
    }
  };

  const parseAccommodationsDetails = (accommodationsDetailsJson?: string | null): Record<string, unknown> | null => {
    if (!accommodationsDetailsJson) return null;
    try {
      const parsed = JSON.parse(accommodationsDetailsJson);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return null;
      }
      return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  };

  const parseAttractionsDetails = (attractionsDetailsJson?: string | null): Record<string, unknown> | null => {
    if (!attractionsDetailsJson) return null;
    try {
      const parsed = JSON.parse(attractionsDetailsJson);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return null;
      }
      return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  };

  const parseKeyLocationsDetails = (keyLocationsDetailsJson?: string | null): Record<string, unknown> | null => {
    if (!keyLocationsDetailsJson) return null;
    try {
      const parsed = JSON.parse(keyLocationsDetailsJson);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return null;
      }
      return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  };

  const parseIdealFor = (idealForJson?: string | null): string[] | null => {
    if (!idealForJson) return null;

    try {
      const parsed = JSON.parse(idealForJson);
      if (!Array.isArray(parsed)) return null;

      const normalized = parsed
        .filter((tag): tag is string => typeof tag === "string")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);

      if (normalized.length === 0) return null;
      return Array.from(new Set(normalized));
    } catch {
      return null;
    }
  };

  const parseStringMap = (json?: string | null): Record<string, string> | null => {
    if (!json) return null;
    try {
      const parsed = JSON.parse(json);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
      const result: Record<string, string> = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === "string") result[key] = value;
      }
      return Object.keys(result).length > 0 ? result : null;
    } catch {
      return null;
    }
  };

  const parsePendingSuggestions = (
    json?: string | null
  ): Record<string, { value: string | string[]; provenance: string }> | null => {
    if (!json) return null;
    try {
      const parsed = JSON.parse(json);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
      const result: Record<string, { value: string | string[]; provenance: string }> = {};
      for (const [key, raw] of Object.entries(parsed)) {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
        const entry = raw as Record<string, unknown>;
        const value = entry.value;
        const provenance = entry.provenance;
        if (typeof provenance !== "string") continue;
        if (typeof value === "string" || (Array.isArray(value) && value.every((v) => typeof v === "string"))) {
          result[key] = { value: value as string | string[], provenance };
        }
      }
      return Object.keys(result).length > 0 ? result : null;
    } catch {
      return null;
    }
  };

  const parseSelectedPayloadMediaSetIds = (
    selectedPayloadMediaSetIdsJson?: string | null
  ): string[] | null => {
    if (!selectedPayloadMediaSetIdsJson) return null;

    try {
      const parsed = JSON.parse(selectedPayloadMediaSetIdsJson);
      if (!Array.isArray(parsed)) return null;

      const normalized = parsed
        .filter((id): id is string => typeof id === "string")
        .map((id) => id.trim())
        .filter((id) => id.length > 0);

      if (normalized.length === 0) return null;
      return Array.from(new Set(normalized));
    } catch {
      return null;
    }
  };

  return {
    id: location.id!,
    title: location.title || null,
    category,
    type: location.type || null,
    locationKey: location.locationKey || null,
    district: location.district || null,
    ianaTimeId: location.ianaTimeId || null,
    placeId: location.placeId || null,
    tripadvisorUrl: location.tripadvisorUrl || null,
    tripadvisorLocationId: location.tripadvisorLocationId || null,
    menuUrl: location.menuUrl || null,
    bookingUrl: location.bookingUrl || null,
    payload_location_ref: location.payload_location_ref || null,
    selectedPayloadMediaSetIds: parseSelectedPayloadMediaSetIds(
      location.selectedPayloadMediaSetIdsJson || null
    ),
    tourIds: location.tours?.length
      ? location.tours.map((tour) => tour.id)
      : null,
    tours: location.tours || [],
    neighborhoodDescription: location.neighborhoodDescription || null,
    idealFor: parseIdealFor(location.idealForJson || null),
    nightlifeDetails: parseNightlifeDetails(location.nightlifeDetailsJson || null),
    accommodationsDetails: parseAccommodationsDetails(location.accommodationsDetailsJson || null),
    attractionsDetails: parseAttractionsDetails(location.attractionsDetailsJson || null),
    keyLocationsDetails: parseKeyLocationsDetails(location.keyLocationsDetailsJson || null),
    operationHours: parseOperationHours(location.hoursJson || null),
    tripadvisorMealTypes: parseTripadvisorStringListJson(location.tripadvisorMealTypesJson || null),
    tripadvisorCuisines: parseTripadvisorStringListJson(location.tripadvisorCuisinesJson || null),
    tripadvisorFeatures: filterTripadvisorFeatures(
      parseTripadvisorStringListJson(location.tripadvisorFeaturesJson || null)
    ),
    priceLevel: location.priceLevel || null,
    contact: {
      countryCode: location.countryCode || null,
      phoneNumber: location.phoneNumber || null,
      website: location.website || null,
      email: location.email || null,
      contactAddress: location.contactAddress || null,
      url: location.url,
    },
    coordinates: {
      lat: location.lat || null,
      lng: location.lng || null,
    },
    source: {
      name: location.name,
      address: location.address,
    },
    instagram_embeds: location.instagram_embeds || [],
    uploads: location.uploads || [],
    slug: location.slug || null,
    provenance: parseStringMap(location.provenanceJson || null),
    pendingSuggestions: parsePendingSuggestions(location.pendingSuggestionsJson || null),
    created_at: location.created_at || new Date().toISOString(),
    updated_at: location.updated_at || location.created_at || new Date().toISOString(),
  };
}

/**
 * Transform a location to basic response format (lightweight)
 * Used for list views that don't need full location details
 * @param location - Location object from database with media counts
 * @returns Basic location info with id, name, location, category, and completion status
 */
export function transformLocationToBasicResponse(
  location: import('../models/location').Location & { uploadsCount: number; instagramEmbedsCount: number }
): import('../models/location').LocationBasic {
  const category = assertCategory(location.category);
  const country = location.locationKey?.split("|")[0]?.trim() || null;
  const isNightlife = category === "nightlife";
  const isAccommodations = category === "accommodations";
  const isAttractions = category === "attractions";
  const isKeyLocations = category === "key_locations";

  const parseNightlifeDetails = (): Record<string, unknown> | null => {
    if (!location.nightlifeDetailsJson) return null;
    try {
      const parsed = JSON.parse(location.nightlifeDetailsJson);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return null;
      }
      return stripNightlifeSpendLevel(parsed as Record<string, unknown>);
    } catch {
      return null;
    }
  };

  const parseAccommodationsDetails = (): Record<string, unknown> | null => {
    if (!location.accommodationsDetailsJson) return null;
    try {
      const parsed = JSON.parse(location.accommodationsDetailsJson);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return null;
      }
      return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  };

  const parseAttractionsDetails = (): Record<string, unknown> | null => {
    if (!location.attractionsDetailsJson) return null;
    try {
      const parsed = JSON.parse(location.attractionsDetailsJson);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return null;
      }
      return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  };

  const parseKeyLocationsDetails = (): Record<string, unknown> | null => {
    if (!location.keyLocationsDetailsJson) return null;
    try {
      const parsed = JSON.parse(location.keyLocationsDetailsJson);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return null;
      }
      return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  };

  const nightlifeDetails = parseNightlifeDetails();
  const accommodationsDetails = parseAccommodationsDetails();
  const attractionsDetails = parseAttractionsDetails();
  const keyLocationsDetails = parseKeyLocationsDetails();
  const nightlifeSectionValue = (section: "theSpace" | "theScene", key: string): unknown => {
    const detailsRoot = nightlifeDetails?.["details"];
    if (!detailsRoot || typeof detailsRoot !== "object" || Array.isArray(detailsRoot)) return null;
    const sectionRoot = (detailsRoot as Record<string, unknown>)[section];
    if (!sectionRoot || typeof sectionRoot !== "object" || Array.isArray(sectionRoot)) return null;
    const field = (sectionRoot as Record<string, unknown>)[key];
    if (!field || typeof field !== "object" || Array.isArray(field)) return null;
    return (field as Record<string, unknown>).value ?? null;
  };

  const accommodationsSectionValue = (
    section: "core" | "the_stay" | "the_experience" | "the_details",
    key: string
  ): unknown => {
    const sectionRoot = accommodationsDetails?.[section];
    if (!sectionRoot || typeof sectionRoot !== "object" || Array.isArray(sectionRoot)) return null;
    return (sectionRoot as Record<string, unknown>)[key] ?? null;
  };

  const attractionsSectionValue = (
    section: "core" | "visit" | "contact",
    key: string
  ): unknown => {
    const sectionRoot = attractionsDetails?.[section];
    if (!sectionRoot || typeof sectionRoot !== "object" || Array.isArray(sectionRoot)) return null;
    return (sectionRoot as Record<string, unknown>)[key] ?? null;
  };

  const keyLocationsValue = (key: string): unknown => {
    if (!keyLocationsDetails || typeof keyLocationsDetails !== "object") return null;
    return keyLocationsDetails[key] ?? null;
  };

  const nightlifeString = (value: unknown): string | null => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    return null;
  };

  const nightlifeArrayHasValues = (value: unknown): boolean => {
    if (!Array.isArray(value)) return false;
    return value.some((item) => typeof item === "string" && item.trim().length > 0);
  };

  const accommodationsString = (value: unknown): string | null => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    return null;
  };

  const keyLocationsString = (value: unknown): string | null => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    return null;
  };

  const accommodationsArrayHasValues = (value: unknown): boolean => {
    if (!Array.isArray(value)) return false;
    return value.some((item) => accommodationsString(item) !== null);
  };

  const accommodationsBooleanPresent = (value: unknown): boolean => {
    if (typeof value === "boolean") return true;
    if (typeof value === "number") return value === 0 || value === 1;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      return normalized === "true" ||
             normalized === "false" ||
             normalized === "yes" ||
             normalized === "no" ||
             normalized === "1" ||
             normalized === "0";
    }
    return false;
  };

  const nightlifePhone = nightlifeString(nightlifeDetails?.["phone"]);
  const nightlifeWebsite = nightlifeString(nightlifeDetails?.["website"]);
  const accommodationsPhone =
    accommodationsString(accommodationsSectionValue("the_details", "phone")) ||
    accommodationsString(accommodationsDetails?.["phone"]);
  const accommodationsWebsite =
    accommodationsString(accommodationsSectionValue("the_details", "website_url")) ||
    accommodationsString(accommodationsDetails?.["website_url"]);

  const nightlifeClubType = nightlifeString(nightlifeDetails?.["club_type"]);
  const nightlifePriceTier = nightlifeString(nightlifeDetails?.["price_tier"]);
  const nightlifeMusic = nightlifeDetails?.["music"];
  const nightlifeVenueType = nightlifeSectionValue("theSpace", "venueType");
  const nightlifeVenueSize = nightlifeSectionValue("theSpace", "venueSize");
  const nightlifeSpaceLayout = nightlifeSectionValue("theSpace", "spaceLayout");
  const nightlifeVibe = nightlifeSectionValue("theSpace", "vibe");
  const nightlifePeakHours = nightlifeSectionValue("theSpace", "peakHours");
  const nightlifeTouristPresence =
    nightlifeSectionValue("theScene", "touristPresence") ??
    nightlifeSectionValue("theSpace", "touristPresence");
  const nightlifeMusicFormat = nightlifeSectionValue("theScene", "musicFormat");
  const nightlifeDressCode = nightlifeSectionValue("theScene", "dressCode");
  const nightlifeEnergy = nightlifeSectionValue("theScene", "energyLevel");
  const nightlifeVipAndBottleService = nightlifeSectionValue("theScene", "vipAndBottleService");
  const nightlifeCrowdProfile = nightlifeSectionValue("theScene", "crowdProfile");
  const nightlifeDaytimeRestaurant = nightlifeString(nightlifeDetails?.["daytime_restaurant"]);
  const accommodationsCorePrice =
    accommodationsString(accommodationsSectionValue("core", "price")) ||
    accommodationsString(location.priceLevel);
  const accommodationsPerfectFor = accommodationsSectionValue("the_stay", "perfect_for");
  const accommodationsKidFriendly = accommodationsSectionValue("the_stay", "kid_friendly");
  const accommodationsAc = accommodationsSectionValue("the_stay", "ac");
  const accommodationsWifi = accommodationsSectionValue("the_stay", "wifi");
  const accommodationsExtraGuestFee = accommodationsSectionValue("the_stay", "extra_guest_fee");
  const accommodationsParking = accommodationsSectionValue("the_stay", "parking");
  const accommodationsBreakfastServed = accommodationsSectionValue("the_stay", "breakfast_served");
  const accommodationsVibe = accommodationsSectionValue("the_experience", "vibe");
  const accommodationsWorkspace = accommodationsSectionValue("the_experience", "workspace");
  const accommodationsRestaurant = accommodationsSectionValue("the_experience", "restaurant");
  const accommodationsPool = accommodationsSectionValue("the_experience", "pool");
  const accommodationsRooftopLounge = accommodationsSectionValue("the_experience", "rooftop_lounge");
  const accommodationsJacuzzi = accommodationsSectionValue("the_experience", "jacuzzi");
  const accommodationsGym = accommodationsSectionValue("the_experience", "gym");
  const accommodationsWalkability = accommodationsSectionValue("the_details", "walkability");
  const accommodationsCheckIn = accommodationsSectionValue("the_details", "check_in_time");
  const accommodationsCheckOut = accommodationsSectionValue("the_details", "check_out_time");
  const attractionsType =
    accommodationsString(attractionsSectionValue("core", "attraction_type")) ||
    accommodationsString(location.type);
  const attractionsPricing =
    accommodationsString(attractionsSectionValue("core", "pricing")) ||
    accommodationsString(location.priceLevel);
  const attractionsVisitHours = attractionsSectionValue("visit", "hours");
  const attractionsBookingRequired = attractionsSectionValue("visit", "booking_required");
  const keyLocationsType =
    keyLocationsString(keyLocationsValue("location_type")) ||
    keyLocationsString(location.type);
  const keyLocationsStatus = keyLocationsString(keyLocationsValue("status"));
  const keyLocationsWebsite = keyLocationsString(keyLocationsValue("website")) || accommodationsString(location.website);
  const keyLocationsPhone = keyLocationsString(keyLocationsValue("phone")) || accommodationsString(location.phoneNumber);
  const keyLocationsHours = keyLocationsValue("hours");
  const keyLocationsDistrict = keyLocationsString(keyLocationsValue("neighborhood")) || accommodationsString(location.district);
  const keyLocationsImages = keyLocationsValue("images");

  // Calculate completion status based on category-specific required fields.
  // Non-nightlife records require shared geocoding/contact fields.
  // Nightlife records are evaluated against nightlife profile fields + media/contact basics.

  const hasTitle = Boolean(location.title?.trim());
  const hasType = Boolean(location.type?.trim());
  const hasSelectedPayloadMediaSets = (() => {
    if (!location.selectedPayloadMediaSetIdsJson) return false;
    try {
      const parsed = JSON.parse(location.selectedPayloadMediaSetIdsJson);
      return Array.isArray(parsed) && parsed.some((id) => typeof id === "string" && id.trim().length > 0);
    } catch {
      return false;
    }
  })();
  const hasMedia =
    location.uploadsCount > 0 ||
    location.instagramEmbedsCount > 0 ||
    hasSelectedPayloadMediaSets;
  const hasAddress = Boolean(location.address?.trim());
  const hasCountryCode = Boolean(location.countryCode?.trim());
  const hasPhoneNumber =
    Boolean(location.phoneNumber?.trim()) ||
    (isNightlife && Boolean(nightlifePhone)) ||
    (isAccommodations && Boolean(accommodationsPhone)) ||
    (isKeyLocations && Boolean(keyLocationsPhone));
  const hasWebsite =
    Boolean(location.website?.trim()) ||
    (isNightlife && Boolean(nightlifeWebsite)) ||
    (isAccommodations && Boolean(accommodationsWebsite)) ||
    (isKeyLocations && Boolean(keyLocationsWebsite));
  const hasOperationHours = Boolean(location.hoursJson && location.hoursJson !== '{}' && location.hoursJson !== 'null');
  const hasCuisines = Boolean(location.tripadvisorCuisinesJson);
  const hasIdealFor = (() => {
    if (!location.idealForJson) return false;
    try {
      const parsed = JSON.parse(location.idealForJson);
      return Array.isArray(parsed) && parsed.length > 0;
    } catch {
      return false;
    }
  })();
  const hasIanaTimeId = Boolean(location.ianaTimeId?.trim());
  const hasCoordinates = location.lat != null && location.lng != null;
  const hasPriceLevel = Boolean(location.priceLevel?.trim());

  const hasNightlifeProfile = Boolean(nightlifeDetails && Object.keys(nightlifeDetails).length > 0);
  const hasNightlifeClubType = Boolean(nightlifeClubType || location.type?.trim());
  const hasNightlifeMusic = nightlifeArrayHasValues(nightlifeMusic);
  const hasNightlifeVenueType = Boolean(nightlifeString(nightlifeVenueType));
  const hasNightlifeVenueSize = Boolean(nightlifeString(nightlifeVenueSize));
  const hasNightlifeSpaceLayout = nightlifeArrayHasValues(nightlifeSpaceLayout);
  const hasNightlifeVibe = nightlifeArrayHasValues(nightlifeVibe);
  const hasNightlifePeakHours = Boolean(nightlifeString(nightlifePeakHours));
  const hasNightlifeTouristPresence = Boolean(nightlifeString(nightlifeTouristPresence));
  const hasNightlifeMusicFormat = nightlifeArrayHasValues(nightlifeMusicFormat);
  const hasNightlifeDressCode = nightlifeArrayHasValues(nightlifeDressCode);
  const hasNightlifeEnergy = Boolean(nightlifeString(nightlifeEnergy));
  const hasNightlifeVipAndBottleService = Boolean(nightlifeString(nightlifeVipAndBottleService));
  const hasNightlifeCrowdProfile = Boolean(nightlifeString(nightlifeCrowdProfile));
  const hasNightlifeDaytimeRestaurant =
    nightlifeDaytimeRestaurant === "0" || nightlifeDaytimeRestaurant === "1";
  const hasNightlifePriceTier = Boolean(nightlifePriceTier || hasPriceLevel);
  const hasAccommodationsProfile = Boolean(accommodationsDetails && Object.keys(accommodationsDetails).length > 0);
  const hasAccommodationsPrice = Boolean(accommodationsCorePrice);
  const hasAccommodationsPerfectFor = accommodationsArrayHasValues(accommodationsPerfectFor);
  const hasAccommodationsKidFriendly = accommodationsBooleanPresent(accommodationsKidFriendly);
  const hasAccommodationsAc = accommodationsBooleanPresent(accommodationsAc);
  const hasAccommodationsWifi = accommodationsBooleanPresent(accommodationsWifi);
  const hasAccommodationsExtraGuestFee = accommodationsBooleanPresent(accommodationsExtraGuestFee);
  const hasAccommodationsParking = accommodationsArrayHasValues(accommodationsParking);
  const hasAccommodationsBreakfastServed = accommodationsBooleanPresent(accommodationsBreakfastServed);
  const hasAccommodationsVibe = accommodationsArrayHasValues(accommodationsVibe);
  const hasAccommodationsWorkspace =
    accommodationsArrayHasValues(accommodationsWorkspace) ||
    Boolean(accommodationsString(accommodationsWorkspace));
  const hasAccommodationsRestaurant = accommodationsBooleanPresent(accommodationsRestaurant);
  const hasAccommodationsPool = accommodationsArrayHasValues(accommodationsPool);
  const hasAccommodationsRooftopLounge = accommodationsBooleanPresent(accommodationsRooftopLounge);
  const hasAccommodationsJacuzzi = accommodationsArrayHasValues(accommodationsJacuzzi);
  const hasAccommodationsGym = Boolean(accommodationsString(accommodationsGym));
  const hasAccommodationsWalkability = Boolean(accommodationsString(accommodationsWalkability));
  const hasAccommodationsCheckIn = Boolean(accommodationsString(accommodationsCheckIn));
  const hasAccommodationsCheckOut = Boolean(accommodationsString(accommodationsCheckOut));
  const hasAttractionsProfile = Boolean(attractionsDetails && Object.keys(attractionsDetails).length > 0);
  const hasAttractionsType = Boolean(attractionsType);
  const hasAttractionsPricing = Boolean(attractionsPricing);
  const hasAttractionsBookingRequired = accommodationsBooleanPresent(attractionsBookingRequired);
  const hasAttractionsVisitHours = (() => {
    if (hasOperationHours) return true;
    if (!attractionsVisitHours) return false;
    if (typeof attractionsVisitHours === "string") {
      return attractionsVisitHours.trim().length > 0;
    }
    if (Array.isArray(attractionsVisitHours)) {
      return attractionsVisitHours.some((item) => accommodationsString(item) !== null);
    }
    if (typeof attractionsVisitHours === "object") {
      return Object.keys(attractionsVisitHours as Record<string, unknown>).length > 0;
    }
    return false;
  })();
  const hasKeyLocationsProfile = Boolean(keyLocationsDetails && Object.keys(keyLocationsDetails).length > 0);
  const hasKeyLocationsType = Boolean(keyLocationsType);
  const hasKeyLocationsStatus = Boolean(keyLocationsStatus);
  const hasKeyLocationsVisitHours = (() => {
    if (hasOperationHours) return true;
    if (!keyLocationsHours) return false;
    if (typeof keyLocationsHours === "string") {
      return keyLocationsHours.trim().length > 0;
    }
    if (Array.isArray(keyLocationsHours)) {
      return keyLocationsHours.length > 0;
    }
    if (typeof keyLocationsHours === "object") {
      return Object.keys(keyLocationsHours as Record<string, unknown>).length > 0;
    }
    return false;
  })();
  const hasKeyLocationsDistrict = Boolean(keyLocationsDistrict);
  const hasKeyLocationsImages = Array.isArray(keyLocationsImages) && keyLocationsImages.length > 0;

  const hasSharedCommonFields =
    hasTitle &&
    hasType &&
    hasMedia &&
    hasAddress &&
    hasCountryCode &&
    hasIanaTimeId &&
    hasCoordinates;

  const hasNightlifeCommonFields =
    hasTitle &&
    hasType &&
    hasMedia &&
    hasAddress;

  const hasAccommodationsCommonFields =
    hasTitle &&
    hasType &&
    hasMedia &&
    hasAddress &&
    hasCountryCode &&
    hasIanaTimeId &&
    hasCoordinates;

  const hasAttractionsCommonFields =
    hasTitle &&
    hasMedia &&
    hasAddress &&
    hasCountryCode &&
    hasIanaTimeId &&
    hasCoordinates;
  const hasKeyLocationsCommonFields =
    hasTitle &&
    hasMedia &&
    hasAddress &&
    hasCountryCode &&
    hasIanaTimeId &&
    hasCoordinates;

  const isComplete = isNightlife
    ? (
      hasNightlifeCommonFields &&
      hasNightlifeProfile &&
      hasNightlifeClubType &&
      hasNightlifeMusic &&
      hasNightlifeVenueType &&
      hasNightlifeVenueSize &&
      hasNightlifeSpaceLayout &&
      hasNightlifeVibe &&
      hasNightlifePeakHours &&
      hasNightlifeTouristPresence &&
      hasNightlifeMusicFormat &&
      hasNightlifeDressCode &&
      hasNightlifeEnergy &&
      hasNightlifeVipAndBottleService &&
      hasNightlifeCrowdProfile &&
      hasNightlifeDaytimeRestaurant &&
      hasNightlifePriceTier &&
      hasPhoneNumber &&
      hasWebsite
    )
    : isAccommodations
      ? (
        hasAccommodationsCommonFields &&
        hasAccommodationsProfile &&
        hasAccommodationsPrice &&
        hasAccommodationsPerfectFor &&
        hasAccommodationsKidFriendly &&
        hasAccommodationsAc &&
        hasAccommodationsWifi &&
        hasAccommodationsExtraGuestFee &&
        hasAccommodationsParking &&
        hasAccommodationsBreakfastServed &&
        hasAccommodationsVibe &&
        hasAccommodationsWorkspace &&
        hasAccommodationsRestaurant &&
        hasAccommodationsPool &&
        hasAccommodationsRooftopLounge &&
        hasAccommodationsJacuzzi &&
        hasAccommodationsGym &&
        hasAccommodationsWalkability &&
        hasAccommodationsCheckIn &&
        hasAccommodationsCheckOut &&
        hasPhoneNumber &&
        hasWebsite
      )
    : isAttractions
      ? (
        hasAttractionsCommonFields &&
        hasAttractionsProfile &&
        hasAttractionsType &&
        hasAttractionsPricing &&
        hasAttractionsBookingRequired &&
        hasAttractionsVisitHours
      )
    : isKeyLocations
      ? (
        hasKeyLocationsCommonFields &&
        hasKeyLocationsProfile &&
        hasKeyLocationsType &&
        hasKeyLocationsStatus &&
        hasKeyLocationsVisitHours &&
        hasKeyLocationsDistrict &&
        (hasMedia || hasKeyLocationsImages) &&
        hasPhoneNumber &&
        hasWebsite
      )
    : (
      hasSharedCommonFields &&
      hasPhoneNumber &&
      hasWebsite &&
      hasOperationHours &&
      hasCuisines &&
      hasIdealFor &&
      hasPriceLevel
    );

  return {
    id: location.id!,
    name: location.name,
    title: location.title ?? null,
    location: location.locationKey ? formatLocationForDisplay(location.locationKey) : null,
    locationKey: location.locationKey || null,
    country,
    category,
    type: location.type || null,
    isComplete,
  };
}

/**
 * Build nested hierarchy structure from flat location taxonomy data
 * Converts flat LocationHierarchy entries to nested CountryData structure
 * @param locations - Array of flat location hierarchy entries
 * @returns Array of countries with nested cities and neighborhoods
 */
export function buildNestedHierarchy(locations: LocationHierarchy[]): CountryData[] {
  const countryMap = new Map<string, CountryData>();

  locations.forEach(loc => {
    // Get or create country entry
    if (!countryMap.has(loc.country)) {
      countryMap.set(loc.country, {
        code: loc.country,
        label: formatLocationName(loc.country),
        cities: [],
      });
    }
    const country = countryMap.get(loc.country)!;

    // Add city if present
    if (loc.city && !loc.neighborhood) {
      const existingCity = country.cities.find(c => c.value === loc.city);
      if (!existingCity) {
        country.cities.push({
          label: formatLocationName(loc.city),
          value: loc.city,
          neighborhoods: [],
        });
      }
    }

    // Add neighborhood if present
    if (loc.city && loc.neighborhood) {
      const city = country.cities.find(c => c.value === loc.city);
      if (city) {
        const existingNeighborhood = city.neighborhoods.find(n => n.value === loc.neighborhood);
        if (!existingNeighborhood) {
          city.neighborhoods.push({
            label: formatLocationName(loc.neighborhood),
            value: loc.neighborhood,
          });
        }
      } else {
        // City doesn't exist yet, create it with the neighborhood
        country.cities.push({
          label: formatLocationName(loc.city),
          value: loc.city,
          neighborhoods: [
            {
              label: formatLocationName(loc.neighborhood),
              value: loc.neighborhood,
            },
          ],
        });
      }
    }
  });

  return Array.from(countryMap.values());
}

/**
 * Sanitize location name for use in filenames
 * Example: "Panchita - Miraflores" -> "panchita-miraflores"
 */
export function sanitizeLocationName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove all symbols except spaces and hyphens
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
}

/**
 * Get file extension from path
 */
export function getFileExtension(path: string): string {
  const match = path.match(/\.([^.]+)$/);
  return match?.[1] || 'jpg';
}
