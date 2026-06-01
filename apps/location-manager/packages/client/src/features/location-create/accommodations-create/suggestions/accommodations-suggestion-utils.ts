import {
  ACCOMMODATIONS_SUGGESTION_FIELDS,
  CHECK_IN_TIME_OPTIONS,
  CHECK_OUT_TIME_OPTIONS,
  type AccommodationsOption,
} from "../../constants/accommodations-options";
import type { AiSuggestedField } from "../accommodations-create.types";

export const CORE_SUGGESTION_FIELDS: AiSuggestedField[] = ["type", "price"];
export const STAY_SUGGESTION_FIELDS: AiSuggestedField[] = [
  "perfectFor",
  "kidFriendly",
  "ac",
  "wifi",
  "extraGuestFee",
  "parking",
  "breakfastServed",
];
export const EXPERIENCE_SUGGESTION_FIELDS: AiSuggestedField[] = [
  "vibe",
  "workspace",
  "restaurant",
  "pool",
  "rooftopLounge",
  "jacuzzi",
  "gym",
];
export const DETAILS_SUGGESTION_FIELDS: AiSuggestedField[] = [
  "walkability",
  "checkInTime",
  "checkOutTime",
  "bookingUrl",
];
export const AUTO_AI_SUGGESTION_FIELDS: AiSuggestedField[] = [
  ...CORE_SUGGESTION_FIELDS,
  ...STAY_SUGGESTION_FIELDS,
  ...EXPERIENCE_SUGGESTION_FIELDS,
  ...DETAILS_SUGGESTION_FIELDS,
];

export function getSuggestionField(fieldKey: AiSuggestedField) {
  return ACCOMMODATIONS_SUGGESTION_FIELDS.find((field) => field.key === fieldKey);
}

export function getSuggestionFieldOptions(
  fieldKey: AiSuggestedField,
  locationTypes: Array<{ value: string; label: string }>
): AccommodationsOption[] {
  if (fieldKey === "type") {
    return locationTypes.map((option) => ({
      value: option.value,
      label: option.label,
      description: "Accommodation type from the configured taxonomy.",
    }));
  }
  if (fieldKey === "checkInTime") return [...CHECK_IN_TIME_OPTIONS];
  if (fieldKey === "checkOutTime") return [...CHECK_OUT_TIME_OPTIONS];

  const field = getSuggestionField(fieldKey);
  return field && "options" in field ? [...field.options] : [];
}

export function formatSuggestionValue(
  suggestion: string | string[] | null,
  options: AccommodationsOption[]
) {
  if (!suggestion) return "No suggestion";
  const labelsByValue = new Map(options.map((option) => [option.value, option.label]));
  const values = Array.isArray(suggestion) ? suggestion : [suggestion];
  return values.map((value) => labelsByValue.get(value) || value).join(", ");
}

export function validateClientSuggestion(
  suggestion: string | string[] | null,
  options: AccommodationsOption[],
  kind: "single" | "multi" | "url"
) {
  if (kind === "url") {
    if (typeof suggestion !== "string") return null;
    const trimmed = suggestion.trim();
    if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) return null;
    return trimmed;
  }

  const allowed = new Set(options.map((option) => option.value));
  if (kind === "multi") {
    if (!Array.isArray(suggestion)) return null;
    const validValues = Array.from(
      new Set(suggestion.filter((value): value is string => typeof value === "string" && allowed.has(value)))
    );
    return validValues.length > 0 ? validValues : null;
  }

  return typeof suggestion === "string" && allowed.has(suggestion) ? suggestion : null;
}
