import type { LocationCategory, Location, InstagramEmbed, Upload } from "../models/location";
import type { BigDataCloudResponse, AdministrativeLevel } from "@server/shared/services/external/bigdatacloud-api.client";
import { BadRequestError } from "@server/shared/core/errors/http-error";

const APPROVED_COUNTRIES = ['PE', 'CO', 'BR'] as const;

export function generateGoogleMapsUrl(name: string, address: string): string {
  const query = `${name}, ${address}`;
  const encodedQuery = encodeURIComponent(query);
  return `https://www.google.com/maps/search/?api=1&query=${encodedQuery}`;
}

interface GeocodeResponse {
  status: string;
  results?: Array<{
    address_components?: Array<{
      long_name: string;
      short_name: string;
      types: string[];
    }>;
    formatted_address?: string;
    geometry: {
      location: {
        lat: number;
        lng: number;
      };
    };
  }>;
}

type GeocodeResult = { lat: number; lng: number; countryCode?: string };

type BigDataCloudLocationData = {
  countryName: string;
  countryCode: string;
  city: string;
  district: string | null;
  locality: string;
  locationKey: string;
};

export function slugifyLocationPart(value: string | undefined): string | null {
  if (!value) return null;
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || null;
}

export async function geocode(address: string, apiKey?: string): Promise<GeocodeResult | null> {
  if (!apiKey) return null;

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json() as GeocodeResponse;

    if (data.status === "OK" && data.results && data.results.length > 0) {
      const result = data.results[0];
      if (result && result.geometry && result.geometry.location) {
        const location = result.geometry.location;
        const countryComponent = result.address_components?.find((component) =>
          component.types?.includes("country")
        );

        return {
          lat: location.lat,
          lng: location.lng,
          countryCode: countryComponent?.short_name,
        };
      }
    }
    return null;
  } catch (error) {
    console.error("Error fetching coordinates:", error);
    return null;
  }
}

interface PlaceDetailsResult {
  name?: string;
  formatted_address?: string;
  website?: string;
  international_phone_number?: string;
  formatted_phone_number?: string;
  place_id?: string;
}

interface PlacesApiResponse {
  status: string;
  results?: Array<{
    place_id: string;
  }>;
  result?: PlaceDetailsResult;
}

export async function getPlaceDetails(name: string, address: string, apiKey?: string): Promise<PlaceDetailsResult | null> {
  if (!apiKey) return null;

  try {
    // Use Places API Text Search to find the place
    const query = `${name}, ${address}`;
    const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${apiKey}`;

    const searchResponse = await fetch(searchUrl);
    const searchData = await searchResponse.json() as PlacesApiResponse;

    if (searchData.status === "OK" && searchData.results && searchData.results.length > 0) {
      const placeId = searchData.results[0]!.place_id;

      // Get detailed place information
      const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,formatted_address,website,international_phone_number,formatted_phone_number&key=${apiKey}`;

      const detailsResponse = await fetch(detailsUrl);
      const detailsData = await detailsResponse.json() as PlacesApiResponse;

      if (detailsData.status === "OK" && detailsData.result) {
        // Include the place_id in the result
        return {
          ...detailsData.result,
          place_id: placeId,
        };
      }
    }
    return null;
  } catch (error) {
    console.error("Error fetching place details:", error);
    return null;
  }
}

export async function reverseGeocodeWithBigDataCloud(
  latitude: number,
  longitude: number,
  countryCode?: string
): Promise<BigDataCloudLocationData | null> {
  try {
    // Use BigDataCloudClient for API call
    const { ServiceContainer } = await import('@server/features/locations/container/service-container');
    const container = ServiceContainer.getInstance();

    const data = await container.bigDataCloudClient.reverseGeocode(latitude, longitude);

    // Extract district using country-specific service
    const district = container.districtExtractionService.extractDistrict(
      countryCode || data.countryCode,  // Prefer passed countryCode, fallback to API
      data.localityInfo?.administrative || [],
      data.localityInfo?.informative  // Pass informative array for Brazil tourism zones
    );

    // Extract and slugify location parts (country, city, district)
    // Use district from extraction service for precise, stable location keys
    const locationParts = [
      slugifyLocationPart(data.countryName),
      slugifyLocationPart(data.city),
      slugifyLocationPart(district),
    ].filter(Boolean) as string[];

    const locationKey = locationParts.length ? locationParts.join("|") : "";

    // Create filtered data object
    const filteredData = {
      countryName: data.countryName || "",
      countryCode: data.countryCode || "",
      city: data.city || "",
      district: district,
      locality: data.locality || "",
      locationKey
    };

    return filteredData;
  } catch (error) {
    console.error("Error fetching BigDataCloud reverse geocoding:", error);
    return null;
  }
}

