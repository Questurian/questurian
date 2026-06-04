import type { Context } from "hono";
import { formatLocationName } from "@questurian/lm-shared";
import { errorResponse, successResponse } from "@shared/types/api-response";
import type { LocationCategory } from "../../models/location";
import { parseLocationValue } from "../../utils/location-utils";
import { getNeighborhoodDescriptionControllerDeps } from "../dependencies";

const { locationQuery, altTextApi } = getNeighborhoodDescriptionControllerDeps();
const AI_TIMEOUT_MS = 8000;

function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toDisplayLocationPart(value: string | null | undefined): string | null {
  const normalized = normalizeText(value);
  return normalized ? formatLocationName(normalized) : null;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Neighborhood description generation timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      }
    );
  });
}

function buildFallbackNeighborhoodDescription(input: {
  district: string | null;
  neighborhood: string | null;
  city: string | null;
  country: string | null;
}): string {
  const area = input.district || input.neighborhood || input.city || "This area";
  const cityPart = input.city ? ` in ${input.city}` : "";
  const countryPart = input.country && !input.city ? ` in ${input.country}` : "";

  return `${area}${cityPart}${countryPart} has a lived-in city feel with a mix of local businesses, daily foot traffic, and street-level activity. It works well as a reference point for exploring the surrounding neighborhood while staying close to the pace and character of the area.`;
}

export async function postGenerateNeighborhoodDescription(c: Context) {
  const locationId = parseInt(c.req.param("id"), 10);
  const routeCategory = c.get("routeCategory") as LocationCategory | undefined;

  if (Number.isNaN(locationId)) {
    return c.json(errorResponse("Invalid location ID"), 400);
  }

  const location = locationQuery.getLocationById(locationId);

  if (!location || (routeCategory && location.category !== routeCategory)) {
    return c.json(errorResponse("Location not found"), 404);
  }

  const parsedLocation = location.locationKey
    ? parseLocationValue(location.locationKey)
    : null;
  const district = normalizeText(location.district);
  const neighborhood = toDisplayLocationPart(parsedLocation?.neighborhood);
  const city = toDisplayLocationPart(parsedLocation?.city);
  const country = toDisplayLocationPart(parsedLocation?.country);

  if (!district && !neighborhood) {
    return c.json(
      errorResponse("Add a district or neighborhood in Location Key before generating AI copy."),
      400
    );
  }

  try {
    const input = {
      location_name: normalizeText(location.title) || normalizeText(location.source?.name),
      category: normalizeText(location.category?.replace(/_/g, " ")),
      location_type: normalizeText(location.type),
      district,
      neighborhood,
      city,
      country,
      address: normalizeText(location.source?.address),
    };
    const fallbackDescription = buildFallbackNeighborhoodDescription({
      district,
      neighborhood,
      city,
      country,
    });

    try {
      const description = await withTimeout(
        altTextApi.generateNeighborhoodDescription(input),
        AI_TIMEOUT_MS
      );
      const trimmedDescription = description.trim();
      if (!trimmedDescription) {
        throw new Error("AI returned an empty neighborhood description.");
      }

      return c.json(successResponse({ description: trimmedDescription, source: "ai" }));
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Neighborhood description AI request failed";
      console.warn("[NeighborhoodDescription][Vertex] Falling back to contextual draft", {
        locationId,
        error: message,
      });
      return c.json(
        successResponse({ description: fallbackDescription, source: "fallback" })
      );
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to generate neighborhood description";
    console.error("[NeighborhoodDescription][Vertex] Failed to generate description", {
      locationId,
      error: message,
    });
    return c.json(errorResponse(message), 500);
  }
}
