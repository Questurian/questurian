import type { LocationResponse } from "../models/location";

export function buildLocationExportPayload(
  location: LocationResponse,
  tripadvisorPlace: Record<string, unknown> | null
) {
  return {
    id: location.id,
    name: location.source?.name,
    title: location.title,
    address: location.source?.address,
    category: location.category,
    type: location.type,
    locationKey: location.locationKey,
    district: location.district,
    slug: location.slug,
    coordinates: location.coordinates,
    contact: location.contact,
    placeId: location.placeId,
    tripadvisorUrl: location.tripadvisorUrl,
    tripadvisorLocationId: location.tripadvisorLocationId,
    neighborhoodDescription: location.neighborhoodDescription,
    idealFor: location.idealFor,
    operationHours: location.operationHours,
    tripadvisorMealTypes: location.tripadvisorMealTypes,
    tripadvisorCuisines: location.tripadvisorCuisines,
    tripadvisorFeatures: location.tripadvisorFeatures,
    created_at: location.created_at,
    updated_at: location.updated_at,
    tripadvisorPlace,
  };
}
