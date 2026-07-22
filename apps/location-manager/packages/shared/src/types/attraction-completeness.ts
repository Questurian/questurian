export const ATTRACTION_COMPLETENESS_POLICY = [
  { key: "name", label: "Name", required: true },
  { key: "title", label: "Title", required: true },
  { key: "sourceAddress", label: "Address", required: true },
  { key: "category", label: "Category", required: true },
  { key: "locationKey", label: "Location Key", required: true },
  { key: "district", label: "District", required: true },
  { key: "countryCode", label: "Country Code", required: true },
  { key: "ianaTimeId", label: "Time Zone (IANA)", required: true },
  { key: "coordinates", label: "Coordinates", required: true },
  { key: "attractions.type", label: "Type", required: true },
  { key: "attractions.bookingRequired", label: "Booking Required", required: true },
  { key: "operationHours", label: "Hours", required: true },
  { key: "media", label: "Images/Instagram", required: true },
  { key: "website", label: "Website", required: false },
  { key: "phone", label: "Phone", required: false },
  { key: "attractions.pricing", label: "Pricing", required: false },
  { key: "bookingUrl", label: "Tickets URL", required: false },
] as const;

export type AttractionCompletenessFieldKey =
  (typeof ATTRACTION_COMPLETENESS_POLICY)[number]["key"];

export type AttractionCompletenessFacts = Record<
  AttractionCompletenessFieldKey,
  boolean
>;

export interface AttractionCompletenessField {
  key: AttractionCompletenessFieldKey;
  label: string;
  present: boolean;
}

export function getAttractionCompletenessFields(
  facts: AttractionCompletenessFacts,
  required: boolean
): AttractionCompletenessField[] {
  return ATTRACTION_COMPLETENESS_POLICY
    .filter((field) => field.required === required)
    .map((field) => ({
      key: field.key,
      label: field.label,
      present: facts[field.key],
    }));
}

export function isAttractionComplete(facts: AttractionCompletenessFacts): boolean {
  return ATTRACTION_COMPLETENESS_POLICY.every(
    (field) => !field.required || facts[field.key]
  );
}
