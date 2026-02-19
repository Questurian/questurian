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
import { IDEAL_FOR_TAGS, type IdealForTag } from "@shared/types/location-ideal-for";

const IDEAL_FOR_TAG_SET = new Set<string>(IDEAL_FOR_TAGS);
const CATEGORY_VALUES: readonly LocationCategory[] = [
  "dining",
  "accommodations",
  "attractions",
  "nightlife",
];

function assertCategory(category: unknown): LocationCategory {
  if (typeof category === "string" && CATEGORY_VALUES.includes(category as LocationCategory)) {
    return category as LocationCategory;
  }
  throw new Error(`Invalid location category in database row: ${String(category)}`);
}

function toReviewsEnabled(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized !== "0" && normalized !== "false" && normalized.length > 0;
  }
  return true;
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

  const parseIdealFor = (idealForJson?: string | null): IdealForTag[] | null => {
    if (!idealForJson) return null;

    try {
      const parsed = JSON.parse(idealForJson);
      if (!Array.isArray(parsed)) return null;

      const normalized = parsed.filter(
        (tag): tag is IdealForTag => typeof tag === "string" && IDEAL_FOR_TAG_SET.has(tag)
      );

      if (normalized.length === 0) return null;
      return Array.from(new Set(normalized)).slice(0, 4);
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
    payload_location_ref: location.payload_location_ref || null,
    neighborhoodDescription: location.neighborhoodDescription || null,
    idealFor: parseIdealFor(location.idealForJson || null),
    nightlifeDetails: parseNightlifeDetails(location.nightlifeDetailsJson || null),
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
    // Reviews tracking fields
    reviewsFetchedAt: location.reviewsFetchedAt || null,
    reviewsCount: location.reviewsCount ?? null,
    reviewsGoogleCount: location.reviewsGoogleCount ?? null,
    reviewsTripadvisorCount: location.reviewsTripadvisorCount ?? null,
    reviewsEnabled: toReviewsEnabled(location.reviewsEnabled),
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
  const isNightlife = category === "nightlife";

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

  const nightlifeDetails = parseNightlifeDetails();
  const nightlifeSectionValue = (section: "theSpace" | "theScene", key: string): unknown => {
    const detailsRoot = nightlifeDetails?.["details"];
    if (!detailsRoot || typeof detailsRoot !== "object" || Array.isArray(detailsRoot)) return null;
    const sectionRoot = (detailsRoot as Record<string, unknown>)[section];
    if (!sectionRoot || typeof sectionRoot !== "object" || Array.isArray(sectionRoot)) return null;
    const field = (sectionRoot as Record<string, unknown>)[key];
    if (!field || typeof field !== "object" || Array.isArray(field)) return null;
    return (field as Record<string, unknown>).value ?? null;
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

  const nightlifePhone = nightlifeString(nightlifeDetails?.["phone"]);
  const nightlifeWebsite = nightlifeString(nightlifeDetails?.["website"]);

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

  // Calculate completion status based on category-specific required fields.
  // Non-nightlife records require shared geocoding/contact fields.
  // Nightlife records are evaluated against nightlife profile fields + media/contact basics.

  const hasTitle = Boolean(location.title?.trim());
  const hasType = Boolean(location.type?.trim());
  const hasMedia = location.uploadsCount > 0 || location.instagramEmbedsCount > 0;
  const hasAddress = Boolean(location.address?.trim());
  const hasCountryCode = Boolean(location.countryCode?.trim());
  const hasPhoneNumber = Boolean(location.phoneNumber?.trim()) || (isNightlife && Boolean(nightlifePhone));
  const hasWebsite = Boolean(location.website?.trim()) || (isNightlife && Boolean(nightlifeWebsite));
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
    category,
    isComplete,
    // Reviews tracking fields
    reviewsFetchedAt: location.reviewsFetchedAt || null,
    reviewsCount: location.reviewsCount ?? null,
    reviewsGoogleCount: location.reviewsGoogleCount ?? null,
    reviewsTripadvisorCount: location.reviewsTripadvisorCount ?? null,
    reviewsEnabled: toReviewsEnabled(location.reviewsEnabled),
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
