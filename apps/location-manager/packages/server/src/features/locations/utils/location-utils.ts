import type {
  LocationHierarchy,
  CountryData,
  CityData,
  NeighborhoodData,
  LocationWithNested,
  LocationResponse
} from '../models/location';
import { formatLocationName } from '@questurian/lm-shared';

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
 * Generate all possible location combinations from hierarchical data
 * @param countries - Array of country data with cities and neighborhoods
 * @returns Array of all possible location hierarchy entries
 */
export function generateLocationCombinations(countries: CountryData[]): LocationHierarchy[] {
  const locations: LocationHierarchy[] = [];

  countries.forEach(country => {
    // Add country-only entry
    locations.push({
      country: country.code,
      city: null,
      neighborhood: null,
      locationKey: country.code,
    });

    country.cities.forEach(city => {
      // Add country|city entry
      locations.push({
        country: country.code,
        city: city.value,
        neighborhood: null,
        locationKey: `${country.code}|${city.value}`,
      });

      // Add country|city|neighborhood entries
      city.neighborhoods.forEach(neighborhood => {
        locations.push({
          country: country.code,
          city: city.value,
          neighborhood: neighborhood.value,
          locationKey: `${country.code}|${city.value}|${neighborhood.value}`,
        });
      });
    });
  });

  return locations;
}

/**
 * Transform a flat location with nested arrays to the API response format
 * with contact, coordinates, and source objects
 * @param location - Location with nested instagram_embeds and uploads
 * @returns Transformed location response with nested objects
 */
export function transformLocationToResponse(location: LocationWithNested): LocationResponse {
  return {
    id: location.id!,
    title: location.title || null,
    category: location.category || 'attractions',
    type: location.type || null,
    locationKey: location.locationKey || null,
    district: location.district || null,
    placeId: location.placeId || null,
    tripadvisorUrl: location.tripadvisorUrl || null,
    tripadvisorLocationId: location.tripadvisorLocationId || null,
    payload_location_ref: location.payload_location_ref || null,
    contact: {
      countryCode: location.countryCode || null,
      phoneNumber: location.phoneNumber || null,
      website: location.website || null,
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
    created_at: location.created_at || new Date().toISOString(),
    updated_at: location.updated_at || location.created_at || new Date().toISOString(),
  };
}

/**
 * Transform a location to basic response format (lightweight)
 * Used for list views that don't need full location details
 * @param location - Location object from database
 * @returns Basic location info with id, name, location, and category
 */
export function transformLocationToBasicResponse(location: import('../models/location').Location): import('../models/location').LocationBasic {
  return {
    id: location.id!,
    name: location.name,
    title: location.title ?? null,
    location: location.locationKey ? formatLocationForDisplay(location.locationKey) : null,
    category: location.category || 'attractions',
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
