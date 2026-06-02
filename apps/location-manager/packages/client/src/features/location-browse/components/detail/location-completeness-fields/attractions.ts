import type { CompletenessField, CompletenessFieldContext } from "./types";

export function getAttractionsCompletenessFields({
  locationDetail,
  source,
  attractionsDetails,
  hasOperationHours,
  hasMedia,
}: CompletenessFieldContext): CompletenessField[] {
  return [
    { key: "name", label: "Name", present: Boolean(source.name?.trim()) },
    { key: "sourceAddress", label: "Address", present: Boolean(source.address?.trim()) },
    { key: "category", label: "Category", present: Boolean(locationDetail.category) },
    { key: "locationKey", label: "Location Key", present: Boolean(locationDetail.locationKey?.trim()) },
    { key: "district", label: "District", present: Boolean(locationDetail.district?.trim()) },
    {
      key: "coordinates",
      label: "Coordinates",
      present: locationDetail.coordinates?.lat != null && locationDetail.coordinates?.lng != null,
    },
    {
      key: "attractions.type",
      label: "Type",
      present: Boolean(locationDetail.type?.trim() || attractionsDetails.attractionType),
    },
    {
      key: "attractions.pricing",
      label: "Pricing",
      present: Boolean(locationDetail.priceLevel?.trim() || attractionsDetails.pricing),
    },
    {
      key: "attractions.bookingRequired",
      label: "Booking Required",
      present: attractionsDetails.bookingRequired !== null,
    },
    {
      key: "operationHours",
      label: "Hours",
      present: Boolean(hasOperationHours || attractionsDetails.hasVisitHours),
    },
    { key: "media", label: "Images/Instagram", present: hasMedia },
  ];
}
