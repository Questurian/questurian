import type { CompletenessField, CompletenessFieldContext } from "./types";

export function getNightlifeCompletenessFields({
  locationDetail,
  source,
  nightlifeDetails,
  hasIdealFor,
  hasOperationHours,
  hasMedia,
}: CompletenessFieldContext): CompletenessField[] {
  return [
    { key: "name", label: "Name", present: Boolean(source.name?.trim() || nightlifeDetails.name) },
    { key: "sourceAddress", label: "Location", present: Boolean(source.address?.trim() || nightlifeDetails.location) },
    { key: "category", label: "Category", present: Boolean(locationDetail.category) },
    { key: "locationKey", label: "Location Key", present: Boolean(locationDetail.locationKey?.trim()) },
    { key: "district", label: "District", present: Boolean(locationDetail.district?.trim()) },
    {
      key: "coordinates",
      label: "Coordinates",
      present: locationDetail.coordinates?.lat != null && locationDetail.coordinates?.lng != null,
    },
    {
      key: "nightlife.clubType",
      label: "Club Type",
      present: Boolean(nightlifeDetails.clubType || locationDetail.type?.trim()),
    },
    { key: "idealFor", label: "Ideal For", present: hasIdealFor },
    { key: "nightlife.music", label: "Music", present: nightlifeDetails.music.length > 0 },
    { key: "nightlife.venueType", label: "Venue Type", present: Boolean(nightlifeDetails.venueType) },
    { key: "nightlife.venueSize", label: "Venue Size", present: Boolean(nightlifeDetails.venueSize) },
    { key: "nightlife.spaceLayout", label: "Space Layout", present: nightlifeDetails.spaceLayout.length > 0 },
    { key: "nightlife.vibe", label: "Vibe", present: nightlifeDetails.vibe.length > 0 },
    { key: "nightlife.peakHours", label: "Peak Hours", present: Boolean(nightlifeDetails.peakHours) },
    { key: "operationHours", label: "Hours", present: hasOperationHours },
    {
      key: "nightlife.priceTier",
      label: "Price Tier",
      present: Boolean(nightlifeDetails.priceTier || locationDetail.priceLevel?.trim()),
    },
    { key: "nightlife.musicFormat", label: "Music Format", present: nightlifeDetails.musicFormat.length > 0 },
    {
      key: "nightlife.touristPresence",
      label: "Tourist Presence",
      present: Boolean(nightlifeDetails.touristPresence),
    },
    { key: "nightlife.dressCode", label: "Dress Code", present: nightlifeDetails.dressCode.length > 0 },
    { key: "nightlife.energyLevel", label: "Energy Level", present: Boolean(nightlifeDetails.energyLevel) },
    {
      key: "nightlife.vipAndBottleService",
      label: "VIP/Bottle Service",
      present: Boolean(nightlifeDetails.vipAndBottleService),
    },
    { key: "nightlife.crowdProfile", label: "Crowd Profile", present: Boolean(nightlifeDetails.crowdProfile) },
    {
      key: "nightlife.daytimeRestaurant",
      label: "Daytime Restaurant",
      present: nightlifeDetails.daytimeRestaurant === "0" || nightlifeDetails.daytimeRestaurant === "1",
    },
    { key: "media", label: "Images/Instagram", present: hasMedia },
  ];
}
