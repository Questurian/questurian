import type { Location, LocationCategory } from "../../models/location";
import { ensureLocationSlug } from "../../services/core/location-slug.service";
import { bulkUpdateLocationKeys } from "./location-bulk.repository";
import { deleteLocationById, deleteLocationBySlug } from "./location-delete.repository";
import { findPotentialDuplicateLocations } from "./location-duplicate.repository";
import {
  getAllLocations,
  getLocationById,
  getLocationByIdForUpdate,
  getLocationBySlug,
  getLocationCategoryById,
  getLocationsByCategory,
} from "./location-read.repository";
import { saveLocation as saveLocationRecord, updateLocationById } from "./location-write.repository";

/**
 * Save a new location or update an existing one (upsert by category + name + address).
 */
export function saveLocation(location: Location): number | boolean {
  return saveLocationRecord(ensureLocationSlug(location));
}

export {
  bulkUpdateLocationKeys,
  deleteLocationById,
  deleteLocationBySlug,
  findPotentialDuplicateLocations,
  getAllLocations,
  getLocationById,
  getLocationByIdForUpdate,
  getLocationBySlug,
  getLocationCategoryById,
  getLocationsByCategory,
  updateLocationById,
};

export type { LocationCategory };
