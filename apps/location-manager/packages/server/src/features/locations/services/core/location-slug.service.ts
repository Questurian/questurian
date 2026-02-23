import type { Location } from "../../models/location";
import { slugifyLocationPart } from "../geocoding/location-geocoding.helper";

export function ensureLocationSlug(location: Location): Location {
  if (!location.slug && location.name) {
    location.slug = slugifyLocationPart(location.name);
  }
  return location;
}
