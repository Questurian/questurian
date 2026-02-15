import {
  deleteLocationBySlug as deleteLocationBySlugRepo,
  deleteLocationById as deleteLocationByIdRepo,
  getLocationById,
  getLocationByIdForUpdate,
  getLocationBySlug,
  updateLocationById
} from "../../repositories/core";
import type { ImageStorageService } from "../storage/image-storage.service";
import { getPlaceDetails } from "../geocoding/location-geocoding.helper";
import { EnvConfig } from "@server/shared/config/env.config";

export class LocationMutationService {
  constructor(private readonly imageStorage: ImageStorageService) {}

  async deleteLocationBySlug(slug: string): Promise<boolean> {
    // 1. Fetch location to get sanitized name for file cleanup
    const location = getLocationBySlug(slug);
    if (!location) {
      return false;
    }

    const sanitizedName = this.imageStorage.sanitizeLocationName(location.name);

    // 2. Delete from database (repository handles cascade to embeds and uploads)
    const deleted = deleteLocationBySlugRepo(slug);
    if (!deleted) {
      return false;
    }

    // 3. Delete entire location folder from filesystem
    try {
      await this.imageStorage.deleteLocationFolder(sanitizedName);
    } catch (error) {
      // Log but don't throw - files may be orphaned, recoverable via admin cleanup
      console.error("File deletion failed for location", { slug, error });
    }

    return true;
  }

  async deleteLocationById(id: number): Promise<boolean> {
    // 1. Fetch location to get sanitized name for file cleanup
    const location = getLocationByIdForUpdate(id);
    if (!location) {
      return false;
    }

    const sanitizedName = this.imageStorage.sanitizeLocationName(location.name);

    // 2. Delete from database (repository handles cascade to embeds and uploads)
    const deleted = deleteLocationByIdRepo(id);
    if (!deleted) {
      return false;
    }

    // 3. Delete entire location folder from filesystem
    try {
      await this.imageStorage.deleteLocationFolder(sanitizedName);
    } catch (error) {
      // Log but don't throw - files may be orphaned, recoverable via admin cleanup
      console.error("File deletion failed for location", { id, error });
    }

    return true;
  }

  async refetchPlaceId(id: number): Promise<{ success: boolean; placeId: string | null; error?: string }> {
    // 1. Fetch location to get name and address
    const location = getLocationByIdForUpdate(id);
    if (!location) {
      return { success: false, placeId: null, error: "Location not found" };
    }

    // 2. Get API key
    const config = EnvConfig.getInstance();
    if (!config.hasGoogleMapsKey()) {
      return { success: false, placeId: null, error: "Google Maps API key not configured" };
    }

    // 3. Fetch place details from Google
    try {
      const placeDetails = await getPlaceDetails(
        location.name,
        location.address,
        config.GOOGLE_MAPS_API_KEY
      );

      if (!placeDetails || !placeDetails.place_id) {
        return { success: false, placeId: null, error: "Could not find Place ID from Google" };
      }

      // 4. Update location with new Place ID
      const updated = updateLocationById(id, { placeId: placeDetails.place_id });
      if (!updated) {
        return { success: false, placeId: null, error: "Failed to update location" };
      }

      return { success: true, placeId: placeDetails.place_id };
    } catch (error) {
      console.error("Error refetching Place ID:", error);
      return { success: false, placeId: null, error: "Failed to fetch from Google Places API" };
    }
  }
}

