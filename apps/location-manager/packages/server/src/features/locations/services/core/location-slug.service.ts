import type { Location } from "../../models/location";
import { slugifyLocationPart } from "../geocoding/location-key.utils";

export function ensureLocationSlug(location: Location): Location {
  if (!location.slug && location.name) {
    location.slug = slugifyLocationPart(location.name);
  }
  return location;
}
