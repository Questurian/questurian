import type { CityMode } from "../../components/SubNav";
import { cityModes } from "../constants/desktop-navbar.constants";
import type { CountryInfo } from "../types";
import { cities, getCityBySlug } from "@/features/CityDiscovery/lib/data";
import { formatSlugLabel } from "../utils/desktop-navbar.utils";

export function getCountriesFromCities(): CountryInfo[] {
  const seen = new Map<string, CountryInfo>();
  for (const city of cities) {
    if (!seen.has(city.country)) {
      seen.set(city.country, {
        slug: city.country,
        name: city.displayCountry,
        countryCode: city.countryCode,
      });
    }
  }
  return Array.from(seen.values());
}

export function getCountryCities(countrySlug?: string): typeof cities {
  if (!countrySlug) return [];
  return cities.filter((city) => city.country === countrySlug);
}

export function getSameCountryCities(
  currentCountry?: string,
  currentCityId?: string
): typeof cities {
  if (!currentCountry) return [];
  return cities.filter((city) => city.country === currentCountry && city.id !== currentCityId);
}

export function resolveActiveMode(
  modeSlugFromParams?: string,
  modeSlugFromPath?: string,
  modeSlugFromFallback?: string
): CityMode {
  const rawMode = modeSlugFromParams || modeSlugFromPath || modeSlugFromFallback;
  return cityModes.includes(rawMode as CityMode) ? (rawMode as CityMode) : "explore";
}

export function resolveLocationDisplay(activeCountrySlug?: string, activeCitySlug?: string) {
  const selectedCity =
    activeCountrySlug && activeCitySlug
      ? getCityBySlug(activeCountrySlug, activeCitySlug)
      : undefined;

  const cityName =
    selectedCity?.name || (activeCitySlug ? formatSlugLabel(activeCitySlug) : "Lima");
  const countryName =
    selectedCity?.displayCountry ||
    (activeCountrySlug ? formatSlugLabel(activeCountrySlug) : "Peru");

  const fallbackCountryCode = activeCountrySlug
    ? cities.find((city) => city.country === activeCountrySlug)?.countryCode
    : "pe";

  return {
    cityName,
    countryName,
    countryCode: selectedCity?.countryCode || fallbackCountryCode,
  };
}
