import type { Location, LocationResponse } from "../../../models/location";
import { NotFoundError } from "@shared/errors/http-error";
import { transformLocationToResponse } from "../../../utils/location-utils";
import {
  getAttractionTours,
  getInstagramEmbedsByLocationId,
  getLocationByIdForUpdate,
  getUploadsByLocationId,
} from "../maps.dependencies";

export function buildLocationResponseById(
  id: number,
  fallbackLocation?: Location
): LocationResponse {
  const location = getLocationByIdForUpdate(id) || fallbackLocation;

  if (!location) {
    throw new NotFoundError("Location", id);
  }

  return transformLocationToResponse({
    ...location,
    instagram_embeds: getInstagramEmbedsByLocationId(id),
    uploads: getUploadsByLocationId(id),
    tours: location.category === "attractions" ? getAttractionTours(id) : [],
  });
}
