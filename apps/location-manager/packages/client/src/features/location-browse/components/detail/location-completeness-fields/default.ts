import type { CompletenessField, CompletenessFieldContext } from "./types";

export function getDefaultCompletenessFields({
  locationDetail,
  contact,
  source,
  hasIdealFor,
  hasCuisines,
  hasOperationHours,
  hasMedia,
}: CompletenessFieldContext): CompletenessField[] {
  const baseFields = [
    { key: "title", label: "Title", present: Boolean(locationDetail.title?.trim()) },
    { key: "name", label: "Name", present: Boolean(source.name?.trim()) },
    { key: "sourceAddress", label: "Source Address", present: Boolean(source.address?.trim()) },
    { key: "category", label: "Category", present: Boolean(locationDetail.category) },
    {
      key: "type",
      label: locationDetail.category === "dining" ? "Type of Establishment" : "Type",
      present: Boolean(locationDetail.type?.trim()),
    },
    { key: "locationKey", label: "Location Key", present: Boolean(locationDetail.locationKey?.trim()) },
    { key: "district", label: "District", present: Boolean(locationDetail.district?.trim()) },
    { key: "slug", label: "Slug", present: Boolean(locationDetail.slug?.trim()) },
    {
      key: "coordinates",
      label: "Coordinates",
      present: locationDetail.coordinates?.lat != null && locationDetail.coordinates?.lng != null,
    },
    { key: "ianaTimeId", label: "Time Zone (IANA)", present: Boolean(locationDetail.ianaTimeId?.trim()) },
    { key: "countryCode", label: "Country Code", present: Boolean(contact.countryCode?.trim()) },
    { key: "website", label: "Website", present: Boolean(contact.website?.trim()) },
    { key: "contactUrl", label: "Google URL", present: Boolean(contact.url?.trim()) },
  ];

  const categoryFields = [
    { key: "idealFor", label: "Ideal For", present: hasIdealFor },
    { key: "cuisines", label: "Cuisines", present: hasCuisines },
    { key: "priceLevel", label: "Price Level", present: Boolean(locationDetail.priceLevel?.trim()) },
    { key: "operationHours", label: "Hours", present: hasOperationHours },
  ];

  return [
    ...baseFields,
    ...categoryFields,
    { key: "media", label: "Images/Instagram", present: hasMedia },
  ];
}
