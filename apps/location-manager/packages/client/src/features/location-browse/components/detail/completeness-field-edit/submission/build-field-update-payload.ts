import type { UpdateMapsRequest } from "@client/shared/services/api/types";

export function buildFieldUpdatePayload(
  fieldKey: string,
  value: string
): Partial<UpdateMapsRequest> | null {
  const trimmed = value.trim();
  switch (fieldKey) {
    case "title":
      return { title: trimmed || undefined };
    case "name":
      return { name: trimmed || undefined };
    case "sourceAddress":
      return { address: trimmed || undefined };
    case "category":
      return null;
    case "type":
      return { type: trimmed || undefined };
    case "locationKey":
      return { locationKey: trimmed || undefined };
    case "district":
      return { district: trimmed || null };
    case "coordinates":
      return null;
    case "ianaTimeId":
      return { ianaTimeId: trimmed || null };
    case "countryCode":
      return { countryCode: trimmed || undefined };
    case "phone":
      return { phoneNumber: trimmed || undefined };
    case "website":
      return { website: trimmed || undefined };
    case "bookingUrl":
      return { bookingUrl: trimmed || null };
    case "contactUrl":
      return null;
    case "tripadvisorUrl":
      return { tripadvisorUrl: trimmed || undefined };
    case "neighborhoodDescription":
      return { neighborhoodDescription: trimmed || undefined };
    case "idealFor": {
      const tags = trimmed
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
      if (tags.length === 0) return null;
      return { idealFor: tags as UpdateMapsRequest["idealFor"] };
    }
    case "cuisines":
      return { tripadvisorCuisines: trimmed || null };
    case "priceLevel":
      return { priceLevel: trimmed || null };
    case "operationHours":
      return { operationHours: trimmed || undefined };
    case "media":
      return null;
    default:
      return null;
  }
}
