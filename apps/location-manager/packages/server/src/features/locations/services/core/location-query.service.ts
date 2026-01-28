import type { LocationWithNested, LocationResponse, LocationBasic } from "../../models/location";
import { getAllLocations, getLocationsByCategory, getLocationById } from "../../repositories/core";
import { getInstagramEmbedsByLocationIds, getInstagramEmbedsByLocationId } from "../../repositories/content";
import { getUploadsByLocationIds, getUploadsByLocationId } from "../../repositories/content";
import { transformLocationToResponse, transformLocationToBasicResponse, isLocationInScope } from "../../utils/location-utils";

export class LocationQueryService {
  listLocations(category?: string, locationKey?: string): LocationResponse[] {
    // Step 1: Apply category filter at SQL level (efficient)
    let locations = category
      ? getLocationsByCategory(category)
      : getAllLocations();

    // Step 2: Apply locationKey filter in-memory using isLocationInScope utility
    if (locationKey) {
      locations = locations.filter(
        (loc) => loc.locationKey && isLocationInScope(loc.locationKey, locationKey)
      );
    }

    // Step 3: Fetch related data efficiently (prevents N+1 query problem)
    // Only fetch embeds/uploads for the specific location IDs we need
    const locationIds = locations.map((loc) => loc.id!);
    const embedsByLocationId = getInstagramEmbedsByLocationIds(locationIds);
    const uploadsByLocationId = getUploadsByLocationIds(locationIds);

    // Step 4: Create LocationWithNested using O(1) Map lookups
    const locationsWithNested: LocationWithNested[] = locations.map((loc) => ({
      ...loc,
      instagram_embeds: embedsByLocationId.get(loc.id!) || [],
      uploads: uploadsByLocationId.get(loc.id!) || [],
    }));

    // Step 5: Transform to LocationResponse format
    return locationsWithNested.map(transformLocationToResponse);
  }

  listLocationsBasic(category?: string, locationKey?: string): LocationBasic[] {
    // Step 1: Apply category filter at SQL level (efficient)
    let locations = category
      ? getLocationsByCategory(category)
      : getAllLocations();

    // Step 2: Apply locationKey filter in-memory using isLocationInScope utility
    if (locationKey) {
      locations = locations.filter(
        (loc) => loc.locationKey && isLocationInScope(loc.locationKey, locationKey)
      );
    }

    // Step 3: Transform to basic LocationBasic format
    return locations.map(transformLocationToBasicResponse);
  }

  getLocationById(id: number): LocationResponse | null {
    // Step 1: Get location by ID
    const location = getLocationById(id);
    if (!location) {
      return null;
    }

    // Step 2: Fetch related data efficiently (only for this specific location)
    const instagram_embeds = getInstagramEmbedsByLocationId(id);
    const uploads = getUploadsByLocationId(id);

    // Step 3: Create LocationWithNested
    const locationWithNested: LocationWithNested = {
      ...location,
      instagram_embeds,
      uploads,
    };

    // Step 4: Transform to LocationResponse format
    return transformLocationToResponse(locationWithNested);
  }
}
