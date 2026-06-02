import { asString } from "./common";
import type { CompletenessField, CompletenessFieldContext } from "./types";

export function getKeyLocationsCompletenessFields({
  locationDetail,
  contact,
  source,
  keyLocationsDetails,
  hasKeyLocationsHours,
  hasMedia,
  hasKeyLocationImages,
}: CompletenessFieldContext): CompletenessField[] {
  return [
    { key: "name", label: "Name", present: Boolean(source.name?.trim()) },
    { key: "sourceAddress", label: "Address", present: Boolean(source.address?.trim()) },
    { key: "category", label: "Category", present: Boolean(locationDetail.category) },
    {
      key: "locationKey",
      label: "Location Key",
      present: Boolean(locationDetail.locationKey?.trim() || asString(keyLocationsDetails?.location_key)),
    },
    {
      key: "keyLocations.type",
      label: "Type",
      present: Boolean(locationDetail.type?.trim() || asString(keyLocationsDetails?.location_type)),
    },
    {
      key: "keyLocations.status",
      label: "Status",
      present: Boolean(asString(keyLocationsDetails?.status)),
    },
    { key: "operationHours", label: "Hours", present: hasKeyLocationsHours },
    {
      key: "district",
      label: "District",
      present: Boolean(locationDetail.district?.trim() || asString(keyLocationsDetails?.neighborhood)),
    },
    {
      key: "coordinates",
      label: "Coordinates",
      present: locationDetail.coordinates?.lat != null && locationDetail.coordinates?.lng != null,
    },
    { key: "phone", label: "Phone", present: Boolean(contact.phoneNumber?.trim() || asString(keyLocationsDetails?.phone)) },
    { key: "website", label: "Website", present: Boolean(contact.website?.trim() || asString(keyLocationsDetails?.website)) },
    { key: "media", label: "Images/Instagram", present: hasMedia || hasKeyLocationImages },
  ];
}
