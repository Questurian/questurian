import { isFieldProvenance, type FieldProvenance } from "@questurian/lm-shared";
import type { LocationCategory } from "@shared/types/location-category";

export function fieldProvenance(
  provenance: Record<string, string> | null,
  field: string
): FieldProvenance | undefined {
  const value = provenance?.[field];
  return isFieldProvenance(value) ? value : undefined;
}

export function formatCoords(lat: number | null, lng: number | null): string | null {
  if (lat === null || lng === null) return null;
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

export function bookingUrlLabelFor(category: LocationCategory): string | null {
  switch (category) {
    case "dining":
    case "nightlife":
      return "Reservation URL";
    case "accommodations":
      return "Booking URL";
    case "attractions":
      return "Tickets URL";
    case "key_locations":
      return null;
  }
}