async function reverseGeocodeWithGeoapify(
  latitude: number,
  longitude: number,
  countryCode?: string
): Promise<BigDataCloudLocationData | null> {
  try {
    const { ServiceContainer } = await import('@server/features/locations/container/service-container');
    const container = ServiceContainer.getInstance();

    if (!container.geoapifyClient.isConfigured()) {
      return null; // API not configured
    }

    const data = await container.geoapifyClient.reverseGeocode(latitude, longitude);

    // For Brazil: suburb is the bairro (e.g., "Copacabana")
    // We prefer suburb over district for Brazilian neighborhoods
    const city = data.city || data.state || "";
    const district = data.suburb || null;

    // Slugify and create locationKey (country|city|district)
    // Note: We use Google's country code if available (more reliable)
    const locationParts = [
      slugifyLocationPart(data.country),
      slugifyLocationPart(city),
      slugifyLocationPart(district),
    ].filter(Boolean) as string[];

    const locationKey = locationParts.length ? locationParts.join("|") : "";

    return {
      countryName: data.country || "",
      countryCode: data.country_code?.toUpperCase() || countryCode?.toUpperCase() || "",
      city: city,
      district: district,
      locality: data.suburb || "",  // locality = suburb for Brazil
      locationKey
    };
  } catch (error) {
    console.error("Error fetching Geoapify reverse geocoding:", error);
    return null;
  }
}

async function reverseGeocodeWithRouting(
  latitude: number,
  longitude: number,
  countryCode?: string
): Promise<BigDataCloudLocationData | null> {
  const routedCountryCode = countryCode?.toUpperCase();

  if (routedCountryCode === 'BR') {
    return reverseGeocodeWithGeoapify(latitude, longitude, countryCode);
  } else {
    // Default: Peru, Colombia, and any others
    return reverseGeocodeWithBigDataCloud(latitude, longitude, countryCode);
  }
}

async function fetchTimezoneIanaTimeId(
  latitude: number,
  longitude: number
): Promise<string | null> {
  try {
    const { ServiceContainer } = await import('@server/features/locations/container/service-container');
    const container = ServiceContainer.getInstance();
    const timezone = await container.bigDataCloudClient.getTimezone(latitude, longitude);
    return timezone.ianaTimeId || null;
  } catch (error) {
    console.error("Error fetching BigDataCloud timezone:", error);
    return null;
  }
}

export function extractInstagramData(html: string): { url: string | null; author: string | null } {
  const permalinkMatch = html.match(/data-instgrm-permalink="([^"]+)"/);
  let url = permalinkMatch ? permalinkMatch[1] : null;

  if (url && url.includes("?")) {
    url = url.split("?")[0];
  }

  const authorMatch = html.match(/A post shared by ([^<]+)/);
  let author: string | null = null;
  if (authorMatch && authorMatch[1] !== undefined) {
    const matched = authorMatch[1];
    if (typeof matched === 'string') {
      author = matched.trim();
    }
  }

  return { url, author } as { url: string | null; author: string | null };
}

export function normalizeInstagram(author: string | null): string | null {
  if (!author) return null;
  let handle = author.replace(/A post shared by/gi, "").trim();
  handle = handle.split(/\s+/)[0]!;
  handle = handle.replace(/^@/, "").replace(/[^a-zA-Z0-9._]/g, "");
  if (!handle) return null;
  return `https://www.instagram.com/${handle}/`;
}

