import type { CompletenessField, CompletenessFieldContext } from "./types";

export function getAccommodationsCompletenessFields({
  locationDetail,
  contact,
  source,
  accommodationsDetails,
  hasMedia,
}: CompletenessFieldContext): CompletenessField[] {
  return [
    { key: "title", label: "Title", present: Boolean(locationDetail.title?.trim()) },
    { key: "name", label: "Name", present: Boolean(source.name?.trim() || accommodationsDetails.coreName) },
    { key: "sourceAddress", label: "Address", present: Boolean(source.address?.trim() || accommodationsDetails.address) },
    { key: "category", label: "Category", present: Boolean(locationDetail.category) },
    { key: "locationKey", label: "Location Key", present: Boolean(locationDetail.locationKey?.trim()) },
    { key: "district", label: "District", present: Boolean(locationDetail.district?.trim()) },
    {
      key: "coordinates",
      label: "Coordinates",
      present: locationDetail.coordinates?.lat != null && locationDetail.coordinates?.lng != null,
    },
    {
      key: "accommodations.type",
      label: "Type",
      present: Boolean(locationDetail.type?.trim() || accommodationsDetails.coreType),
    },
    {
      key: "accommodations.price",
      label: "Price",
      present: Boolean(locationDetail.priceLevel?.trim() || accommodationsDetails.corePrice),
    },
    { key: "accommodations.perfectFor", label: "Perfect For", present: accommodationsDetails.perfectFor.length > 0 },
    { key: "accommodations.kidFriendly", label: "Kid Friendly", present: accommodationsDetails.kidFriendly !== null },
    { key: "accommodations.ac", label: "AC", present: accommodationsDetails.ac !== null },
    { key: "accommodations.wifi", label: "WiFi", present: accommodationsDetails.wifi !== null },
    {
      key: "accommodations.extraGuestFee",
      label: "Extra Guest Fee",
      present: accommodationsDetails.extraGuestFee !== null,
    },
    { key: "accommodations.parking", label: "Parking", present: accommodationsDetails.parking.length > 0 },
    {
      key: "accommodations.breakfastServed",
      label: "Breakfast Served",
      present: accommodationsDetails.breakfastServed !== null,
    },
    { key: "accommodations.vibe", label: "Vibe", present: accommodationsDetails.vibe.length > 0 },
    { key: "accommodations.workspace", label: "Workspace", present: Boolean(accommodationsDetails.workspace) },
    { key: "accommodations.restaurant", label: "Restaurant", present: accommodationsDetails.restaurant !== null },
    { key: "accommodations.pool", label: "Pool", present: accommodationsDetails.pool.length > 0 },
    {
      key: "accommodations.rooftopLounge",
      label: "Rooftop Lounge",
      present: accommodationsDetails.rooftopLounge !== null,
    },
    { key: "accommodations.jacuzzi", label: "Jacuzzi", present: accommodationsDetails.jacuzzi.length > 0 },
    { key: "accommodations.gym", label: "Gym", present: Boolean(accommodationsDetails.gym) },
    { key: "accommodations.walkability", label: "Walkability", present: Boolean(accommodationsDetails.walkability) },
    { key: "accommodations.checkInTime", label: "Check-In", present: Boolean(accommodationsDetails.checkInTime) },
    { key: "accommodations.checkOutTime", label: "Check-Out", present: Boolean(accommodationsDetails.checkOutTime) },
    { key: "phone", label: "Phone", present: Boolean(contact.phoneNumber?.trim() || accommodationsDetails.phone) },
    { key: "website", label: "Website", present: Boolean(contact.website?.trim() || accommodationsDetails.websiteUrl) },
    { key: "media", label: "Images/Instagram", present: hasMedia },
  ];
}
