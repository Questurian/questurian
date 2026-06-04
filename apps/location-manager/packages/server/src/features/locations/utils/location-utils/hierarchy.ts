import type { CountryData, LocationHierarchy } from "../../models/location";
import { formatLocationName } from "@questurian/lm-shared";

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
