import type { Context } from "hono";
import { BadRequestError } from "@shared/errors/http-error";
import {
  getAllLocationHierarchy,
  getCountries as getCountriesRepo,
  getCountriesNested,
  getCitiesNestedByCountry,
  getNeighborhoodsNested,
} from "../../repositories/taxonomy";

export function getLocationHierarchy(c: Context) {
  const locations = getAllLocationHierarchy();
  return c.json({ locations });
}

export function getCountries(c: Context) {
  const countries = getCountriesNested();
  return c.json({ countries });
}

export function getCountryNames(c: Context) {
  const countries = getCountriesRepo();
  const countryNames = countries.map(country => country.country);
  return c.json(countryNames);
}

export function getCitiesByCountry(c: Context) {
  const country = c.req.param("country");
  if (!country) {
    throw new BadRequestError("Country parameter required");
  }

  const cities = getCitiesNestedByCountry(country);
  return c.json({ cities });
}

export function getNeighborhoodsByCity(c: Context) {
  const country = c.req.param("country");
  const city = c.req.param("city");

  if (!country || !city) {
    throw new BadRequestError("Country and city parameters required");
  }

  const neighborhoods = getNeighborhoodsNested(country, city);
  return c.json({ neighborhoods });
}
