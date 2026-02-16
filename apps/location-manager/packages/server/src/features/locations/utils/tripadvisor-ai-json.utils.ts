import type { LocationResponse } from "../models/location";
import type { MinimalReview } from "../types/translate-merge-reviews.types";
import type { AiJsonPayload } from "../types/tripadvisor-place.types";
import { filterTripadvisorFeatures, normalizeTripadvisorStringList } from "./tripadvisor-utils";

function getNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function buildAiJsonPayload(
  location: LocationResponse,
  placeData: Record<string, unknown>,
  reviews: MinimalReview[]
): AiJsonPayload {
  const name = location.source?.name ?? location.title ?? null;
  const description = getNullableString(placeData.description);
  const reviewsSummary = getNullableString(placeData.reviews_summary);
  const mealTypes =
    location.tripadvisorMealTypes ??
    normalizeTripadvisorStringList(placeData.meal_types) ??
    normalizeTripadvisorStringList(placeData.mealtypes);
  const cuisines =
    location.tripadvisorCuisines ??
    normalizeTripadvisorStringList(placeData.cuisines);
  const features =
    location.tripadvisorFeatures ??
    filterTripadvisorFeatures(
      normalizeTripadvisorStringList(placeData.features) ??
      normalizeTripadvisorStringList(placeData.dining_options)
    );

  return {
    id: location.id,
    name,
    district: location.district ?? null,
    neighborhoodDescription: location.neighborhoodDescription ?? null,
    description,
    reviews_summary: reviewsSummary,
    meal_types: mealTypes,
    cuisines,
    features,
    reviews,
  };
}