export async function createFromMaps(
  name: string,
  address: string,
  apiKey?: string,
  category: LocationCategory = "attractions",
  type?: string
): Promise<Location> {
  const url = generateGoogleMapsUrl(name, address);
  const entry: Location = {
    name,
    title: name,
    address,
    url,
    lat: null,
    lng: null,
    category,
    type: type || null,
    locationKey: null,
    placeId: null,
    ianaTimeId: null,
  };

  if (!apiKey) {
    return entry;
  }

  try {
    // First, get coordinates via geocoding
    const coords = await geocode(address, apiKey);
    if (coords) {
      entry.lat = coords.lat;
      entry.lng = coords.lng;

      // COUNTRY VALIDATION - Check if country is approved
      if (coords.countryCode) {
        const normalizedCode = coords.countryCode.toUpperCase();
        if (!APPROVED_COUNTRIES.includes(normalizedCode as any)) {
          throw new BadRequestError(
            "Location not allowed. Only Peru, Colombia, and Brazil are supported."
          );
        }
        entry.countryCode = coords.countryCode;
      }

      // Use routing function to select appropriate reverse geocoding API
      try {
        const reverseGeoData = await reverseGeocodeWithRouting(
          coords.lat,
          coords.lng,
          coords.countryCode  // Pass Google's countryCode for better accuracy
        );
        if (reverseGeoData) {
          if (reverseGeoData.locationKey) {
            entry.locationKey = reverseGeoData.locationKey;
          }
          if (reverseGeoData.district) {
            entry.district = reverseGeoData.district;
          }
        }
      } catch (reverseGeoError) {
        // locationKey and district stay null if reverse geocoding fails
      }

      try {
        const ianaTimeId = await fetchTimezoneIanaTimeId(coords.lat, coords.lng);
        if (ianaTimeId) {
          entry.ianaTimeId = ianaTimeId;
        }
      } catch {
        // timezone stays null if lookup fails
      }
    }

    // Try to get additional place details using Places API
    try {
      const placeDetails = await getPlaceDetails(name, address, apiKey);
      if (placeDetails) {
        // Update with enhanced information from Places API
        // Note: We intentionally do NOT set contactAddress from formatted_address
        // contactAddress should only be used for genuinely different addresses (e.g., mailing address)
        // not Google's reformatted version of the same location
        if (placeDetails.name && placeDetails.name !== name) {
          // The official name might be different
          entry.name = placeDetails.name;
          entry.title = placeDetails.name;
        }
        if (placeDetails.website) {
          entry.website = placeDetails.website;
        }
        if (placeDetails.international_phone_number) {
          entry.phoneNumber = placeDetails.international_phone_number;
        } else if (placeDetails.formatted_phone_number) {
          entry.phoneNumber = placeDetails.formatted_phone_number;
        }
        if (placeDetails.place_id) {
          entry.placeId = placeDetails.place_id;
        }
      }
    } catch (placesError) {
      // Continue without place details - geocoding still worked
    }
  } catch (e) {
    // Re-throw BadRequestError for country validation
    if (e instanceof BadRequestError) {
      throw e;
    }
    // Continue without coordinates
  }

  return entry;
}

export function createFromInstagram(embedHtml: string, locationId: number): InstagramEmbed {
  const { author } = extractInstagramData(embedHtml);

  // Extract clean username from author
  let username = "Unknown";
  if (author) {
    // Extract the username from text like "Name (@username)" or "username"
    const usernameMatch = author.match(/@([a-zA-Z0-9._]+)/);
    if (usernameMatch && usernameMatch[1]) {
      username = `@${usernameMatch[1]}`;
    } else {
      // If no @ found, use first word and clean it
      const cleaned = author.trim().split(/\s+/)[0]!.replace(/[^a-zA-Z0-9._]/g, "");
      if (cleaned) {
        username = `@${cleaned}`;
      }
      // If extraction fails, username stays "Unknown"
    }
  }
  // If no author found, username defaults to "Unknown"

  return {
    location_id: locationId,
    username,
    url: extractInstagramData(embedHtml).url || "",
    embed_code: embedHtml,
    images: [],
    original_image_urls: [],
  };
}

export function createFromUpload(
  locationId: number,
  photographerCredit?: string | null
): Upload {
  return {
    location_id: locationId,
    imageSet: undefined,
    format: 'imageset',
  };
}

export function createFromImageSetUpload(
  locationId: number
): import('../models/location').ImageSetUpload {
  return {
    location_id: locationId,
    imageSet: undefined,
    format: 'imageset',
  };
}
