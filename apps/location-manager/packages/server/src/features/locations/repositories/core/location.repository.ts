import type { Location, LocationCategory } from "../../models/location";
import { ensureLocationSlug } from "../../services/core/location-slug.service";
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
import {
  saveLocation as saveLocationRecord,
  saveLocationOrThrow as saveLocationRecordOrThrow,
  updateLocationById,
} from "./location-write.repository";

/**
 * Save a new location or update an existing one (upsert by category + name + address).
 */
export function saveLocation(location: Location): number | boolean {
  return saveLocationRecord(ensureLocationSlug(location));
}

export function saveLocationOrThrow(location: Location): number {
  return saveLocationRecordOrThrow(ensureLocationSlug(location));
}

export {
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
