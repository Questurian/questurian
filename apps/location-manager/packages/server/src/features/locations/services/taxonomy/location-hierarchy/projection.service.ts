import type {
  LocationHierarchy,
  CountryData,
  CityData,
  NeighborhoodData,
} from "../../../models/location";
import {
  getCountries as extractCountries,
  buildNestedHierarchy,
} from "../../../utils/location-utils";

export function toCountries(
  allLocations: LocationHierarchy[]
): LocationHierarchy[] {
  return extractCountries(allLocations);
}

export function toCountriesNested(
  allLocations: LocationHierarchy[]
): CountryData[] {
  return buildNestedHierarchy(allLocations);
}

export function toCitiesNestedByCountry(
  allLocations: LocationHierarchy[],
  country: string
): CityData[] {
  const countryData = buildNestedHierarchy(allLocations).find(
    (entry) =>
      entry.code.toLowerCase() === country.toLowerCase() ||
      entry.label.toLowerCase() === country.toLowerCase()
  );

  return countryData?.cities || [];
}

export function toNeighborhoodsNested(
  allLocations: LocationHierarchy[],
  country: string,
  city: string
): NeighborhoodData[] {
  const cities = toCitiesNestedByCountry(allLocations, country);
  const cityData = cities.find((entry) => entry.value === city);
  return cityData?.neighborhoods || [];
}
