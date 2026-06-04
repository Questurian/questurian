import {
  filterTripadvisorFeatures,
  normalizeTripadvisorStringList,
} from "../../../utils/tripadvisor-utils";
import type { TripAdvisorPlaceResult } from "../clients/serpapi-tripadvisor.client";
import type { TripadvisorPrefillFields } from "./maps.types";

export function extractTripadvisorPrefillFields(
  placeResult: TripAdvisorPlaceResult
): TripadvisorPrefillFields {
  const stringOrNull = (value: unknown): string | null =>
    typeof value === "string" && value.trim() ? value.trim() : null;

  const operationHours = (() => {
    const raw = placeResult.operation_hours;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    return raw as Record<string, unknown>;
  })();

  return {
    email: stringOrNull(placeResult.email),
    phoneNumber: stringOrNull(placeResult.phone),
    website: stringOrNull(placeResult.website),
    priceLevel: stringOrNull(placeResult.price_level),
    neighborhood: stringOrNull(placeResult.neighborhood),
    neighborhoodDescription: stringOrNull(placeResult.neighborhood_description),
    operationHours,
    mealTypes:
      normalizeTripadvisorStringList(placeResult.meal_types) ??
      normalizeTripadvisorStringList(placeResult.mealtypes),
    cuisines: normalizeTripadvisorStringList(placeResult.cuisines),
    features:
      filterTripadvisorFeatures(
        normalizeTripadvisorStringList(placeResult.features) ??
          normalizeTripadvisorStringList(placeResult.dining_options)
      ) ?? null,
  };
}
