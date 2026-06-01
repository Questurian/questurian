import type { LocationResponse } from "@client/shared/services/api/types";
import type { FieldDef } from "./completeness-field-edit.types";

export function parseCoordinateInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getInitialValue(field: FieldDef, locationDetail: LocationResponse): string {
  const contact = locationDetail.contact || {};
  const source = locationDetail.source || {};

  switch (field.key) {
    case "title":
      return locationDetail.title?.trim() ?? "";
    case "name":
      return source.name?.trim() ?? "";
    case "sourceAddress":
      return source.address?.trim() ?? "";
    case "category":
      return locationDetail.category ?? "";
    case "type":
      return locationDetail.type?.trim() ?? "";
    case "locationKey":
      return locationDetail.locationKey?.trim() ?? "";
    case "district":
      return locationDetail.district?.trim() ?? "";
    case "coordinates":
      return "";
    case "ianaTimeId":
      return locationDetail.ianaTimeId?.trim() ?? "";
    case "countryCode":
      return contact.countryCode?.trim() ?? "";
    case "phone":
      return contact.phoneNumber?.trim() ?? "";
    case "website":
      return contact.website?.trim() ?? "";
    case "bookingUrl":
      return locationDetail.bookingUrl?.trim() ?? "";
    case "contactUrl":
      return contact.url?.trim() ?? "";
    case "tripadvisorUrl":
      return locationDetail.tripadvisorUrl?.trim() ?? "";
    case "neighborhoodDescription":
      return locationDetail.neighborhoodDescription?.trim() ?? "";
    case "idealFor":
      return Array.isArray(locationDetail.idealFor) ? locationDetail.idealFor.join(", ") : "";
    case "cuisines":
      return Array.isArray(locationDetail.tripadvisorCuisines)
        ? locationDetail.tripadvisorCuisines.join(", ")
        : "";
    case "priceLevel":
      return locationDetail.priceLevel?.trim() ?? "";
    case "nightlifeDetails":
      return locationDetail.nightlifeDetails
        ? JSON.stringify(locationDetail.nightlifeDetails, null, 2)
        : "";
    case "accommodationsDetails":
      return locationDetail.accommodationsDetails
        ? JSON.stringify(locationDetail.accommodationsDetails, null, 2)
        : "";
    case "attractionsDetails":
      return locationDetail.attractionsDetails
        ? JSON.stringify(locationDetail.attractionsDetails, null, 2)
        : "";
    case "keyLocationsDetails":
      return locationDetail.keyLocationsDetails
        ? JSON.stringify(locationDetail.keyLocationsDetails, null, 2)
        : "";
    case "operationHours":
      return locationDetail.operationHours
        ? JSON.stringify(locationDetail.operationHours, null, 2)
        : "";
    default:
      return "";
  }
}
