import type { Context } from "hono";
import { successResponse, errorResponse } from "@shared/types/api-response";
import type { ListLocationsQueryDto, DeleteLocationSlugDto, DeleteLocationIdDto } from "../../validation/schemas/locations.schemas";
import type { LocationCategory } from "../../models/location";
import { getLocationByIdForUpdate } from "../../repositories/core";
import { getLocationsControllerDeps } from "../dependencies";

const { locationQuery, locationMutation } = getLocationsControllerDeps();

function resolveCategoryFromRoute(c: Context): LocationCategory | undefined {
  return c.get("routeCategory") as LocationCategory | undefined;
}

export function getLocations(c: Context) {
  const query = c.get("validatedQuery") as ListLocationsQueryDto | undefined;
  const routeCategory = resolveCategoryFromRoute(c);
  const locations = locationQuery.listLocations(
    routeCategory || query?.category,
    query?.locationKey
  );
  return c.json(successResponse({ locations }));
}

export function getLocationsBasic(c: Context) {
  const query = c.get("validatedQuery") as ListLocationsQueryDto | undefined;
  const routeCategory = resolveCategoryFromRoute(c);
  const locations = locationQuery.listLocationsBasic(
    routeCategory || query?.category,
    query?.locationKey
  );
  return c.json(successResponse({ locations }));
}

export async function deleteLocationBySlug(c: Context) {
  const dto = c.get("validatedParams") as DeleteLocationSlugDto;

  const deleted = await locationMutation.deleteLocationBySlug(dto.slug);

  if (!deleted) {
    return c.json(errorResponse("Location not found"), 404);
  }

  return c.json(successResponse({ message: "Location deleted successfully" }));
}

export async function deleteLocationById(c: Context) {
  const dto = c.get("validatedParams") as DeleteLocationIdDto;
  const routeCategory = resolveCategoryFromRoute(c);

  if (routeCategory) {
    const location = getLocationByIdForUpdate(dto.id);
    if (!location || location.category !== routeCategory) {
      return c.json(errorResponse("Location not found"), 404);
    }
  }

  const deleted = await locationMutation.deleteLocationById(dto.id);

  if (!deleted) {
    return c.json(errorResponse("Location not found"), 404);
  }

  return c.json(successResponse({ message: "Location deleted successfully" }));
}

export function getLocationById(c: Context) {
  const dto = c.get("validatedParams") as DeleteLocationIdDto;
  const routeCategory = resolveCategoryFromRoute(c);

  const location = locationQuery.getLocationById(dto.id);

  if (!location) {
    return c.json(errorResponse("Location not found"), 404);
  }
  if (routeCategory && location.category !== routeCategory) {
    return c.json(errorResponse("Location not found"), 404);
  }

  return c.json(location);
}

export async function refetchPlaceId(c: Context) {
  const dto = c.get("validatedParams") as DeleteLocationIdDto;
  const routeCategory = resolveCategoryFromRoute(c);

  if (routeCategory) {
    const location = getLocationByIdForUpdate(dto.id);
    if (!location || location.category !== routeCategory) {
      return c.json(errorResponse("Location not found"), 404);
    }
  }

  const result = await locationMutation.refetchPlaceId(dto.id);

  if (!result.success) {
    return c.json(errorResponse(result.error || "Failed to refetch Place ID"), 400);
  }

  return c.json(successResponse({ placeId: result.placeId, message: "Place ID updated successfully" }));
}
