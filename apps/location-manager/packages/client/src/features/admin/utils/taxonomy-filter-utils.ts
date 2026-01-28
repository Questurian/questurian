import { formatLocationName } from "@questurian/lm-shared";
import type { LocationHierarchyItem } from "@client/shared/services/api/types";

export interface FilterOption {
  value: string;
  label: string;
  count: number;
}

export interface TaxonomyFilterState {
  country: string | null;
  city: string | null;
  neighborhood: string | null;
}

/**
 * Extract unique countries from approved taxonomy with counts
 */
export function extractCountries(locations: LocationHierarchyItem[]): FilterOption[] {
  const countryMap = new Map<string, number>();

  locations.forEach(loc => {
    const count = countryMap.get(loc.country) || 0;
    countryMap.set(loc.country, count + 1);
  });

  return Array.from(countryMap.entries())
    .map(([country, count]) => ({
      value: country,
      label: formatLocationName(country),
      count
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Extract unique cities for a country with counts
 */
export function extractCitiesForCountry(
  locations: LocationHierarchyItem[],
  country: string
): FilterOption[] {
  const cityMap = new Map<string, number>();

  locations
    .filter(loc => loc.country === country)
    .forEach(loc => {
      const count = cityMap.get(loc.city) || 0;
      cityMap.set(loc.city, count + 1);
    });

  return Array.from(cityMap.entries())
    .map(([city, count]) => ({
      value: city,
      label: formatLocationName(city),
      count
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Extract unique neighborhoods for a city with counts
 */
export function extractNeighborhoodsForCity(
  locations: LocationHierarchyItem[],
  country: string,
  city: string
): FilterOption[] {
  const neighborhoodMap = new Map<string, number>();

  locations
    .filter(loc => loc.country === country && loc.city === city)
    .forEach(loc => {
      const count = neighborhoodMap.get(loc.neighborhood) || 0;
      neighborhoodMap.set(loc.neighborhood, count + 1);
    });

  return Array.from(neighborhoodMap.entries())
    .map(([neighborhood, count]) => ({
      value: neighborhood,
      label: formatLocationName(neighborhood),
      count
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Filter taxonomy entries based on selected filters
 */
export function filterTaxonomyEntries(
  locations: LocationHierarchyItem[],
  filters: TaxonomyFilterState
): LocationHierarchyItem[] {
  return locations.filter(loc => {
    if (filters.country && loc.country !== filters.country) return false;
    if (filters.city && loc.city !== filters.city) return false;
    if (filters.neighborhood && loc.neighborhood !== filters.neighborhood) return false;
    return true;
  });
}
