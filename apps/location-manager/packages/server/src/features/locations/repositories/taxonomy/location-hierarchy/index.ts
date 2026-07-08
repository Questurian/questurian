import type {
  LocationHierarchy,
  CountryData,
  CityData,
  NeighborhoodData,
} from "../../../models/location";
import {
  getAllLocationHierarchy as getAllLocationHierarchyRead,
  taxonomyEntryExists,
  getTaxonomyEntry,
  getPendingTaxonomyEntries,
  getLocationCountByTaxonomy,
} from "./read.repository";
import {
  insertPendingTaxonomyEntry,
  approveTaxonomyEntry,
  rejectTaxonomyEntry,
} from "./write.repository";
import {
  toCountries,
  toCountriesNested,
  toCitiesNestedByCountry,
  toNeighborhoodsNested,
} from "../../../services/taxonomy/location-hierarchy/projection.service";

export function getAllLocationHierarchy(): LocationHierarchy[] {
  return getAllLocationHierarchyRead();
}

export function getCountries(): LocationHierarchy[] {
  return toCountries(getAllLocationHierarchyRead());
}

export function getCountriesNested(): CountryData[] {
  return toCountriesNested(getAllLocationHierarchyRead());
}

export function getCitiesNestedByCountry(country: string): CityData[] {
  return toCitiesNestedByCountry(getAllLocationHierarchyRead(), country);
}

export function getNeighborhoodsNested(
  country: string,
  city: string
): NeighborhoodData[] {
  return toNeighborhoodsNested(getAllLocationHierarchyRead(), country, city);
}

export {
  taxonomyEntryExists,
  getTaxonomyEntry,
  insertPendingTaxonomyEntry,
  approveTaxonomyEntry,
  rejectTaxonomyEntry,
  getPendingTaxonomyEntries,
  getLocationCountByTaxonomy,
};
