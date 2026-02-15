import type { Country } from "@client/shared/services/api/types";

/**
 * Extract cities for a selected country
 * @param countries - Array of countries from API
 * @param countryCode - Country code like "CO", "PE"
 * @returns Array of city options with value and label
 */
export function extractCitiesForCountry(
  countries: Country[],
  countryCode: string
): { value: string; label: string }[] {
  const country = countries.find(c => c.code === countryCode);
  if (!country || !country.cities) return [];

  return country.cities.map(city => ({
    value: city.value,
    label: city.label
  }));
}

/**
 * Extract neighborhoods for a selected country and city
 * @param countries - Array of countries from API
 * @param countryCode - Country code like "CO", "PE"
 * @param cityValue - City value like "bogota", "lima"
 * @returns Array of neighborhood options with value and label
 */
export function extractNeighborhoodsForCity(
  countries: Country[],
  countryCode: string,
  cityValue: string
): { value: string; label: string }[] {
  const country = countries.find(c => c.code === countryCode);
  if (!country) return [];

  const city = country.cities?.find(c => c.value === cityValue);
  if (!city || !city.neighborhoods) return [];

  return city.neighborhoods.map(n => ({
    value: n.value,
    label: n.label
  }));
}

/**
 * Build locationKey from country, city, and neighborhood selections
 * @param countries - Array of countries from API
 * @param countryCode - Country code like "CO", "PE"
 * @param cityValue - City value like "bogota", "lima" (optional)
 * @param neighborhoodValue - Neighborhood value like "chapinero", "miraflores" (optional)
 * @returns Pipe-delimited locationKey or undefined if no country selected
 */
export function buildLocationKey(
  countries: Country[],
  countryCode: string | null,
  cityValue: string | null,
  neighborhoodValue: string | null
): string | undefined {
  if (!countryCode) return undefined;

  const country = countries.find(c => c.code === countryCode);
  if (!country) return undefined;

  const countryKey = country.label.toLowerCase();

  if (!cityValue) {
    // Only country selected
    return countryKey;
  }

  if (!neighborhoodValue) {
    // Country + city selected
    return `${countryKey}|${cityValue}`;
  }

  // All three selected
  return `${countryKey}|${cityValue}|${neighborhoodValue}`;
}
